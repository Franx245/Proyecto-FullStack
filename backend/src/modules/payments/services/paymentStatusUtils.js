const SUPPORTED_FAKE_PAYMENT_STATUSES = new Set(["approved", "rejected", "pending"]);

export function isMercadoPagoProcessingStatus(status) {
  return ["pending", "in_process", "authorized", "in_mediation"].includes(
    String(status || "").trim().toLowerCase()
  );
}

export function hasMercadoPagoPaymentAttempt(order) {
  return Boolean(String(order?.payment_id || "").trim());
}

export function normalizeMercadoPagoPaymentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeMercadoPagoPaymentStatusDetail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

export function hasApprovedMercadoPagoPayment(order) {
  return hasMercadoPagoPaymentAttempt(order)
    && normalizeMercadoPagoPaymentStatus(order?.payment_status) === "approved";
}

export function normalizeFakePaymentStatus(value) {
  const normalized = String(value || "approved")
    .trim()
    .toLowerCase();

  return SUPPORTED_FAKE_PAYMENT_STATUSES.has(normalized)
    ? normalized
    : "approved";
}