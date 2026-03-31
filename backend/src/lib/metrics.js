import { isRedisEnabled, redis } from "./redis.js";

function buildMetricKey(name) {
  return `metrics:${name}`;
}

async function incrementMetric(name, value = 1) {
  if (!isRedisEnabled()) {
    return;
  }

  try {
    await redis.incrby(buildMetricKey(name), value);
  } catch {
    // Metrics must never break the request path.
  }
}

export function recordCacheHit() {
  return incrementMetric("cache:hit", 1);
}

export function recordCacheMiss() {
  return incrementMetric("cache:miss", 1);
}

export async function recordApiMetric({ method, route, statusCode, durationMs }) {
  if (!isRedisEnabled()) {
    return;
  }

  const safeMethod = String(method || "GET").toUpperCase();
  const safeRoute = String(route || "unknown").replace(/\s+/g, "_");
  const safeStatus = Number(statusCode) || 0;
  const safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));

  await Promise.all([
    incrementMetric(`api:count:${safeMethod}:${safeRoute}:${safeStatus}`, 1),
    incrementMetric(`api:duration:${safeMethod}:${safeRoute}:sum_ms`, safeDuration),
  ]);
}

export async function recordWorkerMetric({ jobName, status, durationMs }) {
  if (!isRedisEnabled()) {
    return;
  }

  const safeJobName = String(jobName || "unknown");
  const safeStatus = String(status || "completed");
  const safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));

  await Promise.all([
    incrementMetric(`worker:${safeJobName}:${safeStatus}:count`, 1),
    incrementMetric(`worker:${safeJobName}:${safeStatus}:sum_ms`, safeDuration),
  ]);
}

export async function recordCatalogSearchMetric(query) {
  if (!isRedisEnabled()) {
    return;
  }

  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return;
  }

  try {
    await redis.zincrby("analytics:catalog-search-terms", 1, normalized);
  } catch {
    // Best effort only.
  }
}