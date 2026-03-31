/**
 * Job: update-stock
 * Updates stock for specific cards after order events.
 * Publishes realtime stock-update events per card.
 */
import { prisma } from "../prisma.js";
import { invalidateCardCache } from "../cache-invalidation.js";
import { publishEvent } from "../events.js";

export async function handleUpdateStock(jobData) {
  const { items, orderId, action } = jobData;

  if (!Array.isArray(items) || items.length === 0) {
    return { skipped: true, reason: "no items" };
  }

  const normalizedItems = Array.from(
    (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
      const cardId = Number(item?.cardId);
      const quantity = Number(item?.quantity);
      if (!Number.isFinite(cardId) || !Number.isFinite(quantity) || quantity <= 0) {
        return accumulator;
      }

      accumulator.set(cardId, (accumulator.get(cardId) || 0) + quantity);
      return accumulator;
    }, new Map())
  ).map(([cardId, quantity]) => ({ cardId, quantity }));

  if (!normalizedItems.length) {
    return { skipped: true, reason: "no_valid_items" };
  }

  const results = [];

  for (const item of normalizedItems) {
    const { cardId, quantity } = item;

    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true, stock: true, name: true, lowStockThreshold: true },
    });

    if (!card) {
      results.push({ cardId, status: "not_found" });
      continue;
    }

    const isLowStock = card.stock <= (card.lowStockThreshold ?? 2);

    await invalidateCardCache(cardId);

    publishEvent("stock-update", {
      cardId,
      cardName: card.name,
      stock: card.stock,
      isLowStock,
      orderId,
      action,
    });

    results.push({ cardId, stock: card.stock, isLowStock });
  }

  return { processed: results.length, results, orderId, action };
}
