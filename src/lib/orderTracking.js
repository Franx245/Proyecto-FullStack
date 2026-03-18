const STORAGE_KEY = "duelvault_order_ids";

function readIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIds.slice(0, 20)));
}

export function clearTrackedOrderIds() {
  localStorage.removeItem(STORAGE_KEY);
}