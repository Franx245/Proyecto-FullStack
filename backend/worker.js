#!/usr/bin/env node
/**
 * Standalone BullMQ worker process.
 *
 * Run as a separate Railway service:
 *   node backend/worker.js
 *
 * Requires REDIS_TCP_URL (or REDIS_URL) to be set.
 * Shares the same job handlers as the API's inline fallback.
 */
import "./src/lib/load-env.js";
import { redisConfig } from "./config/env.js";
import { isRedisTcpConfigured, pingRedisTcp, shutdownRedisTcp } from "./src/lib/redis-tcp.js";
import { startWorker, shutdownWorker } from "./src/lib/jobs/worker.js";
import { enqueueJob, shutdownQueue } from "./src/lib/jobs/queue.js";
import { probeRedisConnection } from "./src/lib/redis.js";
import { stopEventBus } from "./src/lib/events.js";
import { logEvent } from "./src/lib/logger.js";

const EXPIRE_PENDING_ORDERS_INTERVAL_MS = 5 * 60 * 1000;

function maskConnectionUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsed = new URL(rawValue);
    const auth = parsed.username ? `${parsed.username}:***@` : "";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${auth}${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return rawValue;
  }
}

function resolveRedisTargetForLogs() {
  if (!redisConfig.target) {
    return "";
  }

  return maskConnectionUrl(redisConfig.target);
}

/** @type {NodeJS.Timeout | null} */
let expirePendingOrdersInterval = null;

async function scheduleExpirePendingOrdersJob(source) {
  const scheduleSlot = Math.floor(Date.now() / EXPIRE_PENDING_ORDERS_INTERVAL_MS);
  const jobId = `expire-pending-orders-${scheduleSlot}`;

  try {
    const job = await enqueueJob(
      "expire-pending-orders",
      { source },
      { jobId },
    );

    logEvent("EXPIRE_ORDERS_JOB_ENQUEUED", "Expire pending orders job enqueued", {
      source,
      jobId: job?.id || jobId,
    });
  } catch (error) {
    logEvent("JOB_FAILED", "Failed to enqueue expire pending orders job", {
      source,
      jobId,
      error,
    });
  }
}

function startExpirePendingOrdersLoop() {
  if (expirePendingOrdersInterval) {
    return;
  }

  void scheduleExpirePendingOrdersJob("worker_startup");

  expirePendingOrdersInterval = setInterval(() => {
    void scheduleExpirePendingOrdersJob("worker_interval");
  }, EXPIRE_PENDING_ORDERS_INTERVAL_MS);
  expirePendingOrdersInterval.unref?.();

  logEvent("EXPIRE_ORDERS_LOOP_START", "Expire pending orders loop started", {
    intervalMs: EXPIRE_PENDING_ORDERS_INTERVAL_MS,
  });
}

function stopExpirePendingOrdersLoop() {
  if (!expirePendingOrdersInterval) {
    return;
  }

  clearInterval(expirePendingOrdersInterval);
  expirePendingOrdersInterval = null;

  logEvent("EXPIRE_ORDERS_LOOP_STOP", "Expire pending orders loop stopped");
}

async function main() {
  logEvent("WORKER_START", "Worker started", {
    entry: "backend/worker.js",
    envTargets: {
      databaseUrl: maskConnectionUrl(process.env.DATABASE_URL),
      directUrl: maskConnectionUrl(process.env.DIRECT_URL),
      redisUrl: resolveRedisTargetForLogs(),
      redisRestUrl: maskConnectionUrl(process.env.UPSTASH_REDIS_REST_URL),
    },
  });

  if (!isRedisTcpConfigured()) {
    logEvent("WORKER_FATAL", "Redis TCP URL is not configured", {
      envKeys: ["REDIS_HOST", "REDIS_PORT", "REDIS_TCP_URL", "REDIS_URL"],
    });
    process.exit(1);
  }

  const tcpOk = await pingRedisTcp();
  if (!tcpOk) {
    logEvent("WORKER_FATAL", "Redis TCP ping failed", {});
    process.exit(1);
  }

  const redisCache = await probeRedisConnection();
  logEvent("WORKER_CACHE_STATUS", "Cache backend probed", {
    backend: redisCache.backend,
    ready: redisCache.ok,
  });

  const worker = startWorker();
  if (!worker) {
    logEvent("WORKER_FATAL", "Failed to start worker", {});
    process.exit(1);
  }

  await worker.waitUntilReady();
  logEvent("WORKER_READY", "Connected to Redis", {
    entry: "backend/worker.js",
  });
  startExpirePendingOrdersLoop();
  logEvent("WORKER_RUNNING", "Worker running and waiting for jobs", {});

  /* ── Graceful shutdown ── */
  const shutdown = async (signal) => {
    logEvent("WORKER_SHUTDOWN", "Worker shutting down", {
      signal,
    });

    stopExpirePendingOrdersLoop();

    await Promise.allSettled([
      shutdownWorker(),
      shutdownQueue(),
      stopEventBus(),
      shutdownRedisTcp(),
    ]);

    logEvent("WORKER_SHUTDOWN", "Worker shutdown complete", {
      signal,
    });
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logEvent("WORKER_FATAL", "Worker process crashed", {
    error: err,
  });
  process.exit(1);
});
