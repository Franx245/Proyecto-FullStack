/**
 * SSE realtime streams — broadcasts events to connected clients.
 *
 * Architecture:
 * - ONE set of event bus listeners (registered once, never per-request)
 * - Clients stored in Sets, cleaned up on close
 * - Max client cap to prevent memory exhaustion
 * - Works with local in-process events; Redis TCP adds cross-instance pub/sub
 */
import { addEventBusListener, EVENT_CHANNELS } from "./events.js";

const MAX_SSE_CLIENTS = Number(process.env.SSE_MAX_CLIENTS || 200);

/** @type {Set<import("express").Response>} */
const publicClients = new Set();

/** @type {Set<import("express").Response>} */
const adminClients = new Set();

/**
 * Send an SSE message to a response stream.
 * Emits named events when data contains an `event` field,
 * so frontend EventSource.addEventListener(eventName) can match.
 * @param {import("express").Response} res
 * @param {unknown} data
 */
function sendSSE(res, data) {
  if (res.writableEnded) return false;
  try {
    const payload = JSON.stringify(data);
    if (data && typeof data === "object" && typeof data.event === "string") {
      res.write(`event: ${data.event}\ndata: ${payload}\n\n`);
    } else {
      res.write(`data: ${payload}\n\n`);
    }
    return true;
  } catch {
    return false;
  }
}

/** Broadcast to a set of connected SSE clients. Remove dead ones. */
function broadcast(clients, data) {
  for (const res of clients) {
    if (!sendSSE(res, data)) {
      clients.delete(res);
    }
  }
}

let listenersInitialized = false;

/**
 * Register event bus listeners ONCE.
 * These are process-level singletons — never created per-request.
 */
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

/**
 * Set up SSE response headers and heartbeat.
 * Returns cleanup function.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
function setupSSEResponse(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Heartbeat every 30s to keep connection alive + detect dead sockets
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(":heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  // Send initial connected event
  sendSSE(res, { event: "connected", ts: Date.now() });

  return () => clearInterval(heartbeat);
}

/** Public SSE handler — stock + order updates for storefront. */
export function publicSSEHandler(req, res) {
  if (publicClients.size + adminClients.size >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: "Too many SSE connections", code: "SSE_CAPACITY" });
    return;
  }

  ensureEventListeners();
  const cleanup = setupSSEResponse(req, res);
  publicClients.add(res);

  req.on("close", () => {
    publicClients.delete(res);
    cleanup();
  });
}

/** Admin SSE handler — all events for dashboard. */
export function adminSSEHandler(req, res) {
  if (publicClients.size + adminClients.size >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: "Too many SSE connections", code: "SSE_CAPACITY" });
    return;
  }

  ensureEventListeners();
  const cleanup = setupSSEResponse(req, res);
  adminClients.add(res);

  req.on("close", () => {
    adminClients.delete(res);
    cleanup();
  });
}

export function getSSEClientCount() {
  return { public: publicClients.size, admin: adminClients.size };
}
