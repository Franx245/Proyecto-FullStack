import {
  createRequestId,
  recordAdminError,
  recordAdminEvent,
  recordSlowInteraction,
} from "./observability";

const SESSION_KEY = "duelvault_admin_session";

function normalizeBaseUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
}

const RAILWAY_BACKEND_URL = "https://proyecto-fullstack-production-8fe1.up.railway.app";

function resolveApiBaseUrl() {
  const configuredBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window === "undefined") {
    return RAILWAY_BACKEND_URL;
  }

  const { hostname } = window.location;
  if (["localhost", "127.0.0.1"].includes(hostname)) {
    return "";
  }

  return RAILWAY_BACKEND_URL;
}

const API_BASE_URL = resolveApiBaseUrl();
const DEFAULT_API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT || 20000);
const inflightMutationRequests = new Map();

export class ApiRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryable = Boolean(options.retryable);
  }
}

export class ApiTimeoutError extends ApiRequestError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ApiTimeoutError";
  }
}

export class ApiConflictError extends ApiRequestError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ApiConflictError";
  }
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function buildAdminEventStreamUrl(session = getStoredSession()) {
  if (!session?.accessToken) {
    return "";
  }

  const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1";
  const url = new URL(buildApiUrl("/api/admin/events/stream"), baseOrigin);
  url.searchParams.set("accessToken", session.accessToken);
  return url.toString();
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createApiError(payload, fallbackMessage, options = {}) {
  const message = payload?.error || fallbackMessage;
  const common = {
    status: options.status,
    code: payload?.code || options.code,
    details: payload,
    requestId: options.requestId,
    retryable: Boolean(options.retryable),
  };

  if (options.status === 409 || payload?.code === "CONFLICT") {
    return new ApiConflictError(message, common);
  }

  return new ApiRequestError(message, common);
}

function shouldRetryRequest({ method, status, error, attempt }) {
  if (attempt >= 1) {
    return false;
  }

  if (method !== "GET") {
    return false;
  }

  if (error instanceof ApiTimeoutError) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return false;
}

function buildMutationRequestKey(method, path, idempotencyKey, dedupeKey) {
  return `${method}:${path}:${dedupeKey || idempotencyKey || "default"}`;
}

export function isConflictError(error) {
  return error instanceof ApiConflictError || error?.code === "CONFLICT" || error?.status === 409;
}

export function isTimeoutError(error) {
  return error instanceof ApiTimeoutError;
}

async function refreshAccessToken() {
  const session = getStoredSession();
  if (!session?.refreshToken) {
    throw new Error("Session expired");
  }

  const response = await fetch(buildApiUrl("/api/admin/refresh"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    clearStoredSession();
    throw new Error(payload.error || "Session expired");
  }

  const nextSession = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    admin: payload.admin,
  };

  setStoredSession(nextSession);
  return nextSession;
}

export async function refreshAdminSession() {
  return refreshAccessToken();
}

async function request(path, { method = "GET", body, retryOnAuthError = true, timeoutMs = DEFAULT_API_TIMEOUT_MS, attempt = 0, requestLabel, idempotencyKey, dedupeKey, headers = {} } = {}) {
  const session = getStoredSession();
  const requestId = createRequestId("api");
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
  const requestUrl = buildApiUrl(path);
  const mutationRequestKey = method !== "GET" ? buildMutationRequestKey(method, path, idempotencyKey, dedupeKey) : null;

  if (mutationRequestKey && inflightMutationRequests.has(mutationRequestKey)) {
    return inflightMutationRequests.get(mutationRequestKey);
  }

  const requestPromise = (async () => {
    try {
      const response = await fetch(requestUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
          ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
          ...headers,
        },
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (response.status === 401 && retryOnAuthError && session?.refreshToken) {
        await refreshAccessToken();
        return request(path, { method, body, retryOnAuthError: false, timeoutMs, requestLabel, idempotencyKey, dedupeKey, headers });
      }

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const apiError = createApiError(payload, "Request failed", {
          status: response.status,
          requestId,
          retryable: response.status >= 500,
        });

        if (shouldRetryRequest({ method, status: response.status, error: apiError, attempt })) {
          await delay(250 * (attempt + 1));
          return request(path, { method, body, retryOnAuthError, timeoutMs, attempt: attempt + 1, requestLabel, idempotencyKey, dedupeKey, headers });
        }

        throw apiError;
      }

      const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const durationMs = finishedAt - startedAt;

      recordAdminEvent("api-success", {
        request_id: requestId,
        label: requestLabel || `${method} ${path}`,
        method,
        path,
        duration_ms: Math.round(durationMs),
        status: response.status,
      });
      recordSlowInteraction(requestLabel || `${method} ${path}`, durationMs, {
        method,
        path,
        source: "api",
      });

      return payload;
    } catch (error) {
      const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const durationMs = finishedAt - startedAt;

      if (error?.name === "AbortError") {
        const timeoutError = new ApiTimeoutError("La operación tardó demasiado. Reintentá.", {
          status: 408,
          code: "TIMEOUT",
          requestId,
          retryable: method === "GET",
        });

        if (shouldRetryRequest({ method, status: 408, error: timeoutError, attempt })) {
          await delay(250 * (attempt + 1));
          return request(path, { method, body, retryOnAuthError, timeoutMs, attempt: attempt + 1, requestLabel, idempotencyKey, dedupeKey, headers });
        }

        recordAdminError(timeoutError, { method, path, duration_ms: Math.round(durationMs) });
        throw timeoutError;
      }

      if (shouldRetryRequest({ method, status: error?.status || 0, error, attempt })) {
        await delay(250 * (attempt + 1));
        return request(path, { method, body, retryOnAuthError, timeoutMs, attempt: attempt + 1, requestLabel, idempotencyKey, dedupeKey, headers });
      }

      recordAdminError(error, {
        method,
        path,
        label: requestLabel || `${method} ${path}`,
        duration_ms: Math.round(durationMs),
      });
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      if (mutationRequestKey) {
        inflightMutationRequests.delete(mutationRequestKey);
      }
    }
  })();

  if (mutationRequestKey) {
    inflightMutationRequests.set(mutationRequestKey, requestPromise);
  }

  return requestPromise;
}

