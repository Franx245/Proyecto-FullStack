export async function prepareDirectPaymentContext({
  orderId,
  isFakePayment,
  idempotencyKey,
  mutationId,
  dependencies,
}) {
  const {
    buildMercadoPagoNotificationUrl,
    getMercadoPagoAccountDetails,
    shouldUseMercadoPagoSandboxWebhook,
  } = dependencies;

  const mercadoPagoAccount = isFakePayment ? null : await getMercadoPagoAccountDetails();
  const notificationUrl = isFakePayment
    ? null
    : buildMercadoPagoNotificationUrl({
        useSandboxWebhook: shouldUseMercadoPagoSandboxWebhook(mercadoPagoAccount),
      });
  const providerIdempotencyKey = String(idempotencyKey || mutationId || `${orderId}-${Date.now()}`);

  return {
    mercadoPagoAccount,
    notificationUrl,
    providerIdempotencyKey,
  };
}