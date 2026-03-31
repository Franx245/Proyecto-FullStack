const STORAGE_KEY = "duelvault_order_ids";

function getSafeStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readIds() {
  try {
    const storage = getSafeStorage();
    if (!storage) {
      return [];
    }

    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getTrackedOrderIds() {
  return readIds();
}

export function trackOrderId(orderId) {
  const nextIds = [orderId, ...readIds().filter((id) => id !== orderId)];
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(nextIds.slice(0, 20)));
}

export function clearTrackedOrderIds() {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(STORAGE_KEY);
}