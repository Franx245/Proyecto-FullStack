/**
 * @typedef {Object} CatalogQueryOptions
 * @property {number} [page]
 * @property {number} [pageSize]
 * @property {string} [search]
 * @property {string} [category]
 * @property {number} [minPrice]
 * @property {number} [maxPrice]
 * @property {{min?: number, max?: number}} [priceRange]
 * @property {string[]} [rarities]
 * @property {string[]} [cardTypes]
 * @property {string[]} [conditions]
 * @property {string[]} [sets]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} CheckoutAddress
 * @property {number} [id]
 * @property {string} label
 * @property {string} recipient_name
 * @property {string} phone
 * @property {string} line1
 * @property {string} [line2]
 * @property {string} city
 * @property {string} state
 * @property {string} postal_code
 * @property {string} zone
 * @property {string} [notes]
 * @property {boolean} [is_default]
 */

/**
 * @typedef {Object} CheckoutPayload
 * @property {Array<{ cardId: number, quantity: number }>} items
 * @property {string} customer_name
 * @property {string} phone
 * @property {string} shipping_zone
 * @property {string} [shipping_carrier]
 * @property {string} [notes]
 * @property {string} [mutation_id]
 * @property {boolean} accepted
 * @property {number} [addressId]
 * @property {CheckoutAddress} [address]
 * @property {boolean} [save_address]
 */

/**
 * @typedef {Object} CheckoutOrderSummary
 * @property {number|string} id
 * @property {string} [status]
 * @property {number|string} [total]
 * @property {number|string} [total_ars]
 */

import {
  clearStoredUserSession,
  getStoredUserSession,
  getUsableStoredUserSession,
  isJwtExpired,
  setStoredUserSession,
} from "@/lib/userSession";
import { ENV } from "@/config/env";

const INITIAL_CATALOG_BOOTSTRAP_KEY = "__DUELVAULT_INITIAL_CATALOG__";
const PERSISTED_QUERY_CACHE_KEY = "duelvault-react-query-cache-v2";
export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_QUERY_STALE_TIME = 1000 * 60;
export const CATALOG_QUERY_GC_TIME = 1000 * 60 * 5;
/** @type {string | null} */
let persistedQueryStateCacheRaw = null;
/** @type {any} */
let persistedQueryStateCacheValue = null;

/**
 * @param {any} payload
 */
function normalizeCatalogPayload(payload) {
  return {
    cards: payload?.cards ?? [],
    totalPages: payload?.totalPages ?? 0,
    totalRows: payload?.total ?? 0,
    filters: payload?.filters ?? { rarities: [], sets: [] },
    version: payload?.version ?? null,
  };
}

/**
 * @param {any} value
 */
function isEmptyArray(value) {
  return !Array.isArray(value) || value.length === 0;
}

function readInitialCatalogBootstrap() {
  if (typeof window === "undefined") {
    return null;
  }
  // Acceso seguro y tipado para evitar 'any' implícito
  const win = window;
  if (typeof INITIAL_CATALOG_BOOTSTRAP_KEY === 'string' && Object.prototype.hasOwnProperty.call(win, INITIAL_CATALOG_BOOTSTRAP_KEY)) {
    // @ts-ignore
    return win[INITIAL_CATALOG_BOOTSTRAP_KEY];
  }
  return null;
}

function readPersistedQueryState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PERSISTED_QUERY_CACHE_KEY);
    if (!raw) {
      persistedQueryStateCacheRaw = null;
      persistedQueryStateCacheValue = null;
      return null;
    }

    if (raw === persistedQueryStateCacheRaw) {
      return persistedQueryStateCacheValue;
    }

    const parsed = JSON.parse(raw);
    persistedQueryStateCacheRaw = raw;
    persistedQueryStateCacheValue = parsed?.clientState ?? null;
    return persistedQueryStateCacheValue;
  } catch {
    persistedQueryStateCacheRaw = null;
    persistedQueryStateCacheValue = null;
    return null;
  }
}

/** @param {(entry: any) => boolean} matcher */
function readPersistedQueryData(matcher) {
  const clientState = readPersistedQueryState();
  const queries = Array.isArray(clientState?.queries) ? clientState.queries : [];

  for (const entry of queries) {
    if (matcher(entry)) {
      return entry?.state?.data;
    }
  }

  return undefined;
}

