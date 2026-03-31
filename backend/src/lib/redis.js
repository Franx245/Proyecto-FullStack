import "./load-env.js";
import { Redis } from "@upstash/redis";
import { getSharedRedisClient, isRedisTcpConfigured } from "./redis-tcp.js";

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

function createTcpRedisAdapter() {
  if (!isRedisTcpConfigured()) {
    return null;
  }

  const client = getSharedRedisClient();

  function normalizeZRangeResponse(response, withScores) {
    if (!withScores || !Array.isArray(response)) {
      return response;
    }

    const entries = [];
    for (let index = 0; index < response.length; index += 2) {
      entries.push([response[index], response[index + 1]]);
    }

    return entries;
  }

  return {
    get(key) {
      return client.get(key);
    },
    set(key, value, options = {}) {
      const ttlSeconds = Number(options?.ex || 0);
      if (ttlSeconds > 0) {
        return client.set(key, value, "EX", ttlSeconds);
      }

      return client.set(key, value);
    },
    scan(cursor, options = {}) {
      const args = [String(cursor || "0")];

      if (options.match) {
        args.push("MATCH", String(options.match));
      }

      if (options.count) {
        args.push("COUNT", String(options.count));
      }

      return client.scan(...args);
    },
    del(...keys) {
      return client.del(...keys);
    },
    incr(key) {
      return client.incr(key);
    },
    incrby(key, value) {
      return client.incrby(key, value);
    },
    ttl(key) {
      return client.ttl(key);
    },
    expire(key, seconds) {
      return client.expire(key, seconds);
    },
    zincrby(key, increment, member) {
      return client.zincrby(key, increment, member);
    },
    async zrange(key, start, stop, options = {}) {
      const args = [key, start, stop];

      if (options.rev) {
        args.push("REV");
      }

      if (options.withScores) {
        args.push("WITHSCORES");
      }

      const response = await client.zrange(...args);
      return normalizeZRangeResponse(response, options.withScores);
    },
    pipeline() {
      return client.pipeline();
    },
    ping() {
      return client.ping();
    },
  };
}

function resolveRedisBackendName() {
  if (redisUrl && redisToken) {
    return "upstash-rest";
  }

  if (isRedisTcpConfigured()) {
    return "tcp";
  }

  return "disabled";
}

function createRedisClient() {
  const backend = resolveRedisBackendName();

  if (backend === "upstash-rest") {
    return createUpstashRedisClient();
  }

  if (backend === "tcp") {
    return createTcpRedisAdapter();
  }

  return null;
}

const resolvedRedisBackend = resolveRedisBackendName();

export const redisBackend = globalForRedis.__duelvaultRedisBackend ?? resolvedRedisBackend;
export const redis = globalForRedis.__duelvaultRedis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
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