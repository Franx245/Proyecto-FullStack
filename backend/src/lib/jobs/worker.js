/**
 * BullMQ Worker — processes background jobs.
 *
 * Job names match the same names used in enqueueJob().
 * Each handler is idempotent and safe to retry.
 */
import { Worker } from "bullmq";
import { createBullMQConnection, isRedisTcpConfigured } from "../redis-tcp.js";
import { getQueueName } from "./queue.js";
import { handleRecomputePrices } from "./recompute-prices.js";
import { handleComputeCardRankings } from "./compute-card-rankings.js";
import { handleWarmPublicCache } from "./warm-public-cache.js";

/** @type {Worker | null} */
let worker = null;

/** @type {Record<string, (data: unknown) => Promise<unknown>>} */
const JOB_HANDLERS = {
  "expire-pending-orders": async (data) => {
    // Dynamic import to avoid circular dependency with server.js
    const { expirePendingOrdersJob } = await import("./order-jobs.js");
    return expirePendingOrdersJob(data);
  },
  "recompute-prices": async (data) => handleRecomputePrices(data),
  "compute-rankings": async () => handleComputeCardRankings(),
  "warm-cache": async () => handleWarmPublicCache(),
  "process-order-post-checkout": async (data) => {
    const { processOrderPostCheckout } = await import("./order-jobs.js");
    return processOrderPostCheckout(data);
  },
  "sync-stock-cache": async (data) => {
    const { syncStockCache } = await import("./order-jobs.js");
    return syncStockCache(data);
  },
};

/**
 * Process a job by name — used both by the BullMQ worker and as inline fallback.
 * @param {string} jobName
 * @param {unknown} data
 */
export async function processJob(jobName, data) {
  const handler = JOB_HANDLERS[jobName];
  if (!handler) {
    throw new Error(`Unknown job: ${jobName}`);
  }
  return handler(data);
}

/** Start the BullMQ worker. Call once on server startup. */
export function startWorker() {
  if (worker) return worker;
  if (!isRedisTcpConfigured()) {
    console.info("[worker] Redis TCP not configured — worker disabled (inline fallback)");
    return null;
  }

  const connection = createBullMQConnection();
  if (!connection) return null;

  worker = new Worker(
    getQueueName(),
    async (job) => {
      const t0 = Date.now();
      console.info(`[worker] processing ${job.name} (id=${job.id}, attempt=${job.attemptsMade + 1})`);

      try {
        const result = await processJob(job.name, job.data);
        console.info(`[worker] completed ${job.name} (id=${job.id}) in ${Date.now() - t0}ms`);
        return result;
      } catch (err) {
        console.error(`[worker] failed ${job.name} (id=${job.id}):`, err.message);
        throw err;
      }
    },
    {
      connection,
      concurrency: 3,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.name} (id=${job?.id}) failed permanently:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[worker] error:", err.message);
  });

  console.info("[worker] BullMQ worker started");
  return worker;
}

export async function shutdownWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    console.info("[worker] shut down");
  }
}
