function normalizePaymentId(payment) {
  return String(payment?.id || "").trim() || null;
}

export function buildPersistDirectPaymentAttemptInput({
  prepared,
  orderId,
  userId,
  payment,
  paymentStatus,
  paymentStatusDetail,
}) {
  return {
    orderId,
    userId,
    paymentId: normalizePaymentId(payment),
    paymentStatus,
    paymentStatusDetail,
    exchangeRate: prepared.exchangeRate,
    totalArs: prepared.totalArs,
    expiresAt: prepared.expiresAt,
  };
}

export function buildFinalizeApprovedFakePaymentInput({
  prepared,
  orderId,
  userId,
  payment,
  paymentStatus,
  paymentStatusDetail,
}) {
  return {
    orderId,
    userId,
    paymentId: normalizePaymentId(payment),
    paymentStatus,
    paymentStatusDetail,
    exchangeRate: prepared.exchangeRate,
    totalArs: prepared.totalArs,
    expiresAt: prepared.expiresAt,
  };
}

export function buildPersistDirectPaymentProviderFailureInput({
  prepared,
  orderId,
  userId,
  paymentStatusDetail,
}) {
  return {
    orderId,
    userId,
    paymentStatusDetail,
    exchangeRate: prepared.exchangeRate,
    totalArs: prepared.totalArs,
    expiresAt: prepared.expiresAt,
  };
}