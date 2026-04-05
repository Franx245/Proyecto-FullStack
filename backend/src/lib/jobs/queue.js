/**
 * BullMQ job queue — powered by Railway Redis (TCP).
 *
 * Gracefully degrades: if REDIS_URL is not set, enqueue() runs the job
 * inline (synchronous fallback for serverless or dev without Redis TCP).
 */
import { Queue } from "bullmq";
import { workerMode } from "../../../config/env.js";
import { getQueueConnection, isRedisTcpConfigured } from "../redis-tcp.js";
import { logEvent } from "../logger.js";

/** @type {Queue | null} */
let jobQueue = null;

const QUEUE_NAME = "duelvault-jobs";

function getQueue() {
  if (jobQueue) return jobQueue;
  if (!isRedisTcpConfigured()) return null;

  const connection = getQueueConnection();
  if (!connection) return null;

  jobQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });

  return jobQueue;
}

/**
 * Enqueue a job. Falls back to inline execution if Redis TCP is unavailable.
 *
 * When `opts.jobId` is provided BullMQ de-duplicates: a second add with the
 * same jobId while the first is still in the queue is silently ignored.
 *
 * @param {string} jobName
 * @param {Record<string, unknown>} data
 * @param {{ priority?: number, delay?: number, jobId?: string }} [opts]
 */
export async function enqueueJob(jobName, data, opts = {}) {
  const queue = getQueue();

  if (!queue) {
    if (workerMode === "external") {
      console.warn("⚠️ Worker externo requerido, jobs no procesados", {
        jobName,
        workerMode,
      });
      logEvent("WORKER_EXTERNAL_REQUIRED", "Redis unavailable and workerMode=external; job was not processed", {
        jobName,
        options: opts,
        workerMode,
      });
      return null;
    }

    logEvent("USING_INLINE_FALLBACK", "Redis TCP unavailable; running job inline", {
      jobName,
      options: opts,
    });
    const { processJob } = await import("./worker.js");
    await processJob(jobName, data);
    return null;
  }

  logEvent("USING_BULLMQ", "Redis TCP configured; enqueuing job", {
    jobName,
    options: opts,
  });

  const job = await queue.add(jobName, data, {
    priority: opts.priority,
    delay: opts.delay,
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
  });

  logEvent("QUEUE_JOB_ADDED", "Job added to BullMQ", {
    jobName,
    id: job.id,
    priority: opts.priority ?? null,
    delay: opts.delay ?? 0,
    jobId: opts.jobId ?? null,
  });
  return job;
}

export function getQueueName() {
  return QUEUE_NAME;
}

export async function shutdownQueue() {
  if (jobQueue) {
    await jobQueue.close();
    jobQueue = null;
  }
}
