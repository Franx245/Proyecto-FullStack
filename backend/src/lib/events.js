/**
 * Event bus stub — disabled for Vercel Serverless.
 *
 * Redis pub/sub requires persistent TCP connections.  All exports are safe
 * no-ops so existing call-sites keep compiling.
 */

const EVENT_CHANNELS = Object.freeze({
  "stock-update": "stock:update",
  "new-order": "order:update",
  "order-update": "order:update",
  "price-change": "price:update",
  "catalog-synced": "catalog:update",
});

export function publishEvent() {}

export function subscribeToEvents() {}

export function addEventBusListener(_channels, _fn) {
  return () => {};
}

export async function stopEventBus() {}

export { EVENT_CHANNELS };
