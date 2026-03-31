/**
 * BullMQ Worker — processes all jobs from the "duelvault:jobs" queue.
 *
 * Call `startWorker()` once from server startup.
 * Call `stopWorker()` on graceful shutdown.
 */
import { Worker } from "bullmq";
import { redisConnection } from "./redis-tcp.js";
import { handleSyncCards } from "./jobs/sync-cards.js";
import { handleUpdateStock } from "./jobs/update-stock.js";
import { handleRecomputePrices } from "./jobs/recompute-prices.js";
import { handleCleanupCache } from "./jobs/cleanup-cache.js";
import { handleWarmPublicCache } from "./jobs/warm-public-cache.js";
import { handleComputeCardRankings } from "./jobs/compute-card-rankings.js";
import { recordWorkerMetric } from "./metrics.js";

/** @type {Worker | null} */
let worker = null;

const JOB_HANDLERS = {
  "sync-cards": handleSyncCards,
  "update-stock": handleUpdateStock,
  "recompute-prices": handleRecomputePrices,
  "cleanup-cache": handleCleanupCache,
  "warm-public-cache": handleWarmPublicCache,
  "compute-card-rankings": handleComputeCardRankings,
};

async function processJob(job) {
  const handler = JOB_HANDLERS[job.name];
  if (!handler) {
    throw new Error(`Unknown job: ${job.name}`);
  }

  console.info(`[worker] processing ${job.name} (id=${job.id})`);
  const start = Date.now();

  try {
    const result = await handler(job.data);
    await recordWorkerMetric({ jobName: job.name, status: "completed", durationMs: Date.now() - start });
    console.info(`[worker] completed ${job.name} in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    await recordWorkerMetric({ jobName: job.name, status: "failed", durationMs: Date.now() - start });
    console.error(`[worker] failed ${job.name}`, error.message);
    throw error;
  }
}

export function startWorker() {
  if (worker) {
    return worker;
  }

  worker = new Worker("duelvault-jobs", processJob, {
    connection: redisConnection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.name} failed after ${job?.attemptsMade} attempts:`, error.message);
  });

  worker.on("error", (error) => {
    console.error("[worker] error:", error.message);
  });

  console.info("[worker] started — listening on duelvault:jobs");
  return worker;
}

export async function stopWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    console.info("[worker] stopped");
  }
}
