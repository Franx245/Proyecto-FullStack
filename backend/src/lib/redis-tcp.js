/**
 * Redis TCP connection for BullMQ + pub/sub.
 *
 * Upstash REST (existing redis.js) stays for cache.
 * This module provides raw TCP connections required by BullMQ and pub/sub.
 *
 * Env vars:
 *   REDIS_HOST     – default "127.0.0.1"
 *   REDIS_PORT     – default 6379
 *   REDIS_PASSWORD – optional
 *   REDIS_TCP_URL  – full redis:// URI (overrides host/port/password)
 */
import "./load-env.js";
import IORedis from "ioredis";

const REDIS_TCP_URL = String(process.env.REDIS_TCP_URL || "").trim();
const REDIS_HOST = String(process.env.REDIS_HOST || "127.0.0.1").trim();
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || "").trim() || undefined;

function buildConnectionOptions() {
  if (REDIS_TCP_URL) {
    return REDIS_TCP_URL;
  }

  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,   // required by BullMQ
    enableReadyCheck: false,
  };
}

/** Shared connection options object for BullMQ Queue / Worker / QueueEvents */
export const redisConnection = REDIS_TCP_URL
  ? REDIS_TCP_URL
  : {
    host: REDIS_HOST,
    port: REDIS_PORT,
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null,
  };

/**
 * Create a new IORedis instance.
 * Each BullMQ Queue/Worker creates its own; pub/sub needs dedicated instances.
 */
export function createRedisClient(overrides = {}) {
  const opts = buildConnectionOptions();

  if (typeof opts === "string") {
    return new IORedis(opts, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...overrides,
    });
  }

  return new IORedis({ ...opts, ...overrides });
}

/** Singleton for general-purpose TCP Redis (pub/sub publisher, ad-hoc ops). */
let _sharedClient = null;

export function getSharedRedisClient() {
  if (!_sharedClient) {
    _sharedClient = createRedisClient();
    _sharedClient.on("error", (err) => {
      console.error("[redis-tcp] shared client error", err.message);
    });
  }

  return _sharedClient;
}

/**
 * Check whether Redis TCP is reachable.
 * Returns true/false. Safe to call at startup.
 */
export async function pingRedisTcp() {
  try {
    const client = getSharedRedisClient();
    const result = await client.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export function isRedisTcpConfigured() {
  return Boolean(REDIS_TCP_URL || REDIS_HOST);
}
