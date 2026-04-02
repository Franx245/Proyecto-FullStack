import "./load-env.js";
import { AsyncLocalStorage } from "node:async_hooks";
import prismaPkg from "@prisma/client";
import { logEvent } from "./logger.js";
import { getTraceContext, isPerfTraceEnabled, recordTraceQuery } from "./trace-context.js";

const { PrismaClient } = prismaPkg;

const globalForPrisma = globalThis;
const DATABASE_POOL_SIZE = Math.max(2, Math.min(20, Number(process.env.DATABASE_POOL_SIZE || 10)));
const DATABASE_QUEUE_WAIT_MS = Number(process.env.DATABASE_QUEUE_WAIT_MS || 5000);
const DATABASE_PROBE_CACHE_MS = 5000;

function normalizeDatabaseUrl(rawValue) {
  if (!rawValue) {
    return rawValue;
  }

  try {
    const url = new URL(rawValue);
    const isSupabasePooler = /pooler\.supabase\.com$/i.test(url.hostname);
    const usesPgBouncer = isSupabasePooler || url.searchParams.get("pgbouncer") === "true";

    if (usesPgBouncer) {
      url.searchParams.set("pgbouncer", "true");
      url.searchParams.set("connection_limit", String(DATABASE_POOL_SIZE));

      if (!url.searchParams.has("pool_timeout")) {
        url.searchParams.set("pool_timeout", "15");
      }

      if (!url.searchParams.has("connect_timeout")) {
        url.searchParams.set("connect_timeout", "5");
      }
    }

    return url.toString();
  } catch {
    return rawValue;
  }
}

function getConnectionInfo(rawValue) {
  if (!rawValue) {
    return {
      configured: false,
      usesPooler: false,
      usesPgBouncer: false,
      connectionLimit: null,
      poolTimeout: null,
      connectTimeout: null,
      host: null,
      port: null,
      database: null,
    };
  }

  try {
    const url = new URL(rawValue);
    return {
      configured: true,
      usesPooler: /pooler\.supabase\.com$/i.test(url.hostname),
      usesPgBouncer: url.searchParams.get("pgbouncer") === "true",
      connectionLimit: Number(url.searchParams.get("connection_limit") || 0) || null,
      poolTimeout: Number(url.searchParams.get("pool_timeout") || 0) || null,
      connectTimeout: Number(url.searchParams.get("connect_timeout") || 0) || null,
      host: url.hostname || null,
      port: Number(url.port || 0) || null,
      database: url.pathname ? url.pathname.replace(/^\//, "") : null,
    };
  } catch {
    return {
      configured: true,
      usesPooler: false,
      usesPgBouncer: false,
      connectionLimit: null,
      poolTimeout: null,
      connectTimeout: null,
      host: null,
      port: null,
      database: null,
    };
  }
}

function createDatabaseBusyError(maxWaitMs) {
  const error = new Error("Database is busy");
  Object.assign(error, {
    statusCode: 503,
    code: "DATABASE_BUSY",
    details: { max_wait_ms: maxWaitMs },
  });
  return error;
}

const normalizedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (normalizedDatabaseUrl) {
  process.env.DATABASE_URL = normalizedDatabaseUrl;
}

const databaseScope = new AsyncLocalStorage();
let _semaphoreCount = 0;
let _semaphoreWaiters = [];
const databaseProbeState = {
  checkedAt: 0,
  inflight: null,
  snapshot: null,
};

export const prismaConnectionInfo = getConnectionInfo(normalizedDatabaseUrl);

export const prisma =
  globalForPrisma.__duelvaultPrisma ??
  new PrismaClient({
    ...(normalizedDatabaseUrl
      ? {
          datasources: {
            db: {
              url: normalizedDatabaseUrl,
            },
          },
        }
      : {}),
    log: [
      ...(process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]),
      { emit: "event", level: "query" },
    ],
    errorFormat: "minimal",
    transactionOptions: {
      maxWait: 5000,
      timeout: 10000,
    },
  });

/* Singleton: store in globalThis for BOTH dev and production (serverless). */
if (!globalForPrisma.__duelvaultPrisma) {
  globalForPrisma.__duelvaultPrisma = prisma;
}

