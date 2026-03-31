import "./load-env.js";
import { Redis } from "@upstash/redis";

const redisUrl = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
const redisToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const globalForRedis = globalThis;

function createUpstashRedisClient() {
  if (!redisUrl || !redisToken) {
    return null;
  }

  return new Redis({
    url: redisUrl,
    token: redisToken,
  });
}

function resolveRedisBackendName() {
  if (redisUrl && redisToken) {
    return "upstash-rest";
  }

  return "disabled";
}

function createRedisClient() {
  if (redisUrl && redisToken) {
    return createUpstashRedisClient();
  }

  return null;
}

const resolvedRedisBackend = resolveRedisBackendName();

export const redisBackend = globalForRedis.__duelvaultRedisBackend ?? resolvedRedisBackend;
export const redis = globalForRedis.__duelvaultRedis ?? createRedisClient();

/* Singleton: store in globalThis for both dev and production (serverless). */
if (!globalForRedis.__duelvaultRedis) {
  globalForRedis.__duelvaultRedis = redis;
  globalForRedis.__duelvaultRedisBackend = redisBackend;
}

export function isRedisEnabled() {
  return Boolean(redis);
}

export function getRedisBackendName() {
  return redisBackend;
}

export async function probeRedisConnection() {
  if (!redis) {
    return {
      ok: false,
      backend: redisBackend,
    };
  }

  try {
    const response = await redis.ping();
    return {
      ok: response === "PONG",
      backend: redisBackend,
    };
  } catch (error) {
    return {
      ok: false,
      backend: redisBackend,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}