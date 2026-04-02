/**
 * BullMQ Worker — processes background jobs.
 *
 * Job names match the same names used in enqueueJob().
 * Each handler is idempotent and safe to retry.
 */
import { Worker } from "bullmq";
import { createBullMQConnection, isRedisTcpConfigured } from "../redis-tcp.js";
import { logEvent } from "../logger.js";
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
  "reconcile-mercadopago-payment": async (data) => {
    const { processQueuedMercadoPagoPayment } = await import("./order-jobs.js");
    return processQueuedMercadoPagoPayment(data);
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
    logEvent("WORKER_DISABLED", "Redis TCP not configured; worker disabled", {
      mode: "inline-fallback",
    });
    return null;
  }

  const connection = createBullMQConnection();

  worker = new Worker(
    getQueueName(),
    async (job) => processJob(job.name, job.data),
    {
      connection,
      concurrency: 3,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on("ready", () => {
    logEvent("WORKER_READY", "Connected to Redis", {
      queue: getQueueName(),
    });
  });

  worker.on("active", (job) => {
    logEvent("JOB_RECEIVED", "JOB RECEIVED", {
      name: job.name,
      id: job.id,
      attempt: job.attemptsMade + 1,
      data: job.data,
    });
  });

  worker.on("completed", (job) => {
    logEvent("JOB_DONE", "JOB DONE", {
      name: job?.name,
      id: job?.id,
    });
  });

  worker.on("failed", (job, err) => {
    logEvent("JOB_FAILED", "JOB FAILED", {
      name: job?.name,
      id: job?.id,
      error: err?.message,
      stack: err?.stack,
    });
  });

  worker.on("error", (err) => {
    logEvent("WORKER_ERROR", "Worker error", {
      error: err,
    });
  });

  logEvent("WORKER_STARTED", "BullMQ worker started", {
    queue: getQueueName(),
    concurrency: 3,
  });
  return worker;
}

export async function shutdownWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    logEvent("WORKER_SHUTDOWN", "Worker shut down", {
      queue: getQueueName(),
    });
  }
}
