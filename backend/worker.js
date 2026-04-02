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
import { isRedisTcpConfigured, pingRedisTcp, shutdownRedisTcp } from "./src/lib/redis-tcp.js";
import { startWorker, shutdownWorker } from "./src/lib/jobs/worker.js";
import { shutdownQueue } from "./src/lib/jobs/queue.js";
import { probeRedisConnection } from "./src/lib/redis.js";
import { stopEventBus } from "./src/lib/events.js";
import { logEvent } from "./src/lib/logger.js";

async function main() {
  logEvent("WORKER_START", "Worker started", {
    entry: "backend/worker.js",
  });

  if (!isRedisTcpConfigured()) {
    logEvent("WORKER_FATAL", "Redis TCP URL is not configured", {
      envKeys: ["REDIS_TCP_URL", "REDIS_URL"],
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
  logEvent("WORKER_RUNNING", "Worker running and waiting for jobs", {});

  /* ── Graceful shutdown ── */
  const shutdown = async (signal) => {
    logEvent("WORKER_SHUTDOWN", "Worker shutting down", {
      signal,
    });

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
