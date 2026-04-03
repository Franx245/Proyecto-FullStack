import { ENV } from "@/config/env";

const PERF_STATE_KEY = "__DUELVAULT_PERF_STATE__";
const PERF_FLAG_KEY = "__PERF_ENABLED";

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function roundMs(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

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

function getPerfState() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  if (!globalThis[PERF_STATE_KEY]) {
    globalThis[PERF_STATE_KEY] = {
      bootstrapDone: false,
      fetchPatched: false,
      historyPatched: false,
      currentTraceId: null,
      currentTraceStartedAt: null,
      currentRoute: null,
      lastCommittedTraceId: null,
      pendingNavigation: null,
      loadReported: false,
      hydrationReported: false,
      originalFetch: null,
    };
  }

  return globalThis[PERF_STATE_KEY];
}

function ensurePerfFlag() {
  if (typeof globalThis === "undefined") {
    return;
  }

  if (typeof globalThis[PERF_FLAG_KEY] === "undefined") {
    globalThis[PERF_FLAG_KEY] = Boolean(ENV.FEATURES?.PERF_TRACE);
  }
}

export function isStorefrontPerfEnabled() {
  if (typeof globalThis === "undefined") {
    return false;
  }

  ensurePerfFlag();
  return readBooleanFlag(globalThis[PERF_FLAG_KEY]);
}

export function createFrontendTraceId(prefix = "fe") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function emitPerfEvent(type, data = {}) {
  if (!isStorefrontPerfEnabled()) {
    return;
  }

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    source: "storefront",
    type,
    ...data,
  }));
}

function normalizeBrowserUrl(input) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    if (input instanceof URL) {
      return new URL(input.toString(), window.location.origin);
    }

    return new URL(String(input || window.location.href), window.location.origin);
  } catch {
    return null;
  }
}

function normalizeRequestUrl(input) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    if (input instanceof URL) {
      return new URL(input.toString(), window.location.origin);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }

    return new URL(String(input), window.location.origin);
  } catch {
    return null;
  }
}

function readSearchKeys(searchParams) {
  return Array.from(new Set(Array.from(searchParams.keys()).filter(Boolean))).sort().slice(0, 20);
}

function buildRouteLabelFromUrl(url) {
  if (!url) {
    return "/";
  }

  const searchKeys = readSearchKeys(url.searchParams);
  return searchKeys.length ? `${url.pathname}?${searchKeys.join("&")}` : url.pathname;
}

function buildRouteLabel(pathname, search = "") {
  const normalizedPath = pathname || "/";
  const params = new URLSearchParams(search || "");
  const searchKeys = readSearchKeys(params);
  return searchKeys.length ? `${normalizedPath}?${searchKeys.join("&")}` : normalizedPath;
}

function sanitizeUrl(url) {
  if (!url) {
    return {
      path: null,
      queryKeys: [],
    };
  }

  return {
    path: url.pathname,
    queryKeys: readSearchKeys(url.searchParams),
  };
}

function isTraceableRequestUrl(url) {
  if (!url || typeof window === "undefined") {
    return false;
  }

  if (url.origin === window.location.origin && (url.pathname === "/api" || url.pathname.startsWith("/api/"))) {
    return true;
  }

  if (!ENV.API_BASE_URL) {
    return false;
  }

  const apiBaseUrl = normalizeBrowserUrl(ENV.API_BASE_URL);
  if (!apiBaseUrl || url.origin !== apiBaseUrl.origin) {
    return false;
  }

  const basePath = apiBaseUrl.pathname.replace(/\/$/, "");
  if (!basePath || basePath === "/") {
    return url.pathname === "/api" || url.pathname.startsWith("/api/");
  }

  if (!url.pathname.startsWith(basePath)) {
    return false;
  }

  const remainingPath = url.pathname.slice(basePath.length) || "/";
  return remainingPath === "/api" || remainingPath.startsWith("/api/");
}

