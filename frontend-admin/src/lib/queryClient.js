import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";

const QUERY_CACHE_KEY = "duelvault_admin_query_cache_v4";
const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 12;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function shouldRetryQuery(failureCount, error) {
  if (failureCount >= 2) {
    return false;
  }

  if (error?.status === 409 || error?.code === "CONFLICT") {
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

    hydrate(queryClient, persisted.clientState);
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
        shouldDehydrateQuery: (query) => query.state.status === "success",
        shouldDehydrateMutation: () => false,
      });

      window.localStorage.setItem(
        QUERY_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          clientState,
        })
      );
    } catch {
      window.localStorage.removeItem(QUERY_CACHE_KEY);
    }
  };

  const scheduleFlush = () => {
    if (timeoutId !== null) {
      return;
    }

    timeoutId = window.setTimeout(flush, 180);
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
  };
}

export function clearPersistedAdminQueryCache() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(QUERY_CACHE_KEY);
}

export function createAdminQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: QUERY_CACHE_MAX_AGE,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(1000 * attempt, 2500),
      },
    },
  });

  restorePersistedCache(queryClient);
  persistQueryCache(queryClient);

  return queryClient;
}