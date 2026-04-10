export async function createCheckoutPreference({
  orderId,
  userId,
  requestId = null,
  dependencies,
}) {
  const {
    alignMercadoPagoItemsTotal,
    assertMercadoPagoCheckoutConfigured,
    buildCheckoutBackUrl,
    buildMercadoPagoNotificationUrl,
    buildMercadoPagoPreferenceItems,
    createAppError,
    getMercadoPagoAccountDetails,
    getOrderCardsMap,
    isMercadoPagoCheckoutAutoReturnAllowed,
    lockOrderForUpdate,
    logEvent,
    mercadoPagoPreferenceClient,
    prepareOrderForPreference,
    prisma,
    resolveMercadoPagoCheckoutUrl,
    resolveMercadoPagoPayer,
    shouldUseMercadoPagoSandbox,
    shouldUseMercadoPagoSandboxWebhook,
    unwrapMercadoPagoBody,
  } = dependencies;

  assertMercadoPagoCheckoutConfigured();

  const prepared = await prepareOrderForPreference({ orderId, userId });
  const preferenceCardsById = await getOrderCardsMap([prepared.order]);
  const mercadoPagoAccount = await getMercadoPagoAccountDetails();
  const useSandboxCheckout = shouldUseMercadoPagoSandbox(mercadoPagoAccount);
  const notificationUrl = buildMercadoPagoNotificationUrl({
    useSandboxWebhook: shouldUseMercadoPagoSandboxWebhook(mercadoPagoAccount),
  });
  const preferenceItems = alignMercadoPagoItemsTotal(
    buildMercadoPagoPreferenceItems(prepared.order, preferenceCardsById, prepared.exchangeRate),
    prepared.totalArs
  );
  const backUrls = {
    success: buildCheckoutBackUrl("success", prepared.order.id),
    failure: buildCheckoutBackUrl("failure", prepared.order.id),
    pending: buildCheckoutBackUrl("pending", prepared.order.id),
  };
  const enableAutoReturn = isMercadoPagoCheckoutAutoReturnAllowed(backUrls.success);
  const preferencePayload = {
    items: preferenceItems,
    external_reference: String(prepared.order.id),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    back_urls: backUrls,
    ...(enableAutoReturn ? { auto_return: "approved" } : {}),
    statement_descriptor: "DUELVAULT",
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: prepared.expiresAt.toISOString(),
    payer: await resolveMercadoPagoPayer(prepared.order, { accountDetails: mercadoPagoAccount }),
    metadata: {
      order_id: prepared.order.id,
      request_id: requestId,
      checkout_mode: useSandboxCheckout ? "sandbox" : "production",
    },
  };

  if (!enableAutoReturn) {
    logEvent("PAYMENT_FLOW", "Mercado Pago auto_return disabled for non-public checkout URL", {
      requestId,
      orderId: prepared.order.id,
      successBackUrl: backUrls.success,
    });
  }

  const preferenceResponse = await mercadoPagoPreferenceClient.create({ body: preferencePayload });
  const preference = unwrapMercadoPagoBody(preferenceResponse);
  const initPoint = resolveMercadoPagoCheckoutUrl(preference, { useSandbox: useSandboxCheckout });

  if (!initPoint) {
    throw createAppError("Mercado Pago preference did not return init_point", {
      statusCode: 502,
      code: "CHECKOUT_PREFERENCE_INVALID",
    });
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, prepared.order.id);
    return tx.order.update({
      where: { id: prepared.order.id },
      data: {
        preference_id: preference?.id ? String(preference.id) : null,
      },
      include: { items: true, user: true, address: true },
    });
  });

  const cardsById = await getOrderCardsMap([updatedOrder]);
  return {
    order: updatedOrder,
    cardsById,
    initPoint,
    checkoutMode: useSandboxCheckout ? "sandbox" : "production",
    exchangeRate: prepared.exchangeRate,
    totalArs: prepared.totalArs,
    expiresAt: prepared.expiresAt,
  };
}