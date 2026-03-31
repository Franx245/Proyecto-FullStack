/**
 * Redis TCP stub — disabled for Vercel Serverless.
 *
 * BullMQ + pub/sub require persistent TCP connections incompatible with
 * serverless functions.  All exports are safe no-ops so existing call-sites
 * don't break.
 */

export const redisConnection = null;

export function createRedisClient() {
  return null;
}

export function getSharedRedisClient() {
  return null;
}

export async function pingRedisTcp() {
  return false;
}

export function isRedisTcpConfigured() {
  return false;
}