/**
 * @param {CatalogQueryOptions} [options]
 */
function canUseInitialCatalogBootstrap(options = {}) {
  const bootstrap = readInitialCatalogBootstrap();
  if (!bootstrap) {
    return false;
  }

  const requestedCategory = typeof options.category === "string" ? options.category.trim() : "";
  const bootstrapCategory = typeof bootstrap.category === "string" ? bootstrap.category : "";
  const requestedSearch = typeof options.search === "string" ? options.search.trim() : "";

  return (
    (options.page ?? 1) === 1 &&
    (options.pageSize ?? CATALOG_PAGE_SIZE) === CATALOG_PAGE_SIZE &&
    requestedSearch === "" &&
    requestedCategory === bootstrapCategory &&
    options.minPrice == null &&
    options.maxPrice == null &&
    options.priceRange == null &&
    isEmptyArray(options.rarities) &&
    isEmptyArray(options.cardTypes) &&
    isEmptyArray(options.conditions) &&
    isEmptyArray(options.sets)
  );
}

/**
 * @param {CatalogQueryOptions} [options]
 */
export function getInitialCatalogSnapshot(options = {}) {
  if (!canUseInitialCatalogBootstrap(options)) {
    return undefined;
  }

  const bootstrap = readInitialCatalogBootstrap();
  return bootstrap?.payload ? normalizeCatalogPayload(bootstrap.payload) : undefined;
}

/**
 * @param {string} path
 */
function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!ENV.API_BASE_URL) {
    return path;
  }

  return `${ENV.API_BASE_URL}${path}`;
}

/**
 * @param {Record<string, any>} params
 */
function buildQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

/**
 * @param {any} payload
 * @param {string} fallbackMessage
 * @param {object} [extra]
 */
function createRequestError(payload, fallbackMessage, extra = {}) {
  const error = new Error(payload?.error || fallbackMessage);
  if (payload && typeof payload === "object") {
    Object.assign(error, payload);
  }
  if (extra && typeof extra === "object") {
    Object.assign(error, extra);
  }
  return error;
}

function createSessionExpiredError() {
  return createRequestError(
    {
      error: "Session expired",
      code: "SESSION_EXPIRED",
    },
    "Session expired",
    { status: 401 }
  );
}

function createStoreTimeoutError() {
  return createRequestError(
    {
      error: "La operación tardó demasiado. Reintentá.",
      code: "TIMEOUT",
    },
    "La operación tardó demasiado. Reintentá.",
    { status: 408 }
  );
}

function createStoreNetworkError() {
  return createRequestError(
    {
      error: "No se pudo conectar con el servidor.",
      code: "NETWORK_ERROR",
    },
    "No se pudo conectar con el servidor.",
    { status: 0 }
  );
}

/** @param {unknown} error */
function isAbortError(error) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

const scheduleTimeout = typeof globalThis.setTimeout === "function"
  ? globalThis.setTimeout.bind(globalThis)
  : setTimeout;

const clearScheduledTimeout = typeof globalThis.clearTimeout === "function"
  ? globalThis.clearTimeout.bind(globalThis)
  : clearTimeout;

const CHECKOUT_API_TIMEOUT_MS = Math.max(ENV.API_TIMEOUT, 70000);

/**
 * @param {(AbortSignal | undefined)[]} signals
 */
function composeAbortSignal(signals) {
  const activeSignals = signals.filter(Boolean);

  if (!activeSignals.length) {
    return undefined;
  }

  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();

  const abortFrom = (signal) => {
    if (controller.signal.aborted) {
      return;
    }

    controller.abort(signal.reason);
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    signal.addEventListener("abort", () => abortFrom(signal), { once: true });
  }

  return controller.signal;
}

/** @typedef {{ revalidate?: number, tags?: string[] }} StoreNextFetchConfig */
/** @typedef {RequestInit & { timeoutMs?: number, next?: StoreNextFetchConfig }} StoreRequestOptions */
/** @typedef {{ method?: string, body?: any, retryOnAuthError?: boolean, idempotencyKey?: string | null, timeoutMs?: number }} AuthRequestOptions */