if (!globalForPrisma.__duelvaultPrismaTraceMiddlewareAttached) {
  prisma.$use(async (params, next) => {
    if (!isPerfTraceEnabled() || !getTraceContext()) {
      return next(params);
    }

    const startedAt = Date.now();

    try {
      return await next(params);
    } finally {
      const durationMs = Date.now() - startedAt;
      const target = [params?.model, params?.action]
        .filter(Boolean)
        .join(".") || "query";
      const traceContext = recordTraceQuery({ durationMs, target });

      if (!traceContext) {
        return;
      }

      logEvent("PRISMA_QUERY", "Prisma query completed", {
        traceId: traceContext.traceId,
        requestId: traceContext.requestId,
        method: traceContext.method,
        path: traceContext.path,
        durationMs,
        target,
        queryIndex: traceContext.queryCount,
      });
    }
  });

  globalForPrisma.__duelvaultPrismaTraceMiddlewareAttached = true;
}

export async function withDatabaseConnection(work, { maxWaitMs = DATABASE_QUEUE_WAIT_MS } = {}) {
  if (databaseScope.getStore()) {
    return work();
  }

  if (_semaphoreCount < DATABASE_POOL_SIZE) {
    _semaphoreCount++;
  } else {
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = _semaphoreWaiters.indexOf(waiter);
        if (idx !== -1) _semaphoreWaiters.splice(idx, 1);
        reject(createDatabaseBusyError(maxWaitMs));
      }, maxWaitMs);
      const waiter = { resolve, timeoutId };
      _semaphoreWaiters.push(waiter);
    });
  }

  try {
    return await databaseScope.run({ acquiredAt: Date.now() }, work);
  } finally {
    if (_semaphoreWaiters.length > 0) {
      const next = _semaphoreWaiters.shift();
      clearTimeout(next.timeoutId);
      next.resolve();
    } else {
      _semaphoreCount--;
    }
  }
}

export async function probeDatabaseConnection({ force = false } = {}) {
  if (!force && databaseProbeState.snapshot && Date.now() - databaseProbeState.checkedAt < DATABASE_PROBE_CACHE_MS) {
    return databaseProbeState.snapshot;
  }

  if (!databaseProbeState.inflight) {
    databaseProbeState.inflight = withDatabaseConnection(async () => {
      const startedAt = Date.now();
      await prisma.$queryRaw`SELECT 1`;

      const snapshot = {
        ok: true,
        checked_at: new Date().toISOString(),
        latency_ms: Date.now() - startedAt,
        code: null,
        details: prismaConnectionInfo,
      };

      databaseProbeState.snapshot = snapshot;
      databaseProbeState.checkedAt = Date.now();
      return snapshot;
    }, { maxWaitMs: 2000 }).catch((error) => {
      const snapshot = {
        ok: false,
        checked_at: new Date().toISOString(),
        latency_ms: null,
        code: error?.code || "DATABASE_UNAVAILABLE",
        details: prismaConnectionInfo,
      };

      databaseProbeState.snapshot = snapshot;
      databaseProbeState.checkedAt = Date.now();
      return snapshot;
    }).finally(() => {
      databaseProbeState.inflight = null;
    });
  }

  return databaseProbeState.inflight;
}

/* ── DB keepalive: prevent Supabase free-tier from pausing ── */

const DB_KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // every 4 minutes
let _keepaliveTimer = null;

export function startDatabaseKeepalive() {
  if (_keepaliveTimer) return;
  _keepaliveTimer = setInterval(async () => {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, r) => setTimeout(() => r(new Error("keepalive timeout")), 3000)),
      ]);
    } catch (err) {
      console.warn("[db-keepalive] ping failed:", err.message);
    }
  }, DB_KEEPALIVE_INTERVAL_MS);
  _keepaliveTimer.unref(); // don't prevent process exit
}

export function stopDatabaseKeepalive() {
  if (_keepaliveTimer) {
    clearInterval(_keepaliveTimer);
    _keepaliveTimer = null;
  }
}

/* ── Retry wrapper for transient connection failures ── */

const TRANSIENT_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection from the connection pool
]);

function isTransientError(err) {
  if (!err) return false;
  const code = err.code || err?.meta?.code || "";
  if (TRANSIENT_CODES.has(code)) return true;
  const msg = String(err.message || "");
  return (
    msg.includes("Can't reach database server") ||
    msg.includes("Connection refused") ||
    msg.includes("Connection timed out") ||
    msg.includes("Server has closed the connection")
  );
}

export async function withRetry(fn, { retries = 1, delayMs = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries && isTransientError(err)) {
        console.warn(`[db-retry] attempt ${attempt + 1} failed (${err.code || err.message}), retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
