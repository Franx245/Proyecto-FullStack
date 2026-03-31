/**
 * Job scheduler — registers repeatable jobs via BullMQ.
 *
 * Call `registerScheduledJobs()` once at startup.
 */
import { enqueueJob, getJobsQueue } from "./queues.js";

export async function registerScheduledJobs() {
  const queue = getJobsQueue();
  if (!queue) {
    console.warn("[scheduler] skipped — Redis TCP not available");
    return;
  }

  // Cleanup cache every 6 hours
  await queue.upsertJobScheduler(
    "cleanup-cache-scheduler",
    { every: 1000 * 60 * 60 * 6 },
    { name: "cleanup-cache", data: {} }
  );

  // Recompute prices every 12 hours
  await queue.upsertJobScheduler(
    "recompute-prices-scheduler",
    { every: 1000 * 60 * 60 * 12 },
    { name: "recompute-prices", data: {} }
  );

  await queue.upsertJobScheduler(
    "warm-public-cache-scheduler",
    { every: 1000 * 60 * 15 },
    { name: "warm-public-cache", data: {} }
  );

  await queue.upsertJobScheduler(
    "compute-card-rankings-scheduler",
    { every: 1000 * 60 * 30 },
    { name: "compute-card-rankings", data: {} }
  );

  console.info("[scheduler] repeatable jobs registered");
}

/**
 * Enqueue a one-shot sync-cards job (e.g., triggered from admin).
 */
export function scheduleSyncCards() {
  return enqueueJob("sync-cards", {}, {
    jobId: "sync-cards:catalog",
    priority: 1,
    removeOnComplete: true,
  });
}

/**
 * Enqueue stock update after checkout / order status change.
 */
export function scheduleStockUpdate(items, orderId, action = "checkout") {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      cardId: Number(item?.cardId),
      quantity: Number(item?.quantity),
    }))
    .filter((item) => Number.isFinite(item.cardId) && Number.isFinite(item.quantity) && item.quantity > 0)
    .sort((left, right) => left.cardId - right.cardId);
  const jobSuffix = normalizedItems.map((item) => `${item.cardId}x${item.quantity}`).join("-") || "empty";

  return enqueueJob("update-stock", { items, orderId, action }, {
    jobId: `update-stock:${action}:${Number(orderId) || "na"}:${jobSuffix}`,
    priority: 2,
  });
}

export function scheduleWarmPublicCache() {
  return enqueueJob("warm-public-cache", {}, {
    jobId: `warm-public-cache:${Math.floor(Date.now() / (1000 * 60 * 15))}`,
    priority: 3,
  });
}
