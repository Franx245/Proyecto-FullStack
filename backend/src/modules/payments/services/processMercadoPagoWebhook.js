export async function processMercadoPagoWebhook({
  body,
  query,
  requestId = null,
  dependencies,
}) {
  const {
    assertMercadoPagoWebhookConfigured,
    extractMercadoPagoPaymentId,
    logEvent,
    mercadoPagoPaymentClient,
    scheduleMercadoPagoReconciliation,
    unwrapMercadoPagoBody,
    validateMercadoPagoWebhookSignature,
  } = dependencies;

  assertMercadoPagoWebhookConfigured();

  const notificationType = String(body?.type || query?.type || "payment").trim().toLowerCase();
  if (notificationType && notificationType !== "payment") {
    logEvent("MERCADOPAGO_WEBHOOK_IGNORED", "Ignoring unsupported Mercado Pago webhook", {
      type: notificationType,
      requestId,
    });
    return {
      statusCode: 200,
      body: { received: true, ignored: true },
    };
  }

  const paymentId = extractMercadoPagoPaymentId(body || {}, query || {});
  if (!paymentId) {
    return {
      statusCode: 200,
      body: { received: true, ignored: true, reason: "missing_payment_id" },
    };
  }

  const signatureMeta = validateMercadoPagoWebhookSignature(paymentId);
  const paymentResponse = await mercadoPagoPaymentClient.get({ id: paymentId });
  const payment = unwrapMercadoPagoBody(paymentResponse);
  const reconciliationJob = await scheduleMercadoPagoReconciliation({
    payment,
    paymentIdOverride: paymentId,
    providerRequestId: signatureMeta.providerRequestId,
    source: "mercadopago_webhook",
  });

  const reconciliation = reconciliationJob.result || {
    received: true,
    ignored: false,
    reason: null,
    order: null,
    outcome: null,
  };

  return {
    statusCode: 200,
    body: {
      received: true,
      ...(reconciliationJob.queued ? { queued: true, jobId: reconciliationJob.jobId } : {}),
      ...(reconciliation.ignored ? { ignored: true, reason: reconciliation.reason } : {}),
    },
  };
}