#!/usr/bin/env node
/**
 * Standalone BullMQ worker process.
 *
 * Run as a separate Railway service:
 *   node backend/worker.js
 *
 * Requires REDIS_URL (TCP) to be set.
 * Shares the same job handlers as the API's inline fallback.
 */
import "./src/lib/load-env.js";
import { isRedisTcpConfigured, pingRedisTcp, shutdownRedisTcp } from "./src/lib/redis-tcp.js";
import { startWorker, shutdownWorker } from "./src/lib/jobs/worker.js";
import { shutdownQueue } from "./src/lib/jobs/queue.js";
import { probeRedisConnection } from "./src/lib/redis.js";
import { stopEventBus } from "./src/lib/events.js";

async function main() {
  console.log("[worker-process] starting standalone worker...");

  if (!isRedisTcpConfigured()) {
    console.error("[worker-process] REDIS_URL is not set — cannot start worker");
    process.exit(1);
  }

  const tcpOk = await pingRedisTcp();
  if (!tcpOk) {
    console.error("[worker-process] Redis TCP ping failed — cannot start worker");
    process.exit(1);
  }
  console.log("[worker-process] redis-tcp ready");

  const redisCache = await probeRedisConnection();
  console.log(`[worker-process] cache backend=${redisCache.backend} ready=${redisCache.ok}`);

  const worker = startWorker();
  if (!worker) {
    console.error("[worker-process] failed to start worker");
    process.exit(1);
  }

  console.log("[worker-process] worker running — waiting for jobs");

  /* ── Graceful shutdown ── */
  const shutdown = async (signal) => {
    console.log(`[worker-process] ${signal} — shutting down...`);

    await Promise.allSettled([
      shutdownWorker(),
      shutdownQueue(),
      stopEventBus(),
      shutdownRedisTcp(),
    ]);

    console.log("[worker-process] clean shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker-process] fatal:", err);
  process.exit(1);
});