function cloneRequestHeaders(input, initHeaders) {
  const headers = new Headers();

  if (typeof Request !== "undefined" && input instanceof Request) {
    new Headers(input.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  new Headers(initHeaders || {}).forEach((value, key) => {
    headers.set(key, value);
  });

  return headers;
}

function resolveRequestMethod(input, init) {
  if (init?.method) {
    return String(init.method).toUpperCase();
  }

  if (typeof Request !== "undefined" && input instanceof Request && input.method) {
    return String(input.method).toUpperCase();
  }

  return "GET";
}

function resolveTraceId(headers) {
  const existingTraceId = String(headers.get("x-trace-id") || "").trim();
  if (existingTraceId) {
    return existingTraceId;
  }

  const state = getPerfState();
  if (state?.currentTraceId) {
    return state.currentTraceId;
  }

  const traceId = createFrontendTraceId("api");
  if (state) {
    state.currentTraceId = traceId;
    state.currentTraceStartedAt = nowMs();
  }
  return traceId;
}

/**
 * @param {string} kind
 * @param {string | URL | null | undefined} href
 * @param {{ startedAt?: number }} [options]
 */
function markNavigationStart(kind, href, options = {}) {
  const state = getPerfState();
  if (!state) {
    return null;
  }

  const url = normalizeBrowserUrl(href);
  const traceId = createFrontendTraceId(kind === "app_load" ? "load" : "nav");
  const startedAt = options.startedAt;
  const navigationStartedAt = Number.isFinite(startedAt) ? startedAt : nowMs();
  const route = buildRouteLabelFromUrl(url);

  state.pendingNavigation = {
    traceId,
    kind,
    route,
    startedAt: navigationStartedAt,
  };
  state.currentTraceId = traceId;
  state.currentTraceStartedAt = navigationStartedAt;

  emitPerfEvent("NAVIGATION_START", {
    traceId,
    kind,
    route,
  });

  return traceId;
}

function patchHistoryNavigation() {
  const state = getPerfState();
  if (!state || state.historyPatched || typeof window === "undefined") {
    return;
  }

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function pushState(...args) {
    const result = originalPushState(...args);
    markNavigationStart("pushState", args[2] || window.location.href);
    return result;
  };

  window.history.replaceState = function replaceState(...args) {
    const result = originalReplaceState(...args);
    markNavigationStart("replaceState", args[2] || window.location.href);
    return result;
  };

  window.addEventListener("popstate", () => {
    markNavigationStart("popstate", window.location.href);
  });

  state.historyPatched = true;
}

function patchFetch() {
  const state = getPerfState();
  if (!state || state.fetchPatched || typeof globalThis.fetch !== "function") {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function tracedFetch(input, init) {
    const url = normalizeRequestUrl(input);
    if (!isTraceableRequestUrl(url)) {
      return originalFetch(input, init);
    }

    const method = resolveRequestMethod(input, init);
    const headers = cloneRequestHeaders(input, init?.headers);
    const traceId = resolveTraceId(headers);
    const requestMeta = sanitizeUrl(url);
    const startedAt = nowMs();

    headers.set("x-trace-id", traceId);

    emitPerfEvent("API_CALL_START", {
      traceId,
      method,
      ...requestMeta,
    });

    try {
      const response = await originalFetch(input, {
        ...init,
        headers,
      });

      const durationMs = roundMs(nowMs() - startedAt);
      emitPerfEvent(response.ok ? "API_CALL" : "API_ERROR", {
        traceId: response.headers.get("x-trace-id") || traceId,
        requestId: response.headers.get("x-request-id") || null,
        method,
        ...requestMeta,
        status: response.status,
        durationMs,
      });

      return response;
    } catch (error) {
      const errorLike = /** @type {{ name?: string, message?: string }} */ (error && typeof error === "object" ? error : {});
      emitPerfEvent("API_ERROR", {
        traceId,
        method,
        ...requestMeta,
        status: null,
        durationMs: roundMs(nowMs() - startedAt),
        errorName: errorLike.name || "Error",
        errorMessage: errorLike.message || "Request failed",
      });
      throw error;
    }
  };

  state.originalFetch = originalFetch;
  state.fetchPatched = true;
}

function observeLongTasks() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return;
  }

  if (!Array.isArray(PerformanceObserver.supportedEntryTypes) || !PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    return;
  }

  const state = getPerfState();
  if (!state || state.longTaskObserver) {
    return;
  }

  try {
    const observer = new PerformanceObserver((entryList) => {
      const currentTraceId = getPerfState()?.currentTraceId || null;

      for (const entry of entryList.getEntries()) {
        emitPerfEvent("UI_BLOCK", {
          traceId: currentTraceId,
          durationMs: roundMs(entry.duration),
          startTimeMs: roundMs(entry.startTime),
          name: entry.name || "longtask",
        });
      }
    });

    observer.observe({ type: "longtask", buffered: true });
    state.longTaskObserver = observer;
  } catch {
    state.longTaskObserver = null;
  }
}

function scheduleInitialLoadReport() {
  const state = getPerfState();
  if (!state || state.loadReported || typeof window === "undefined") {
    return;
  }

  const report = () => {
    const nextState = getPerfState();
    if (!nextState || nextState.loadReported) {
      return;
    }

    nextState.loadReported = true;
    const navigationEntry = /** @type {PerformanceNavigationTiming | undefined} */ (performance.getEntriesByType("navigation")[0]);
    const paintEntries = performance.getEntriesByType("paint");
    const fcpEntry = paintEntries.find((entry) => entry.name === "first-contentful-paint");

    emitPerfEvent("APP_LOAD", {
      traceId: nextState.currentTraceId,
      route: nextState.currentRoute || buildRouteLabelFromUrl(normalizeBrowserUrl(window.location.href)),
      ttfbMs: roundMs(navigationEntry?.responseStart),
      domContentLoadedMs: roundMs(navigationEntry?.domContentLoadedEventEnd),
      loadEventMs: roundMs(navigationEntry?.loadEventEnd),
      fcpMs: roundMs(fcpEntry?.startTime),
      transferSize: Number.isFinite(navigationEntry?.transferSize) ? navigationEntry.transferSize : null,
    });
  };

  if (document.readyState === "complete") {
    queueMicrotask(report);
    return;
  }

  window.addEventListener("load", () => {
    queueMicrotask(report);
  }, { once: true });
}

export function ensureStorefrontPerfBootstrap() {
  if (typeof window === "undefined") {
    return;
  }

  ensurePerfFlag();

  const state = getPerfState();
  if (!state) {
    return;
  }

  if (!state.bootstrapDone) {
    state.bootstrapDone = true;
    markNavigationStart("app_load", window.location.href, { startedAt: 0 });
    emitPerfEvent("APP_BOOTSTRAP", {
      route: buildRouteLabelFromUrl(normalizeBrowserUrl(window.location.href)),
    });
  }

  patchHistoryNavigation();
  patchFetch();
  observeLongTasks();
  scheduleInitialLoadReport();
}

export function reportHydrationReady({ pathname = "/", search = "" } = {}) {
  const state = getPerfState();
  if (!state || state.hydrationReported) {
    return;
  }

  state.hydrationReported = true;
  emitPerfEvent("APP_HYDRATED", {
    traceId: state.currentTraceId,
    route: buildRouteLabel(pathname, search),
    durationMs: roundMs(nowMs()),
  });
}

export function commitRouteNavigation({ pathname = "/", search = "" } = {}) {
  const state = getPerfState();
  if (!state) {
    return null;
  }

  const route = buildRouteLabel(pathname, search);
  if (state.currentRoute === route && state.lastCommittedTraceId) {
    return state.lastCommittedTraceId;
  }

  const pendingNavigation = state.pendingNavigation;
  const traceId = pendingNavigation?.traceId || state.currentTraceId || createFrontendTraceId("route");
  const durationMs = pendingNavigation ? roundMs(nowMs() - pendingNavigation.startedAt) : null;
  const kind = pendingNavigation?.kind || "route_render";

  state.currentRoute = route;
  state.currentTraceId = traceId;
  state.currentTraceStartedAt = nowMs();
  state.lastCommittedTraceId = traceId;
  state.pendingNavigation = null;

  emitPerfEvent("NAVIGATION_COMMIT", {
    traceId,
    kind,
    route,
    durationMs,
  });

  return traceId;
}

export function trackComponentLifetime(component, { traceId = null, pathname = "/", search = "" } = {}) {
  const startedAt = nowMs();
  const route = buildRouteLabel(pathname, search);
  const effectiveTraceId = traceId || getPerfState()?.currentTraceId || null;

  emitPerfEvent("COMPONENT_MOUNT", {
    traceId: effectiveTraceId,
    component,
    route,
  });

  return () => {
    emitPerfEvent("COMPONENT_UNMOUNT", {
      traceId: effectiveTraceId,
      component,
      route,
      lifetimeMs: roundMs(nowMs() - startedAt),
    });
  };
}