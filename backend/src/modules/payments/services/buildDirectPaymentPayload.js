export async function buildDirectPaymentPayload({
  prepared,
  token,
  paymentMethodId,
  issuerId,
  installments,
  identificationType,
  identificationNumber,
  testCard,
  requestId = null,
  paymentMode,
  isFakePayment,
  mercadoPagoAccount,
  notificationUrl,
  dependencies,
}) {
  const { resolveMercadoPagoPayer } = dependencies;

  return {
    transaction_amount: prepared.totalArs,
    token,
    payment_method_id: paymentMethodId,
    installments,
    description: `RareHunter order #${prepared.order.id}`,
    external_reference: String(prepared.order.id),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    payer: isFakePayment
      ? {
          ...(identificationType && identificationNumber
            ? {
                identification: {
                  type: identificationType,
                  number: identificationNumber,
                },
              }
            : {}),
        }
      : await resolveMercadoPagoPayer(prepared.order, {
          accountDetails: mercadoPagoAccount,
          identificationType,
          identificationNumber,
        }),
    ...(issuerId ? { issuer_id: issuerId } : {}),
    ...(isFakePayment ? { test_card: testCard } : {}),
    metadata: {
      order_id: prepared.order.id,
      request_id: requestId,
      user_id: prepared.order.userId ?? null,
      payment_mode: paymentMode,
    },
  };
}