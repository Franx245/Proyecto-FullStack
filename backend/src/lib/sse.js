/**
 * SSE realtime streams — broadcasts Redis pub/sub events to connected clients.
 *
 * Falls back to 501 if Redis TCP is not configured (e.g. Vercel Serverless).
 */
import { isRedisTcpConfigured } from "./redis-tcp.js";
import { addEventBusListener, EVENT_CHANNELS } from "./events.js";

/** @type {Set<import("express").Response>} */
const publicClients = new Set();

/** @type {Set<import("express").Response>} */
const adminClients = new Set();

/**
 * Send an SSE message to a response stream.
 * @param {import("express").Response} res
 * @param {unknown} data
 */
function sendSSE(res, data) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Broadcast to a set of connected SSE clients. */
function broadcast(clients, data) {
  for (const res of clients) {
    try {
      sendSSE(res, data);
    } catch {
      clients.delete(res);
    }
  }
}

let listenersInitialized = false;

function ensureEventListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // Public: stock + order status updates
  addEventBusListener(["stock-update", "order-update", "catalog-synced"], (data) => {
    broadcast(publicClients, data);
  });

  // Admin: all events
  addEventBusListener(Object.keys(EVENT_CHANNELS), (data) => {
    broadcast(adminClients, data);
  });
}

function setupSSEResponse(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(":heartbeat\n\n");
  }, 30_000);

  // Send initial connected event
  sendSSE(res, { event: "connected", ts: Date.now() });

  req.on("close", () => {
    clearInterval(heartbeat);
  });
}

/** Public SSE handler — stock + order updates for storefront. */
export function publicSSEHandler(req, res) {
  if (!isRedisTcpConfigured()) {
    res.status(501).json({
      error: "SSE not available in serverless mode",
      code: "SSE_UNAVAILABLE",
    });
    return;
  }

  ensureEventListeners();
  setupSSEResponse(req, res);
  publicClients.add(res);

  req.on("close", () => {
    publicClients.delete(res);
  });
}

/** Admin SSE handler — all events for dashboard. */
export function adminSSEHandler(req, res) {
  if (!isRedisTcpConfigured()) {
    res.status(501).json({
      error: "SSE not available in serverless mode",
      code: "SSE_UNAVAILABLE",
    });
    return;
  }

  ensureEventListeners();
  setupSSEResponse(req, res);
  adminClients.add(res);

  req.on("close", () => {
    adminClients.delete(res);
  });
}

export function getSSEClientCount() {
  return { public: publicClients.size, admin: adminClients.size };
}
