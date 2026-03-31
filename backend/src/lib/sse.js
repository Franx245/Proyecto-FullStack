/**
 * SSE (Server-Sent Events) realtime endpoint.
 *
 * GET /api/events/stream       — public (stock updates, price changes)
 * GET /api/admin/events/stream — admin (orders, all events)
 *
 * Each connected client receives events from the Redis pub/sub bus.
 */
import { addEventBusListener, EVENT_CHANNELS } from "./events.js";

const PUBLIC_EVENT_TYPES = new Set(["stock-update", "price-change", "catalog-synced"]);
const ADMIN_EVENT_TYPES = new Set(["stock-update", "price-change", "catalog-synced", "new-order", "order-update"]);
const PUBLIC_CHANNELS = [EVENT_CHANNELS["stock-update"], EVENT_CHANNELS["price-change"], EVENT_CHANNELS["catalog-synced"]];
const ADMIN_CHANNELS = [...new Set([...PUBLIC_CHANNELS, EVENT_CHANNELS["order-update"]])];

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_SSE_CONNECTIONS = 200;
const SSE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

let activeConnections = 0;

function setupSSEHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Send initial comment to flush headers
  res.write(":ok\n\n");
}

function createSSEHandler(allowedTypes, channels) {
  return (req, res) => {
    if (activeConnections >= MAX_SSE_CONNECTIONS) {
      res.status(503).json({ error: "Too many SSE connections" });
      return;
    }

    setupSSEHeaders(res);
    activeConnections++;
    let closed = false;

    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      activeConnections--;
      clearInterval(heartbeat);
      clearTimeout(maxAgeTimer);
      unsubscribe();
      req.off("close", cleanup);
      res.off("close", cleanup);
      res.off("error", cleanup);
    };

    // Force-close after MAX_AGE to prevent stale connections
    const maxAgeTimer = setTimeout(() => {
      if (!closed) {
        res.write("event: reconnect\ndata: {}\n\n");
        res.end();
        cleanup();
      }
    }, SSE_MAX_AGE_MS);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (closed || res.writableEnded || res.destroyed) {
        cleanup();
        return;
      }

      res.write(":heartbeat\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    // Listen for events matching allowed types
    const unsubscribe = addEventBusListener(channels, (event) => {
      if (closed || res.writableEnded || res.destroyed) {
        cleanup();
        return;
      }

      if (!allowedTypes.has(event.type)) return;

      const payload = JSON.stringify({ type: event.type, data: event.data, ts: event.ts });
      res.write(`event: ${event.type}\ndata: ${payload}\n\n`);
    });

    // Cleanup on disconnect
    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  };
}

export const publicSSEHandler = createSSEHandler(PUBLIC_EVENT_TYPES, PUBLIC_CHANNELS);
export const adminSSEHandler = createSSEHandler(ADMIN_EVENT_TYPES, ADMIN_CHANNELS);
