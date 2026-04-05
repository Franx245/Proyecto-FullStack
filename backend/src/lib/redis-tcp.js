/**
 * Redis TCP client — used for BullMQ queues and pub/sub.
 *
 * Separate from the Upstash REST client (cache).
 * Requires REDIS_TCP_URL or REDIS_URL pointing to a TCP Redis instance (e.g. Railway Redis).
 */
import "./load-env.js";
import IORedis from "ioredis";
import { redisConfig } from "../../config/env.js";
import { logEvent } from "./logger.js";

function getRedisConnectionTarget() {
  if (redisConfig.url) {
    return redisConfig.url;
  }

  if (redisConfig.host && redisConfig.port) {
    return {
      host: redisConfig.host,
      port: redisConfig.port,
    };
  }

  return null;
}

function describeRedisTarget(redisTarget) {
  if (typeof redisTarget !== "string") {
    return {
      protocol: "redis",
      host: redisTarget?.host || null,
      port: redisTarget?.port || null,
    };
  }

  try {
    const parsed = new URL(redisTarget);
    return {
      protocol: parsed.protocol.replace(/:$/, ""),
      host: parsed.hostname,
      port: parsed.port || null,
    };
  } catch {
    return {
      protocol: null,
      host: null,
      port: null,
    };
  }
}

function requireRedisTarget(label = "default") {
  const redisTarget = getRedisConnectionTarget();
  if (redisTarget) {
    return redisTarget;
  }

  const error = new Error("Redis TCP connection is not configured");
  logEvent("REDIS_CONFIG_ERROR", "Redis connection is required", {
    label,
    envKeys: ["REDIS_HOST", "REDIS_PORT", "REDIS_TCP_URL", "REDIS_URL"],
    error,
  });
  throw error;
}

/** @type {IORedis | null} */
let sharedClient = null;

/** @type {IORedis | null} */
let subscriberClient = null;

/** @type {IORedis | null} */
let publisherClient = null;

function createIORedisClient(label = "default", { required = false } = {}) {
  const redisTarget = required ? requireRedisTarget(label) : getRedisConnectionTarget();
  if (!redisTarget) return null;

  logEvent("REDIS_CONNECTING", "Connecting to Redis...", {
    label,
  });
  logEvent("REDIS_URL_DETECTED", "Redis URL detected", {
    label,
    ...describeRedisTarget(redisTarget),
  });

  const clientOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "EPIPE"];
      return targetErrors.some((e) => err.message.includes(e));
    },
    lazyConnect: false,
  };

  const client = typeof redisTarget === "string"
    ? new IORedis(redisTarget, clientOptions)
    : new IORedis({
        ...redisTarget,
        ...clientOptions,
      });

  client.on("error", (err) => {
    logEvent("REDIS_ERROR", "Redis connection error", {
      label,
      error: err,
    });
  });

  client.on("connect", () => {
    logEvent("REDIS_CONNECTED", "Redis socket connected", {
      label,
    });
  });

  client.on("ready", () => {
    logEvent("REDIS_READY", "Connected to Redis", {
      label,
    });
  });

  client.on("close", () => {
    logEvent("REDIS_CLOSE", "Redis connection closed", {
      label,
    });
  });

  client.on("reconnecting", (delay) => {
    logEvent("REDIS_RECONNECTING", "Redis reconnecting", {
      label,
      delayMs: delay,
    });
  });

  return client;
}

export function isRedisTcpConfigured() {
  return Boolean(getRedisConnectionTarget());
}

export function getSharedRedisClient() {
  if (!getRedisConnectionTarget()) return null;
  if (!sharedClient) {
    sharedClient = createIORedisClient("shared");
  }
  return sharedClient;
}

/** Dedicated subscriber connection for pub/sub (cannot share with commands). */
export function getSubscriberClient() {
  if (!getRedisConnectionTarget()) return null;
  if (!subscriberClient) {
    subscriberClient = createIORedisClient("subscriber");
  }
  return subscriberClient;
}

/** Dedicated publisher connection for pub/sub. */
export function getPublisherClient() {
  if (!getRedisConnectionTarget()) return null;
  if (!publisherClient) {
    publisherClient = createIORedisClient("publisher");
  }
  return publisherClient;
}

/** BullMQ connection object — creates a new IORedis per call for workers. */
export function createBullMQConnection() {
  return createIORedisClient("bullmq", { required: true });
}

/** Reusable connection for BullMQ Queue (not Worker). */
export function getQueueConnection() {
  return getSharedRedisClient();
}

export async function pingRedisTcp() {
  const client = getSharedRedisClient();
  if (!client) return false;
  try {
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function shutdownRedisTcp() {
  const clients = [sharedClient, subscriberClient, publisherClient].filter(Boolean);
  await Promise.allSettled(clients.map((c) => c.quit().catch(() => c.disconnect())));
  sharedClient = null;
  subscriberClient = null;
  publisherClient = null;
}
