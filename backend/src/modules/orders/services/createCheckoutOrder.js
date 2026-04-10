export async function createCheckoutOrder({
  userId,
  payload,
  user,
  normalizedItems,
  requestId = null,
  dependencies,
}) {
  const {
    OrderStatus,
    attachMetadata,
    buildCheckoutAddress,
    buildCheckoutExpirationDate,
    createAppError,
    formatCurrency,
    normalizeEmail,
    prisma,
    resolveCheckoutShippingQuote,
    toOrderResponse,
    withDatabaseConnection,
  } = dependencies;

  const customerName = typeof payload?.customer_name === "string" && payload.customer_name.trim()
    ? payload.customer_name.trim()
    : user.fullName;
  const customerEmail = typeof payload?.customer_email === "string" && payload.customer_email.trim()
    ? normalizeEmail(payload.customer_email)
    : user.email;
  const fallbackPhone = typeof payload?.phone === "string" && payload.phone.trim()
    ? payload.phone.trim()
    : user.phone;

  const result = await withDatabaseConnection(() => prisma.$transaction(async (tx) => {
    const cards = await tx.card.findMany({
      where: { id: { in: normalizedItems.map((item) => item.cardId) } },
    });

    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const cardsById = new Map(attachMetadata(cards).map((card) => [card.id, card]));
    let subtotal = 0;

    const unavailableItems = normalizedItems.filter((item) => {
      const card = cardMap.get(item.cardId);
      return !card || !card.isVisible;
    });

    if (unavailableItems.length > 0) {
      throw createAppError("Hay cartas del carrito que ya no están disponibles", {
        code: "CARD_UNAVAILABLE",
        unavailableCardIds: unavailableItems.map((item) => item.cardId),
      });
    }

    const insufficientStockItems = normalizedItems.filter((item) => {
      const card = cardMap.get(item.cardId);
      return !card || Number(card.stock) < item.quantity;
    });

    if (insufficientStockItems.length > 0) {
      throw createAppError("Hay cartas del carrito sin stock suficiente", {
        statusCode: 409,
        code: "INSUFFICIENT_STOCK",
        unavailableCardIds: insufficientStockItems.map((item) => item.cardId),
      });
    }

    for (const item of normalizedItems) {
      const card = cardMap.get(item.cardId);
      subtotal += card.price * item.quantity;
    }

    const delivery = await buildCheckoutAddress(tx, userId, payload, fallbackPhone);
    const shippingQuote = await resolveCheckoutShippingQuote({
      userId,
      payload,
      delivery,
      items: normalizedItems,
      requestId,
    });
    const total = formatCurrency(subtotal + shippingQuote.cost);
    const expiresAt = buildCheckoutExpirationDate();

    const order = await tx.order.create({
      data: {
        userId,
        addressId: delivery.addressId,
        subtotal: formatCurrency(subtotal),
        shippingCost: shippingQuote.cost,
        total,
        currency: "ARS",
        exchange_rate: 1,
        total_ars: total,
        status: OrderStatus.PENDING_PAYMENT,
        expires_at: expiresAt,
        payment_status: null,
        payment_status_detail: null,
        shippingZone: delivery.shippingZone,
        shippingLabel: shippingQuote.label,
        carrier: shippingQuote.carrier,
        customerName,
        customerEmail,
        customerPhone: delivery.snapshot.customerPhone,
        shippingAddress: delivery.snapshot.shippingAddress,
        shippingCity: delivery.snapshot.shippingCity,
        shippingProvince: delivery.snapshot.shippingProvince,
        shippingPostalCode: delivery.snapshot.shippingPostalCode,
        notes: typeof payload?.notes === "string" && payload.notes.trim() ? payload.notes.trim() : null,
        items: {
          create: normalizedItems.map((item) => {
            const card = cardMap.get(item.cardId);
            return {
              cardId: item.cardId,
              quantity: item.quantity,
              price: card.price,
            };
          }),
        },
      },
      include: { items: true, user: true, address: true },
    });

    return { order, cardsById, shippingQuote };
  }), { maxWaitMs: 5000 });

  const responseOrder = toOrderResponse(result.order, result.cardsById);

  return {
    order: result.order,
    responsePayload: {
      order: responseOrder,
      init_point: null,
      exchange_rate: responseOrder.exchange_rate ?? null,
      total_ars: responseOrder.total_ars ?? null,
      expires_at: responseOrder.expires_at ?? null,
      payment_redirect_available: false,
    },
    shippingQuote: result.shippingQuote,
  };
}