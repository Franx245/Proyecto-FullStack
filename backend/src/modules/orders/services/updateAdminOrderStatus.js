export async function updateAdminOrderStatus({
  orderId,
  nextStatus,
  expectedUpdatedAt,
  actor,
  audit,
  dependencies,
}) {
  const {
    assertRequestActive,
    buildOrderStatusPostCommitEffect,
    createAppError,
    getAllowedOrderTransitions,
    getOrderCardsMap,
    lockOrderForUpdate,
    prisma,
    safeJsonStringify,
    sanitizeOrderForAudit,
    toOrderResponse,
    updateOrderStatusWithEffects,
  } = dependencies;

  const orderUpdateResult = await prisma.$transaction(async (tx) => {
    assertRequestActive();

    await lockOrderForUpdate(tx, orderId);

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true, address: true },
    });

    if (!order) {
      throw createAppError("Order not found", {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    if (order.status === nextStatus) {
      return {
        order,
        postCommitEffect: null,
        ignored: true,
      };
    }

    expectedUpdatedAt(order);

    const allowedNextStatuses = getAllowedOrderTransitions(order.status, actor.role);
    if (!allowedNextStatuses.includes(nextStatus)) {
      throw createAppError("Invalid order transition for current role", {
        statusCode: 409,
        code: "INVALID_ORDER_TRANSITION",
        details: {
          current_status: order.status,
          next_status: nextStatus,
          allowed_next_statuses: allowedNextStatuses,
        },
      });
    }

    for (const _item of order.items) {
      assertRequestActive();
    }

    const nextOrder = await updateOrderStatusWithEffects(tx, order, nextStatus);

    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id ?? null,
        entityType: "order",
        entityId: String(orderId ?? "unknown"),
        action: "ADMIN_ORDER_STATUS_UPDATED",
        requestId: audit.requestId ?? null,
        routeKey: audit.routeKey || null,
        before: safeJsonStringify(sanitizeOrderForAudit(order)),
        after: safeJsonStringify(sanitizeOrderForAudit(nextOrder)),
        metadata: safeJsonStringify({
          mutationId: audit.mutationId,
          requestId: audit.requestId,
          previousStatus: order.status,
          nextStatus,
        }),
      },
    });

    return {
      order: nextOrder,
      postCommitEffect: buildOrderStatusPostCommitEffect(order, nextStatus),
      ignored: false,
    };
  });

  const updatedOrder = orderUpdateResult.order;
  const cardsById = await getOrderCardsMap([updatedOrder], { adminThumbnail: true });

  return {
    ignored: orderUpdateResult.ignored,
    order: updatedOrder,
    postCommitEffect: orderUpdateResult.postCommitEffect,
    responsePayload: {
      order: toOrderResponse(updatedOrder, cardsById, { includeAdminFields: true }),
      ...(orderUpdateResult.ignored ? { ignored: true } : {}),
    },
  };
}