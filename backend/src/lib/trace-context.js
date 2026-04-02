import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const traceStorage = new AsyncLocalStorage();

function readBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  return false;
}

export function isPerfTraceEnabled() {
  if (typeof globalThis.__PERF_ENABLED !== "undefined") {
    return readBooleanFlag(globalThis.__PERF_ENABLED);
  }

  return readBooleanFlag(process.env.PERF_TRACE_ENABLED) || readBooleanFlag(process.env.ENABLE_PERF_TRACE);
}

export function createTraceContext(seed = {}) {
  return {
    traceId: String(seed.traceId || `trace_${randomUUID()}`),
    requestId: seed.requestId ? String(seed.requestId) : null,
    method: seed.method ? String(seed.method).toUpperCase() : null,
    path: seed.path ? String(seed.path) : null,
    startedAt: Number(seed.startedAt || Date.now()),
    queryCount: 0,
    queryDurationMs: 0,
    queryTargets: {},
  };
}

export function runWithTraceContext(context, callback) {
  return traceStorage.run(context, callback);
}

export function getTraceContext() {
  return traceStorage.getStore() || null;
}

export function recordTraceQuery({ durationMs = 0, target = null } = {}) {
  const store = traceStorage.getStore();
  if (!store) {
    return null;
  }

  const normalizedDurationMs = Number(durationMs);
  if (Number.isFinite(normalizedDurationMs) && normalizedDurationMs > 0) {
    store.queryDurationMs += normalizedDurationMs;
  }

  store.queryCount += 1;

  if (target) {
    const normalizedTarget = String(target).slice(0, 160);
    store.queryTargets[normalizedTarget] = (store.queryTargets[normalizedTarget] || 0) + 1;
  }

  return store;
}

export function summarizeTraceContext(context = traceStorage.getStore()) {
  if (!context) {
    return {
      queryCount: 0,
      queryDurationMs: 0,
      queryTargets: {},
      distinctQueryTargets: 0,
    };
  }

  const queryTargets = context.queryTargets && typeof context.queryTargets === "object"
    ? context.queryTargets
    : {};

  return {
    queryCount: Number(context.queryCount || 0),
    queryDurationMs: Math.round(Number(context.queryDurationMs || 0)),
    queryTargets,
    distinctQueryTargets: Object.keys(queryTargets).length,
  };
}