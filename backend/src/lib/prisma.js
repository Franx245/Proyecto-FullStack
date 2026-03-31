import "./load-env.js";
import { AsyncLocalStorage } from "node:async_hooks";
import prismaPkg from "@prisma/client";

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
        url.searchParams.set("connect_timeout", "15");
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
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    errorFormat: "minimal",
    transactionOptions: {
      maxWait: 5000,
      timeout: 10000,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__duelvaultPrisma = prisma;
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
