/**
 * BullMQ queues stub — disabled for Vercel Serverless.
 *
 * All exports are safe no-ops.
 */

export function getJobsQueue() {
  return null;
}

export function enqueueJob(name) {
  console.warn(`[queues] skipped job ${name} — BullMQ disabled in serverless`);
  return Promise.resolve(null);
}
