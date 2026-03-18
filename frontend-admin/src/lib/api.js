const SESSION_KEY = "duelvault_admin_session";

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

async function refreshAccessToken() {
  const session = getStoredSession();
  if (!session?.refreshToken) {
    throw new Error("Session expired");
  }

  const response = await fetch("/api/admin/refresh", {
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

async function request(path, { method = "GET", body, retryOnAuthError = true } = {}) {
  const session = getStoredSession();
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && retryOnAuthError && session?.refreshToken) {
    await refreshAccessToken();
    return request(path, { method, body, retryOnAuthError: false });
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

export async function loginAdmin(credentials) {
  const payload = await request("/api/admin/login", {
    method: "POST",
    body: credentials,
    retryOnAuthError: false,
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
  return request("/api/admin/dashboard");
}

export async function getCards() {
  return request("/api/admin/cards");
}

export async function updateCard(cardId, updates) {
  return request(`/api/admin/cards/${cardId}`, {
    method: "PUT",
    body: updates,
  });
}

export async function updateCardsBulk(ids, updates) {
  return request("/api/admin/cards/bulk", {
    method: "PUT",
    body: { ids, updates },
  });
}

export async function getOrders() {
  return request("/api/admin/orders");
}

export async function updateOrderStatus(orderId, status) {
  return request(`/api/admin/orders/${orderId}/status`, {
    method: "PUT",
    body: { status },
  });
}

export async function deleteOrder(orderId) {
  return request(`/api/admin/orders/${orderId}`, {
    method: "DELETE",
  });
}

export async function clearOrders() {
  return request("/api/admin/orders", {
    method: "DELETE",
  });
}

export async function getCustomCategories() {
  return request("/api/admin/custom/categories");
}

export async function createCustomCategory(payload) {
  return request("/api/admin/custom/categories", {
    method: "POST",
    body: payload,
  });
}

export async function updateCustomCategory(categoryId, payload) {
  return request(`/api/admin/custom/categories/${categoryId}`, {
    method: "PUT",
    body: payload,
  });
}

export async function getCustomProducts() {
  return request("/api/admin/custom/products");
}

export async function createCustomProduct(payload) {
  return request("/api/admin/custom/products", {
    method: "POST",
    body: payload,
  });
}

export async function updateCustomProduct(productId, payload) {
  return request(`/api/admin/custom/products/${productId}`, {
    method: "PUT",
    body: payload,
  });
}