async function requestBlob(path, { method = "GET", retryOnAuthError = true, timeoutMs = DEFAULT_API_TIMEOUT_MS } = {}) {
  const session = getStoredSession();
  const requestId = createRequestId("blob");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(buildApiUrl(path), {
      method,
      signal: controller.signal,
      headers: {
        "X-Request-Id": requestId,
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    });

    if (response.status === 401 && retryOnAuthError && session?.refreshToken) {
      await refreshAccessToken();
      return requestBlob(path, { method, retryOnAuthError: false, timeoutMs });
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw createApiError(payload, "Request failed", {
        status: response.status,
        requestId,
        retryable: response.status >= 500,
      });
    }

    return {
      blob: await response.blob(),
      fileName: response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] || "orders.xlsx",
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiTimeoutError("La exportación tardó demasiado. Reintentá.", {
        status: 408,
        code: "TIMEOUT",
        requestId,
      });
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loginAdmin(credentials) {
  const payload = await request("/api/admin/login", {
    method: "POST",
    body: credentials,
    retryOnAuthError: false,
    requestLabel: "login-admin",
  });

  const session = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    admin: payload.admin,
  };

  setStoredSession(session);
  return session;
}

export async function getDashboard() {
  return request("/api/admin/dashboard", { requestLabel: "load-dashboard" });
}

export async function getWhatsappSettings() {
  return request("/api/admin/settings/whatsapp", { requestLabel: "load-whatsapp-settings" });
}

export async function updateWhatsappSettings(payload) {
  return request("/api/admin/settings/whatsapp", {
    method: "PUT",
    body: payload,
    requestLabel: "update-whatsapp-settings",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function getContactRequests() {
  return request("/api/admin/contact-requests", { requestLabel: "load-contact-requests" });
}

export async function updateContactRequestStatus(contactRequestId, payload) {
  return request(`/api/admin/contact-requests/${contactRequestId}`, {
    method: "PATCH",
    body: payload,
    requestLabel: "update-contact-request",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: `${contactRequestId}:${payload?.status || "notes"}`,
  });
}

export async function getCards(params = {}) {
  return request(`/api/admin/cards${buildQueryString(params)}`, { requestLabel: "load-admin-cards" });
}

export async function getInventoryCards(params = {}) {
  return request(`/api/admin/inventory${buildQueryString(params)}`, { requestLabel: "load-inventory-cards" });
}

export async function searchAdminCards(params = {}) {
  return request(`/api/admin/cards/search${buildQueryString(params)}`, { requestLabel: "search-admin-cards" });
}

export async function addCardToInventory(payload) {
  return request("/api/admin/inventory", {
    method: "POST",
    body: payload,
    requestLabel: "add-card-to-inventory",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: `${payload?.cardId || payload?.card_id || "card"}:${payload?.quantity || 0}`,
  });
}

export async function getCatalogScopeSettings() {
  return request("/api/admin/settings/catalog-scope", { requestLabel: "load-catalog-scope" });
}

export async function updateCatalogScopeSettings(payload) {
  return request("/api/admin/settings/catalog-scope", {
    method: "PUT",
    body: payload,
    requestLabel: "update-catalog-scope",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function syncCatalogToScope(payload = {}) {
  return request("/api/admin/cards/sync-catalog", {
    method: "POST",
    body: payload,
    requestLabel: "sync-catalog-to-scope",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function updateCard(cardId, updates) {
  return request(`/api/admin/cards/${cardId}`, {
    method: "PUT",
    body: updates,
    requestLabel: "update-card",
    idempotencyKey: updates?.mutation_id,
    dedupeKey: `${cardId}:${updates?.expected_updated_at || "unknown"}`,
  });
}

function normalizeCardSelectionPayload(selectionOrIds) {
  if (Array.isArray(selectionOrIds)) {
    return { ids: selectionOrIds };
  }

  if (selectionOrIds && typeof selectionOrIds === "object") {
    return {
      ids: Array.isArray(selectionOrIds.ids) ? selectionOrIds.ids : [],
      filters: selectionOrIds.filters || undefined,
      select_all_matching: Boolean(selectionOrIds.select_all_matching),
    };
  }

  return { ids: [] };
}

export async function updateCardsBulk(selectionOrIds, updates) {
  const payload = { ...normalizeCardSelectionPayload(selectionOrIds), updates };
  return request("/api/admin/cards/bulk", {
    method: "PUT",
    body: payload,
    requestLabel: "bulk-update-cards",
    idempotencyKey: updates?.mutation_id,
  });
}

export async function deleteCards(selectionOrIds) {
  const payload = normalizeCardSelectionPayload(selectionOrIds);
  return request("/api/admin/cards", {
    method: "DELETE",
    body: payload,
    requestLabel: "delete-cards",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function getAdminCardDetail(cardId) {
  return request(`/api/admin/cards/${cardId}`, { requestLabel: "load-admin-card-detail" });
}

export async function getOrders(params = {}) {
  return request(`/api/admin/orders${buildQueryString(params)}`, { requestLabel: "load-orders" });
}

export async function updateOrderShipping(orderId, payload) {
  return request(`/api/admin/orders/${orderId}/shipping`, {
    method: "PUT",
    body: payload,
    requestLabel: "update-order-shipping",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: `${orderId}:${payload?.tracking_code || "shipping"}:${payload?.carrier || "carrier"}`,
  });
}

export async function exportOrdersWorkbook() {
  const { blob, fileName } = await requestBlob("/api/admin/export/orders");
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export async function getUsers(params = {}) {
  return request(`/api/admin/users${buildQueryString(params)}`, { requestLabel: "load-users" });
}

export async function updateUserRole(userId, payload) {
  return request(`/api/admin/users/${userId}/role`, {
    method: "PUT",
    body: payload,
    requestLabel: "update-user-role",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: `${userId}:${payload?.role}`,
  });
}

export async function updateOrderStatus(orderId, payload) {
  return request(`/api/admin/orders/${orderId}/status`, {
    method: "PUT",
    body: payload,
    requestLabel: "update-order-status",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: `${orderId}:${payload?.status}`,
  });
}

export async function deleteOrder(orderId, payload = {}) {
  return request(`/api/admin/orders/${orderId}`, {
    method: "DELETE",
    body: payload,
    requestLabel: "delete-order",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: `${orderId}:delete`,
  });
}

export async function clearOrders(payload = {}) {
  return request("/api/admin/orders", {
    method: "DELETE",
    body: payload,
    requestLabel: "clear-orders",
    idempotencyKey: payload?.mutation_id,
    dedupeKey: "clear-orders",
  });
}

export async function getCustomCategories() {
  return request("/api/admin/custom/categories", { requestLabel: "load-custom-categories" });
}

export async function createCustomCategory(payload) {
  return request("/api/admin/custom/categories", {
    method: "POST",
    body: payload,
    requestLabel: "create-custom-category",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function updateCustomCategory(categoryId, payload) {
  return request(`/api/admin/custom/categories/${categoryId}`, {
    method: "PUT",
    body: payload,
    requestLabel: "update-custom-category",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function getCustomProducts() {
  return request("/api/admin/custom/products", { requestLabel: "load-custom-products" });
}

export async function createCustomProduct(payload) {
  return request("/api/admin/custom/products", {
    method: "POST",
    body: payload,
    requestLabel: "create-custom-product",
    idempotencyKey: payload?.mutation_id,
  });
}

export async function updateCustomProduct(productId, payload) {
  return request(`/api/admin/custom/products/${productId}`, {
    method: "PUT",
    body: payload,
    requestLabel: "update-custom-product",
    idempotencyKey: payload?.mutation_id,
  });
}
