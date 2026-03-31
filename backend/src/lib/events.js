/**
 * Event bus — Redis pub/sub for realtime notifications.
 *
 * Publisher side: call publishEvent() from anywhere in the backend.
 * Subscriber side: call subscribeToEvents() once at startup; register listeners.
 *
 * Event types:
 *   stock-update   – card stock changed
 *   new-order      – order created
 *   order-update   – order status changed
 *   price-change   – prices recomputed
 *   catalog-synced – full catalog sync completed
 */
import { createRedisClient, isRedisTcpConfigured } from "./redis-tcp.js";

const EVENT_CHANNELS = Object.freeze({
  "stock-update": "stock:update",
  "new-order": "order:update",
  "order-update": "order:update",
  "price-change": "price:update",
  "catalog-synced": "catalog:update",
});
const SUBSCRIBED_CHANNELS = [...new Set(Object.values(EVENT_CHANNELS))];

/** @type {import("ioredis").Redis | null} */
let publisher = null;
/** @type {import("ioredis").Redis | null} */
let subscriber = null;

/** @type {Map<string, Set<(event: { type: string, data: unknown, ts: number, channel: string }) => void>>} */
const listenersByChannel = new Map();

function getChannelListeners(channel) {
  if (!listenersByChannel.has(channel)) {
    listenersByChannel.set(channel, new Set());
  }

  return listenersByChannel.get(channel);
}

function getPublisher() {
  if (!publisher && isRedisTcpConfigured()) {
    publisher = createRedisClient();
    publisher.on("error", (err) => {
      console.error("[events] publisher error:", err.message);
    });
  }

  return publisher;
}

/**
 * Publish an event to all subscribers (backend instances + SSE clients).
 */
export function publishEvent(type, data = {}) {
  const pub = getPublisher();
  if (!pub) return;

  const channel = EVENT_CHANNELS[type];
  if (!channel) {
    console.warn("[events] unknown event type", { type });
    return;
  }

  const payload = JSON.stringify({ type, data, ts: Date.now() });

  pub.publish(channel, payload).catch((err) => {
    console.error("[events] publish failed:", err.message);
  });
}

/**
 * Subscribe to the events channel. Call once at startup.
 * Pass a callback or use addEventBusListener().
 */
export function subscribeToEvents() {
  if (!isRedisTcpConfigured()) {
    console.warn("[events] Redis TCP not configured — pub/sub disabled");
    return;
  }

  if (subscriber) return;

  subscriber = createRedisClient();
  subscriber.on("error", (err) => {
    console.error("[events] subscriber error:", err.message);
  });

  subscriber.subscribe(...SUBSCRIBED_CHANNELS, (err) => {
    if (err) {
      console.error("[events] subscribe failed:", err.message);
      return;
    }
    console.info("[events] subscribed", { channels: SUBSCRIBED_CHANNELS });
  });

  subscriber.on("message", (channel, message) => {
    try {
      const event = {
        ...JSON.parse(message),
        channel,
      };
      const listeners = listenersByChannel.get(channel);
      if (!listeners?.size) {
        return;
      }

      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error("[events] listener error:", err.message);
        }
      }
    } catch (err) {
      console.error("[events] parse error:", err.message);
    }
  });
}

/**
 * Register a listener for all events on this process.
 * Returns an unsubscribe function.
 */
export function addEventBusListener(channels, fn) {
  const normalizedChannels = Array.isArray(channels) ? channels : [channels];
  const cleanChannels = normalizedChannels.filter(Boolean);

  for (const channel of cleanChannels) {
    getChannelListeners(channel).add(fn);
  }

  return () => {
    for (const channel of cleanChannels) {
      listenersByChannel.get(channel)?.delete(fn);
    }
  };
}

/**
 * Graceful shutdown.
 */
export async function stopEventBus() {
  if (subscriber) {
    await subscriber.unsubscribe(...SUBSCRIBED_CHANNELS);
    subscriber.disconnect();
    subscriber = null;
  }

  if (publisher) {
    publisher.disconnect();
    publisher = null;
  }

  listenersByChannel.clear();
}

export { EVENT_CHANNELS };
