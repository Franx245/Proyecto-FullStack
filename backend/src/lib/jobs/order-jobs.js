/**
 * Order-related background jobs.
 *
 * These are executed by the BullMQ worker or inline when Redis TCP is unavailable.
 */
import { prisma, withDatabaseConnection } from "../prisma.js";
import { invalidateOrderRelatedCache } from "../cache-invalidation.js";
import { publishEvent } from "../events.js";

/**
 * Expire pending orders whose `expires_at` has passed.
 * Idempotent: re-fetches status inside the transaction to skip already-expired orders.
 * @param {{ batchSize?: number }} [data]
 */
export async function expirePendingOrdersJob(data = {}) {
  const batchSize = data?.batchSize || 5;
  const now = new Date();

  const orders = await withDatabaseConnection(() =>
    prisma.order.findMany({
      where: {
        status: { in: ["PENDING_PAYMENT", "FAILED"] },
        expires_at: { not: null, lte: now },
      },
      select: { id: true, items: { select: { cardId: true, quantity: true } } },
      take: batchSize * 2,
    }),
  );

  if (!orders.length) return { expired_count: 0 };

  let expiredCount = 0;
  for (const order of orders) {
    try {
      await withDatabaseConnection(() =>
        prisma.$transaction(async (tx) => {
          // Re-check status inside transaction to prevent double-expiry
          const fresh = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (!fresh || !["PENDING_PAYMENT", "FAILED"].includes(fresh.status)) {
            return; // Already expired/cancelled/completed — skip
          }

          for (const item of order.items) {
            await tx.card.update({
              where: { id: item.cardId },
              data: { stock: { increment: item.quantity } },
            });
          }

          await tx.order.update({
            where: { id: order.id },
            data: { status: "EXPIRED" },
          });
        }),
      );

      expiredCount++;

      await invalidateOrderRelatedCache(order.items);
      publishEvent("order-update", {
        orderId: order.id,
        previousStatus: "PENDING_PAYMENT",
        newStatus: "EXPIRED",
      });
    } catch (err) {
      console.error(`[order-jobs] failed to expire order ${order.id}:`, err.message);
    }
  }

  return { expired_count: expiredCount };
}

/**
 * Post-checkout side-effects: cache invalidation + event publish.
 * Fired asynchronously after checkout response is sent.
 * @param {{ orderId: number, items: { cardId: number, quantity: number }[] }} data
 */
export async function processOrderPostCheckout(data) {
  const { orderId, items } = data;

  await invalidateOrderRelatedCache(items);

  publishEvent("new-order", {
    orderId,
    itemCount: items.length,
  });

  return { ok: true, orderId };
}

/**
 * Per-card stock cache sync — invalidates cache for specific card IDs.
 * @param {{ cardIds: number[] }} data
 */
export async function syncStockCache(data) {
  const { cardIds } = data;

  if (!cardIds?.length) return { ok: true };

  await invalidateOrderRelatedCache(
    cardIds.map((cardId) => ({ cardId, quantity: 0 })),
  );

  return { ok: true, synced: cardIds.length };
}
