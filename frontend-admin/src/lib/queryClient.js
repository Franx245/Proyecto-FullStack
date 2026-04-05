import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { getStoredSession, normalizeOrderRecord } from "./api";

const QUERY_CACHE_KEY = "duelvault_admin_query_cache_v5";
const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 12;
const PERSISTABLE_QUERY_PREFIXES = ["dashboard", "inventory-cards", "orders", "users"];
let flushPersistedCache = null;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getStoredAdminId() {
  try {
    return getStoredSession()?.admin?.id || null;
  } catch {
    return null;
  }
}

function normalizePersistedOrder(order) {
  return normalizeOrderRecord(order);
}

function normalizePersistedQueryData(prefix, data) {
  if (!data || typeof data !== "object") {
    return data;
  }

  if (prefix === "orders" && Array.isArray(data.orders)) {
    return {
      ...data,
      orders: data.orders.map(normalizePersistedOrder),
    };
  }

  if (prefix === "dashboard" && Array.isArray(data.recentOrders)) {
    return {
      ...data,
      recentOrders: data.recentOrders.map(normalizePersistedOrder),
    };
  }

  return data;
}

function normalizePersistedClientState(clientState) {
  if (!clientState || !Array.isArray(clientState.queries)) {
    return clientState;
  }

  return {
    ...clientState,
    queries: clientState.queries.map((query) => {
      const prefix = query?.queryKey?.[0];
      if (typeof prefix !== "string") {
        return query;
      }

      return {
        ...query,
        state: {
          ...query.state,
          data: normalizePersistedQueryData(prefix, query.state?.data),
        },
      };
    }),
  };
}

function shouldRetryQuery(failureCount, error) {
  if (failureCount >= 2) {
    return false;
  }

  if (error?.status === 409 || error?.code === "CONFLICT") {
    return false;
  }

  if (error?.status === 408 || error?.code === "TIMEOUT") {
    return false;
  }

  if (error?.status >= 400 && error?.status < 500 && error?.status !== 408) {
    return false;
  }

  return true;
}

function restorePersistedCache(queryClient) {
  if (!canUseStorage()) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(QUERY_CACHE_KEY);
    if (!raw) {
      return;
    }

    const persisted = JSON.parse(raw);
    if (!persisted?.timestamp || !persisted?.clientState) {
      window.localStorage.removeItem(QUERY_CACHE_KEY);
      return;
    }

    if (Date.now() - persisted.timestamp > QUERY_CACHE_MAX_AGE) {
      window.localStorage.removeItem(QUERY_CACHE_KEY);
      return;
    }

    const currentAdminId = getStoredAdminId();
    if (persisted.adminId && currentAdminId && persisted.adminId !== currentAdminId) {
      window.localStorage.removeItem(QUERY_CACHE_KEY);
      return;
    }

    hydrate(queryClient, normalizePersistedClientState(persisted.clientState));
  } catch {
    window.localStorage.removeItem(QUERY_CACHE_KEY);
  }
}

function persistQueryCache(queryClient) {
  if (!canUseStorage()) {
    return () => {};
  }

  let timeoutId = null;

  const flush = () => {
    timeoutId = null;

    try {
      const clientState = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== "success") {
            return false;
          }

          const prefix = query.queryKey?.[0];
          return typeof prefix === "string" && PERSISTABLE_QUERY_PREFIXES.includes(prefix);
        },
        shouldDehydrateMutation: () => false,
      });

      if (!clientState.queries?.length && !clientState.mutations?.length) {
        window.localStorage.removeItem(QUERY_CACHE_KEY);
        return;
      }

      window.localStorage.setItem(
        QUERY_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          adminId: getStoredAdminId(),
          clientState,
        })
      );
    } catch {
      window.localStorage.removeItem(QUERY_CACHE_KEY);
    }
  };

  flushPersistedCache = flush;

  const scheduleFlush = () => {
    if (timeoutId !== null) {
      return;
    }

    timeoutId = window.setTimeout(flush, 2000);
  };

  const unsubscribeQueryCache = queryClient.getQueryCache().subscribe(scheduleFlush);
  const unsubscribeMutationCache = queryClient.getMutationCache().subscribe(scheduleFlush);
  window.addEventListener("beforeunload", flush);

  return () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    unsubscribeQueryCache();
    unsubscribeMutationCache();
    window.removeEventListener("beforeunload", flush);
    if (flushPersistedCache === flush) {
      flushPersistedCache = null;
    }
  };
}

export function clearPersistedAdminQueryCache() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(QUERY_CACHE_KEY);
}

export function persistAdminQueryCacheNow() {
  if (typeof flushPersistedCache === "function") {
    flushPersistedCache();
  }
}

export function createAdminQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: QUERY_CACHE_MAX_AGE,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(1000 * attempt, 2500),
      },
    },
  });

  restorePersistedCache(queryClient);
  persistQueryCache(queryClient);

  return queryClient;
}
