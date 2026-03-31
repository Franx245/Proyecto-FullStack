/**
 * BullMQ queues — central registry.
 *
 * All queues share the TCP Redis connection.
 * Queues are created lazily to avoid connecting when Redis is down.
 */
import { Queue } from "bullmq";
import { redisConnection, isRedisTcpConfigured } from "./redis-tcp.js";

/** @type {Queue | null} */
let _jobsQueue = null;

export function getJobsQueue() {
  if (!_jobsQueue && isRedisTcpConfigured()) {
    _jobsQueue = new Queue("duelvault-jobs", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600 * 24, count: 500 },
        removeOnFail: { age: 3600 * 24 * 7, count: 1000 },
      },
    });
  }
  return _jobsQueue;
}

/** Convenience: add a named job with data + optional overrides. */
export function enqueueJob(name, data = {}, opts = {}) {
  const queue = getJobsQueue();
  if (!queue) {
    console.warn(`[queues] skipped job ${name} — Redis TCP not available`);
    return Promise.resolve(null);
  }
  return queue.add(name, data, opts);
}
