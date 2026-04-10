export function buildDirectPaymentResponse({
  updatedOrder,
  cardsById,
  payment,
  isFakePayment,
  paymentStatus,
  paymentStatusDetail,
  totalArs,
  installments,
  paymentMethodId,
  webhookPending,
  dependencies,
}) {
  const { toOrderResponse } = dependencies;

  return {
    order: toOrderResponse(updatedOrder, cardsById),
    payment: {
      id: payment?.id ? String(payment.id) : null,
      provider: String(payment?.provider || (isFakePayment ? "fake" : "mercadopago")),
      status: paymentStatus || null,
      status_detail: paymentStatusDetail,
      amount: Number(payment?.transaction_amount || totalArs),
      installments: Number(payment?.installments || installments),
      payment_method_id: String(payment?.payment_method_id || paymentMethodId),
    },
    webhook_pending: webhookPending,
  };
}