/**
 * Redis TCP client — used for BullMQ queues and pub/sub.
 *
 * Separate from the Upstash REST client (cache).
 * Requires REDIS_URL env var pointing to a TCP Redis instance (e.g. Railway Redis).
 */
import "./load-env.js";
import IORedis from "ioredis";

const REDIS_URL = String(process.env.REDIS_URL || "").trim();

/** @type {IORedis | null} */
let sharedClient = null;

/** @type {IORedis | null} */
let subscriberClient = null;

/** @type {IORedis | null} */
let publisherClient = null;

function createIORedisClient(label = "default") {
  if (!REDIS_URL) return null;

  const client = new IORedis(REDIS_URL, {
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
  });

  client.on("error", (err) => {
    console.error(`[redis-tcp:${label}] error:`, err.message);
  });

  client.on("connect", () => {
    console.info(`[redis-tcp:${label}] connected`);
  });

  return client;
}

export function isRedisTcpConfigured() {
  return Boolean(REDIS_URL);
}

export function getSharedRedisClient() {
  if (!REDIS_URL) return null;
  if (!sharedClient) {
    sharedClient = createIORedisClient("shared");
  }
  return sharedClient;
}

/** Dedicated subscriber connection for pub/sub (cannot share with commands). */
export function getSubscriberClient() {
  if (!REDIS_URL) return null;
  if (!subscriberClient) {
    subscriberClient = createIORedisClient("subscriber");
  }
  return subscriberClient;
}

/** Dedicated publisher connection for pub/sub. */
export function getPublisherClient() {
  if (!REDIS_URL) return null;
  if (!publisherClient) {
    publisherClient = createIORedisClient("publisher");
  }
  return publisherClient;
}

/** BullMQ connection object — creates a new IORedis per call for workers. */
export function createBullMQConnection() {
  if (!REDIS_URL) return null;
  return createIORedisClient("bullmq");
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
