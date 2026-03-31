/**
 * Job scheduler stub — disabled for Vercel Serverless.
 *
 * BullMQ repeatable jobs require a persistent process.
 * All exports are safe no-ops.
 */

export async function registerScheduledJobs() {}

export function scheduleSyncCards() {
  return Promise.resolve(null);
}

export function scheduleStockUpdate() {
  return Promise.resolve(null);
}

export function scheduleWarmPublicCache() {
  return Promise.resolve(null);
}
