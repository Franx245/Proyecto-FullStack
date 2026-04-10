export function buildPaymentDebugOrder(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    status: order.status || null,
    subtotal: order.subtotal ?? null,
    shippingCost: order.shippingCost ?? order.shipping_cost ?? null,
    total: order.total ?? null,
    totalArs: order.total_ars ?? null,
    currency: order.currency || null,
    paymentId: order.payment_id || null,
    paymentStatus: order.payment_status || null,
    paymentStatusDetail: order.payment_status_detail || null,
    carrier: order.carrier || null,
    shippingLabel: order.shippingLabel || order.shipping_label || null,
    customerEmail: order.customerEmail || order.customer_email || null,
    expiresAt: order.expires_at || null,
    updatedAt: order.updatedAt || null,
  };
}

export function buildPaymentDebugValidation({
  error,
  preparedOrder,
  paymentDebugContext,
  dependencies,
}) {
  const { isOrderPayableStatus } = dependencies;
  const providerCause = Array.isArray(error?.providerPayload?.cause)
    ? error.providerPayload.cause[0]
    : null;

  return {
    hasOrderId: Number.isFinite(paymentDebugContext.orderId),
    hasToken: Boolean(paymentDebugContext.token),
    hasPaymentMethodId: Boolean(paymentDebugContext.paymentMethodId),
    hasIssuerId: Boolean(paymentDebugContext.issuerId),
    installmentsValid: Number.isInteger(paymentDebugContext.installments) && paymentDebugContext.installments > 0,
    hasIdentification: Boolean(paymentDebugContext.identificationType && paymentDebugContext.identificationNumber),
    orderPrepared: Boolean(preparedOrder?.id),
    orderStatus: preparedOrder?.status || null,
    orderPayable: Boolean(preparedOrder && isOrderPayableStatus(preparedOrder.status)),
    paymentMode: paymentDebugContext.paymentMode,
    testCard: paymentDebugContext.testCard,
    totalPositive: Number(paymentDebugContext.amount.transactionAmount || 0) > 0,
    notificationUrlConfigured: Boolean(paymentDebugContext.notificationUrl),
    providerIdempotencyKey: paymentDebugContext.providerIdempotencyKey || null,
    payerEmail: paymentDebugContext.paymentPayload?.payer?.email || null,
    providerStatusCode: error?.statusCode || null,
    providerReason: error?.reason || null,
    providerMessage: error?.message || null,
    providerCode: providerCause?.code || error?.providerPayload?.error || null,
    providerType: error?.providerPayload?.type || null,
  };
}

export function buildDirectPaymentDebugPayload({
  error,
  preparedOrder,
  paymentDebugContext,
  dependencies,
}) {
  return {
    order: buildPaymentDebugOrder(preparedOrder),
    amount: {
      transactionAmount: paymentDebugContext.amount.transactionAmount,
      orderTotal: paymentDebugContext.amount.orderTotal,
      totalArs: paymentDebugContext.amount.totalArs,
    },
    token: paymentDebugContext.token || null,
    validation: buildPaymentDebugValidation({
      error,
      preparedOrder,
      paymentDebugContext,
      dependencies,
    }),
  };
}