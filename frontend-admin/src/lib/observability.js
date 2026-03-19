const EVENT_STORAGE_KEY = "duelvault_admin_observability_v1";
const MAX_EVENTS = 250;
const SLOW_INTERACTION_THRESHOLD_MS = 300;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { note: "payload_unserializable" };
  }
}

function readEvents() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(EVENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeEvents(events) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {}
}

export function generateClientMutationId(prefix = "mutation") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

export function createRequestId(prefix = "req") {
  return generateClientMutationId(prefix);
}

export function recordAdminEvent(type, payload = {}) {
  const event = {
    id: createRequestId("evt"),
    type,
    timestamp: nowIso(),
    payload: sanitizePayload(payload),
  };

  const events = readEvents();
  events.push(event);
  writeEvents(events);
  return event;
}

export function recordAdminError(error, context = {}) {
  return recordAdminEvent("error", {
    message: error?.message || String(error || "Unknown error"),
    name: error?.name || "Error",
    status: error?.status,
    code: error?.code,
    context,
  });
}

export function recordSlowInteraction(name, durationMs, context = {}) {
  if (Number(durationMs) < SLOW_INTERACTION_THRESHOLD_MS) {
    return null;
  }

  return recordAdminEvent("slow-interaction", {
    name,
    duration_ms: Math.round(durationMs),
    ...context,
  });
}

export function startAdminFlow(flowName, metadata = {}) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const flowId = createRequestId("flow");

  recordAdminEvent("flow-start", {
    flow_id: flowId,
    flow_name: flowName,
    ...metadata,
  });

  return {
    flowId,
    finish(result = {}) {
      const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const durationMs = endedAt - startedAt;

      recordAdminEvent("flow-finish", {
        flow_id: flowId,
        flow_name: flowName,
        duration_ms: Math.round(durationMs),
        ...result,
      });

      recordSlowInteraction(flowName, durationMs, {
        flow_id: flowId,
        source: "flow",
      });

      return durationMs;
    },
  };
}

export function getRecentAdminEvents(limit = 40) {
  return readEvents().slice(-limit).reverse();
}

export function clearAdminEvents() {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(EVENT_STORAGE_KEY);
  } catch {}
}

export function isSlowInteraction(durationMs) {
  return Number(durationMs) >= SLOW_INTERACTION_THRESHOLD_MS;
}