/**
 * Event bus — Redis pub/sub via TCP when available, no-op otherwise.
 *
 * Uses dedicated publisher/subscriber IORedis connections.
 */
import { getPublisherClient, getSubscriberClient, isRedisTcpConfigured } from "./redis-tcp.js";

const EVENT_CHANNELS = Object.freeze({
  "stock-update": "stock:update",
  "new-order": "order:update",
  "order-update": "order:update",
  "price-change": "price:update",
  "catalog-synced": "catalog:update",
});

/** @type {Map<string, Set<(data: unknown) => void>>} */
const listeners = new Map();
let subscriberInitialized = false;

function ensureSubscriber() {
  if (subscriberInitialized) return;
  if (!isRedisTcpConfigured()) return;

  const sub = getSubscriberClient();
  if (!sub) return;

  subscriberInitialized = true;

  sub.on("message", (channel, message) => {
    const handlers = listeners.get(channel);
    if (!handlers || handlers.size === 0) return;

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = message;
    }

    for (const fn of handlers) {
      try {
        fn(parsed);
      } catch (err) {
        console.error(`[events] listener error on ${channel}:`, err.message);
      }
    }
  });
}

/**
 * Publish an event to all subscribers.
 * @param {keyof typeof EVENT_CHANNELS} eventName
 * @param {unknown} data
 */
export function publishEvent(eventName, data) {
  const channel = EVENT_CHANNELS[eventName] || eventName;
  const envelope = { event: eventName, data, ts: Date.now() };

  if (isRedisTcpConfigured()) {
    /* Redis TCP available — publish via pub/sub; the subscriber connection
       will call local listeners when the message comes back. */
    const pub = getPublisherClient();
    if (pub) {
      pub.publish(channel, JSON.stringify(envelope)).catch((err) => {
        console.error(`[events] publish failed on ${channel}:`, err.message);
      });
    }
  } else {
    /* No Redis TCP — broadcast directly to local in-process listeners */
    const handlers = listeners.get(channel);
    if (handlers && handlers.size > 0) {
      for (const fn of handlers) {
        try { fn(envelope); } catch (err) {
          console.error(`[events] listener error on ${channel}:`, err.message);
        }
      }
    }
  }
}

/**
 * Subscribe to one or more event channels.
 * @param {(keyof typeof EVENT_CHANNELS)[] | keyof typeof EVENT_CHANNELS} channels
 * @param {(data: unknown) => void} fn
 * @returns {() => void} unsubscribe function
 */
export function addEventBusListener(channels, fn) {
  const channelList = Array.isArray(channels) ? channels : [channels];
  const resolvedChannels = channelList.map((c) => EVENT_CHANNELS[c] || c);

  /* Always register local listeners (works with or without Redis TCP) */
  for (const ch of resolvedChannels) {
    if (!listeners.has(ch)) {
      listeners.set(ch, new Set());
    }
    listeners.get(ch).add(fn);
  }

  /* If Redis TCP is available, also subscribe for cross-instance events */
  if (isRedisTcpConfigured()) {
    ensureSubscriber();
    const sub = getSubscriberClient();
    if (sub) {
      for (const ch of resolvedChannels) {
        sub.subscribe(ch).catch((err) => {
          console.error(`[events] subscribe failed on ${ch}:`, err.message);
        });
      }
    }
  }

  return () => {
    const sub = isRedisTcpConfigured() ? getSubscriberClient() : null;
    for (const ch of resolvedChannels) {
      const set = listeners.get(ch);
      if (set) {
        set.delete(fn);
        if (set.size === 0) {
          listeners.delete(ch);
          if (sub) sub.unsubscribe(ch).catch(() => {});
        }
      }
    }
  };
}

export function subscribeToEvents() {
  ensureSubscriber();
}

export async function stopEventBus() {
  const sub = getSubscriberClient();
  if (sub && subscriberInitialized) {
    try {
      await sub.unsubscribe();
    } catch { /* shutdown */ }
  }
  listeners.clear();
  subscriberInitialized = false;
}

export { EVENT_CHANNELS };
