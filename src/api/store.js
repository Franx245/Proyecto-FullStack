import {
  clearStoredUserSession,
  getStoredUserSession,
  setStoredUserSession,
} from "@/lib/userSession";
import { ENV } from "@/config/env";

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!ENV.API_BASE_URL) {
    return path;
  }

  return `${ENV.API_BASE_URL}${path}`;
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

async function request(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function refreshUserAccessToken() {
  const session = getStoredUserSession();
  if (!session?.refreshToken) {
    throw new Error("Session expired");
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

async function authRequest(path, { method = "GET", body, retryOnAuthError = true } = {}) {
  const session = getStoredUserSession();
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && retryOnAuthError && session?.refreshToken) {
    try {
      await refreshUserAccessToken();
      return authRequest(path, { method, body, retryOnAuthError: false });
    } catch {
      clearStoredUserSession();
      throw new Error("Session expired");
    }
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

export async function fetchCatalogCards(options = {}) {
  const search = typeof options.search === "string" ? options.search.trim() : "";
  const priceRange = options.priceRange ?? null;
  const query = buildQuery({
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 20,
    q: search,
    category: options.category,
    minPrice: priceRange?.min ?? options.minPrice,
    maxPrice: priceRange?.max ?? options.maxPrice,
    rarities: options.rarities,
    cardTypes: options.cardTypes,
    conditions: options.conditions,
    sets: options.sets,
  });

  const payload = await request(`/api/cards?${query}`);

  return {
    cards: payload.cards ?? [],
    totalPages: payload.totalPages ?? 0,
    totalRows: payload.total ?? 0,
    filters: payload.filters ?? { rarities: [], sets: [] },
  };
}

export async function fetchCardSets() {
  const payload = await request("/api/cards?page=1&pageSize=100");
  return payload.filters?.sets ?? [];
}

export async function fetchFeaturedCards(limit = 5) {
  const payload = await request(`/api/cards?featured=true&page=1&pageSize=${limit}`);
  return payload.cards ?? [];
}

export async function fetchLatestArrivalCards(limit = 5) {
  const payload = await request(`/api/cards?latest=true&page=1&pageSize=${limit}`);
  return payload.cards ?? [];
}

export async function fetchVisibleCustomCategoryTree() {
  const payload = await request("/api/custom/categories/tree");
  return payload.categories ?? [];
}

export async function fetchCustomCategoryByPath(slugPath = "") {
  const query = buildQuery({ slugPath });
  return request(`/api/custom/categories/path?${query}`);
}

export async function fetchCustomProductDetail(slug) {
  return request(`/api/custom/products/${slug}`);
}

export async function fetchCardDetail(id) {
  return request(`/api/cards/${id}`);
}

export async function checkoutCart(payload) {
  return authRequest("/api/checkout", {
    method: "POST",
    body: payload,
  });
}

export async function fetchOrdersByIds(ids) {
  if (!ids.length) {
    return { orders: [] };
  }

  return request(`/api/orders?ids=${ids.join(",")}`);
}

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
  const session = getStoredUserSession();
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

export async function updateMyProfile(payload) {
  return authRequest("/api/auth/profile", {
    method: "PUT",
    body: payload,
  });
}

export async function requestPasswordReset(email) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function fetchRuntimeConfig() {
  return request("/api/health");
}

export async function fetchStorefrontConfig() {
  return request("/api/storefront/config");
}

export async function loginAdminFromStorefront(credentials) {
  return request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function resetPassword(token, password) {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function fetchMyAddresses() {
  return authRequest("/api/auth/addresses");
}

export async function createMyAddress(payload) {
  return authRequest("/api/auth/addresses", {
    method: "POST",
    body: payload,
  });
}

export async function updateMyAddress(addressId, payload) {
  return authRequest(`/api/auth/addresses/${addressId}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteMyAddress(addressId) {
  return authRequest(`/api/auth/addresses/${addressId}`, {
    method: "DELETE",
  });
}

export async function fetchMyOrders() {
  return authRequest("/api/auth/orders");
}

export async function fetchMyActivity() {
  return authRequest("/api/auth/activity");
}