export function createStoreMutationId(prefix = "store") {
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}_${randomPart}`;
}

/**
 * @param {string} path
 * @param {StoreRequestOptions} [options]
 */
async function request(path, options = {}) {
  const {
    timeoutMs: timeoutOverride,
    signal: externalSignal,
    headers: requestHeaders,
    ...fetchOptions
  } = options;
  const timeoutMs = Number(timeoutOverride || ENV.API_TIMEOUT) || ENV.API_TIMEOUT;
  const timeoutController = new AbortController();
  const timeoutId = scheduleTimeout(() => timeoutController.abort("timeout"), timeoutMs);
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const hasJsonBody = fetchOptions.body != null && method !== "GET" && method !== "HEAD";
  const t0 = performance.now();
  const requestUrl = buildApiUrl(path);
  const signal = composeAbortSignal([timeoutController.signal, externalSignal]);
  /** @type {StoreRequestOptions} */
  const serverRequestDefaults = typeof window === "undefined" && fetchOptions.cache == null && fetchOptions.next == null
    ? { cache: "no-store" }
    : {};

  try {
    const response = await fetch(requestUrl, {
      ...serverRequestDefaults,
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(requestHeaders || {}),
      },
      ...(signal ? { signal } : {}),
      ...fetchOptions,
    });

    const payload = await response.json().catch(() => ({}));
    const durationMs = Math.round(performance.now() - t0);

    if (durationMs > 2000) {
      console.warn(`[store-api] slow request: ${method} ${path} (${durationMs}ms, status=${response.status})`);
    }

    if (!response.ok) {
      throw createRequestError(payload, "Request failed", { status: response.status });
    }

    return payload;
  } catch (error) {
    if (isAbortError(error)) {
      if (timeoutController.signal.aborted) {
        throw createStoreTimeoutError();
      }

      throw error;
    }

    if (error instanceof TypeError) {
      throw createStoreNetworkError();
    }

    throw error;
  } finally {
    clearScheduledTimeout(timeoutId);
  }
}

/**
 * @param {object} payload
 */
export async function submitContactRequest(payload) {
  return request("/api/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function refreshUserAccessToken() {
  const session = getUsableStoredUserSession();
  if (!session?.refreshToken) {
    throw createSessionExpiredError();
  }

  const payload = await request("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  const nextSession = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };

  setStoredUserSession(nextSession);
  return nextSession;
}

/**
 * @param {string} path
 * @param {AuthRequestOptions} [options]
 */
async function authRequest(path, { method = "GET", body, retryOnAuthError = true, idempotencyKey = null, timeoutMs = ENV.API_TIMEOUT } = {}) {
  const session = getUsableStoredUserSession();

  if (!session?.accessToken) {
    clearStoredUserSession();
    throw createSessionExpiredError();
  }

  if (retryOnAuthError && session?.accessToken && isJwtExpired(session.accessToken) && session?.refreshToken) {
    try {
      await refreshUserAccessToken();
      return authRequest(path, { method, body, retryOnAuthError: false, idempotencyKey, timeoutMs });
    } catch {
      clearStoredUserSession();
      throw createSessionExpiredError();
    }
  }

  const normalizedMethod = String(method || "GET").toUpperCase();
  const hasJsonBody = body != null && normalizedMethod !== "GET" && normalizedMethod !== "HEAD";
  const controller = new AbortController();
  const effectiveTimeoutMs = Number(timeoutMs || ENV.API_TIMEOUT) || ENV.API_TIMEOUT;
  const timeoutId = scheduleTimeout(() => controller.abort("timeout"), effectiveTimeoutMs);
  const t0 = performance.now();

  try {
    const response = await fetch(buildApiUrl(path), {
      method: normalizedMethod,
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      },
      signal: controller.signal,
      ...(hasJsonBody ? { body: JSON.stringify(body) } : {}),
    });

    const durationMs = Math.round(performance.now() - t0);
    if (durationMs > 2000) {
      console.warn(`[store-api] slow auth request: ${normalizedMethod} ${path} (${durationMs}ms, status=${response.status})`);
    }

    if (response.status === 401 && retryOnAuthError && session?.refreshToken) {
      try {
        await refreshUserAccessToken();
        return authRequest(path, { method, body, retryOnAuthError: false, idempotencyKey, timeoutMs: effectiveTimeoutMs });
      } catch {
        clearStoredUserSession();
        throw createSessionExpiredError();
      }
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw createRequestError(payload, "Request failed", { status: response.status });
    }

    return payload;
  } catch (error) {
    if (isAbortError(error)) {
      throw createStoreTimeoutError();
    }

    if (error instanceof TypeError) {
      throw createStoreNetworkError();
    }

    throw error;
  } finally {
    clearScheduledTimeout(timeoutId);
  }
}

/**
 * @param {CatalogQueryOptions} [options]
 */
export async function fetchCatalogCards(options = {}) {
  if (canUseInitialCatalogBootstrap(options)) {
    const bootstrap = readInitialCatalogBootstrap();

    if (bootstrap?.payload) {
      return normalizeCatalogPayload(bootstrap.payload);
    }

    if (bootstrap?.promise) {
      const payload = await bootstrap.promise.catch(() => null);
      if (payload) {
        return normalizeCatalogPayload(payload);
      }
    }
  }

  const search = typeof options.search === "string" ? options.search.trim() : "";
  const priceRange = options.priceRange ?? null;
  const query = buildQuery({
    page: options.page ?? 1,
    pageSize: options.pageSize ?? CATALOG_PAGE_SIZE,
    q: search,
    category: options.category,
    minPrice: priceRange?.min ?? options.minPrice,
    maxPrice: priceRange?.max ?? options.maxPrice,
    rarities: options.rarities,
    cardTypes: options.cardTypes,
    conditions: options.conditions,
    sets: options.sets,
  });

  /** @type {StoreRequestOptions} */
  const serverCatalogCacheOptions = typeof window === "undefined" && !options.signal
    ? {
        cache: "force-cache",
        next: { revalidate: 60 },
      }
    : {};

  const payload = await request(`/api/catalog?${query}`, {
    ...serverCatalogCacheOptions,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  return normalizeCatalogPayload(payload);
}

export async function fetchCardSets() {
  const persistedSets = readPersistedQueryData(
    /** @param {{ queryKey?: unknown }} entry */
    (entry) => Array.isArray(entry?.queryKey) && entry.queryKey[0] === "ygopro-card-sets"
  );

  if (Array.isArray(persistedSets) && persistedSets.length > 0) {
    return persistedSets;
  }

  const payload = await request("/api/catalog/filters");
  return payload.filters?.sets ?? [];
}

export async function fetchFeaturedCards(limit = 5) {
  const payload = await request(`/api/catalog?featured=true&page=1&pageSize=${limit}`);
  return payload.cards ?? [];
}

export async function fetchLatestArrivalCards(limit = 5) {
  const payload = await request(`/api/catalog?latest=true&page=1&pageSize=${limit}`);
  return payload.cards ?? [];
}

export async function fetchVisibleCustomCategoryTree() {
  const payload = await request("/api/custom/categories/tree");
  return payload.categories ?? [];
}

/**
 * @param {string} [slugPath]
 */
export async function fetchCustomCategoryByPath(slugPath = "") {
  const query = buildQuery({ slugPath });
  return request(`/api/custom/categories/path?${query}`);
}

/**
 * @param {string|number} slug
 */
export async function fetchCustomProductDetail(slug) {
  return request(`/api/custom/products/${slug}`);
}

/**
 * @param {string|number} id
 */
export async function fetchCardDetail(id) {
  /** @type {StoreRequestOptions} */
  const serverDetailCacheOptions = typeof window === "undefined"
    ? {
        cache: "force-cache",
        next: { revalidate: 60 },
      }
    : {};

  return request(`/api/catalog/${id}`, serverDetailCacheOptions);
}

/**
 * @param {CheckoutPayload} payload
 */
export async function checkoutCart(payload) {
  const idempotencyKey = payload && typeof payload === 'object' && payload.mutation_id ? payload.mutation_id : null;
  return authRequest("/api/checkout", {
    method: "POST",
    body: payload,
    idempotencyKey,
    timeoutMs: CHECKOUT_API_TIMEOUT_MS,
  });
}

/**
 * @param {string|number} orderId
 * @param {{ mutationId?: string }} [options]
 */
export async function createCheckoutPreference(orderId, options = {}) {
  return authRequest("/api/checkout/create-preference", {
    method: "POST",
    body: {
      orderId,
      mutation_id: options.mutationId || null,
    },
    idempotencyKey: options.mutationId || null,
    timeoutMs: CHECKOUT_API_TIMEOUT_MS,
  });
}

/**
 * @param {object} payload
 * @param {{ mutationId?: string }} [options]
 */
/**
 * @param {object} payload
 * @param {{ mutationId?: string }} [options]
 */
export async function createDirectPayment(payload, options = {}) {
  const mutationId = String(options.mutationId || (payload && typeof payload === 'object' && 'mutation_id' in payload ? payload.mutation_id : '')) || null;
  return authRequest("/api/payments/create", {
    method: "POST",
    body: {
      ...payload,
      mutation_id: mutationId,
    },
    idempotencyKey: mutationId,
    timeoutMs: CHECKOUT_API_TIMEOUT_MS,
  });
}

/**
 * @param {Array<string|number>} ids
 */
export async function fetchOrdersByIds(ids) {
  if (!ids.length) {
    return { orders: [] };
  }

  return authRequest(`/api/orders?ids=${ids.join(",")}`, {
    timeoutMs: CHECKOUT_API_TIMEOUT_MS,
  });
}

/**
 * @param {string|number} orderId
 */
export async function fetchMyOrder(orderId) {
  const payload = await authRequest(`/api/orders?ids=${encodeURIComponent(String(orderId))}`, {
    timeoutMs: CHECKOUT_API_TIMEOUT_MS,
  });
  return {
    order: Array.isArray(payload?.orders) ? (payload.orders[0] ?? null) : null,
  };
}

/**
 * @param {object} credentials
 */
export async function loginUser(credentials) {
  const payload = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  const session = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
  setStoredUserSession(session);
  return session;
}

/**
 * @param {object} payload
 */
export async function registerUser(payload) {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const session = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
  };
  setStoredUserSession(session);
  return session;
}

export async function logoutUser() {
  const session = getUsableStoredUserSession() ?? getStoredUserSession();
  try {
    if (session?.refreshToken) {
      await request("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    }
  } finally {
    clearStoredUserSession();
  }
}

export async function fetchCurrentUser() {
  return authRequest("/api/auth/me");
}

/**
 * @param {object} payload
 */
export async function updateMyProfile(payload) {
  return authRequest("/api/auth/profile", {
    method: "PUT",
    body: payload,
  });
}

/**
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function fetchRuntimeConfig() {
  const payload = await fetchStorefrontConfig();
  return {
    runtime: payload?.storefront || null,
    storefront: payload?.storefront || null,
  };
}

export async function fetchStorefrontConfig() {
  return request("/api/storefront/config");
}

/**
 * @param {object} credentials
 */
export async function loginAdminFromStorefront(credentials) {
  return request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

/**
 * @param {string} token
 * @param {string} password
 */
export async function resetPassword(token, password) {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function fetchMyAddresses() {
  return authRequest("/api/auth/addresses");
}

/**
 * @param {CheckoutAddress} payload
 */
export async function createMyAddress(payload) {
  return authRequest("/api/auth/addresses", {
    method: "POST",
    body: payload,
  });
}

/**
 * @param {number|string} addressId
 * @param {CheckoutAddress} payload
 */
export async function updateMyAddress(addressId, payload) {
  return authRequest(`/api/auth/addresses/${addressId}`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * @param {number|string} addressId
 */
export async function deleteMyAddress(addressId) {
  return authRequest(`/api/auth/addresses/${addressId}`, {
    method: "DELETE",
  });
}

export async function fetchMyOrders({ page = 1, limit = 10 } = {}) {
  return authRequest(`/api/auth/orders?page=${page}&limit=${limit}`);
}

/**
 * @param {{ postalCode: string, city?: string, state?: string, zone?: string, itemCount?: number, weight?: number }} params
 */
export async function fetchShippingRates({ postalCode, city, state, zone, itemCount, weight }) {
  return authRequest("/api/shipping/rates", {
    method: "POST",
    body: { postal_code: postalCode, city, state, zone, item_count: itemCount, weight },
  });
}

/**
 * @param {string} trackingCode
 */
export async function fetchShippingTracking(trackingCode) {
  return authRequest(`/api/shipping/tracking/${encodeURIComponent(trackingCode)}`);
}

export async function fetchMyActivity() {
  return authRequest("/api/auth/activity");
}
