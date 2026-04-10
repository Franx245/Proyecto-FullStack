export async function executeDirectPayment({
  isFakePayment,
  prepared,
  providerIdempotencyKey,
  paymentMethodId,
  issuerId,
  installments,
  requestedStatus,
  paymentPayload,
  requestSignal,
  dependencies,
}) {
  const { createFakeDirectPayment, createRealMercadoPagoPayment } = dependencies;

  if (isFakePayment) {
    return createFakeDirectPayment({
      prepared,
      idempotencyKey: providerIdempotencyKey,
      paymentMethodId,
      issuerId,
      installments,
      requestedStatus,
    });
  }

  return createRealMercadoPagoPayment({
    paymentPayload,
    providerIdempotencyKey,
    requestSignal,
  });
}