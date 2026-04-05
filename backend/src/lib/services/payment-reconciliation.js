import prismaPkg from "@prisma/client";
import { shippingMode } from "../../../config/env.js";

import { invalidatePublicCatalogCache } from "../cache.js";
import { invalidateOrderRelatedCache } from "../cache-invalidation.js";
import { createShipment as createEnviaShipment, normalizeEnviaCarrier } from "../envia.js";
import { publishEvent } from "../events.js";
import { logEvent, logger } from "../logger.js";
import { prisma } from "../prisma.js";

const { OrderStatus, ShippingZone } = prismaPkg;
const MERCADOPAGO_ACCESS_TOKEN = String(process.env.MP_ACCESS_TOKEN || "").trim();
const MERCADOPAGO_TEST_ACCESS_TOKEN_PREFIX = "TEST-";
const BACKEND_PUBLIC_URL = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
const ORDER_PAYMENT_RECONCILIATION_FAILURE_DETAILS = new Set([
  "amount_mismatch",
  "stock_conflict_after_approval",
]);
const SHIPMENT_STATUS_PROGRESS_RANK = {
  created: 0,
  picked_up: 1,
  in_transit: 2,
  out_for_delivery: 3,
  delivered: 4,
};

function createAppError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

function safeJsonStringify(value) {
  try {
    return value ? JSON.stringify(value) : null;
  } catch {
    return null;
  }
}

function logDbUpdate(entityType, entityId, fieldsUpdated, data = {}) {
  logEvent("DB_UPDATE", `${entityType} updated`, {
    entityType,
    entityId,
    fieldsUpdated,
    ...data,
  });
}

function formatCurrency(value) {
  return Number((value || 0).toFixed(2));
}

function normalizeMercadoPagoPaymentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMercadoPagoPaymentStatusDetail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function resolveMercadoPagoPaymentAmount(payment) {
  const candidates = [
    payment?.transaction_amount,
    payment?.transaction_details?.total_paid_amount,
    payment?.transaction_details?.net_received_amount,
  ];

  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) {
      return formatCurrency(amount);
    }
  }

  return null;
}

function isBillableStatus(status) {
  return [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED].includes(status);
}

function hasMercadoPagoPaymentAttempt(order) {
  return Boolean(String(order?.payment_id || "").trim());
}

function hasApprovedMercadoPagoPayment(order) {
  return hasMercadoPagoPaymentAttempt(order)
    && normalizeMercadoPagoPaymentStatus(order?.payment_status) === "approved";
}

function isApprovedPaymentReconciliationFailure(order) {
  return order?.status === OrderStatus.FAILED
    && hasApprovedMercadoPagoPayment(order)
    && ORDER_PAYMENT_RECONCILIATION_FAILURE_DETAILS.has(
      normalizeMercadoPagoPaymentStatusDetail(order?.payment_status_detail) || "",
    );
}

function resolveMercadoPagoOrderId(payment) {
  const candidates = [payment?.metadata?.order_id, payment?.external_reference];

  for (const candidate of candidates) {
    const normalized = Number(candidate);
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  return null;
}

function resolveWebhookOrderStatus(currentStatus, paymentStatus) {
  if (!paymentStatus) {
    return null;
  }

  if ([OrderStatus.EXPIRED, OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(currentStatus)) {
    return null;
  }

  if (paymentStatus === "approved") {
    return OrderStatus.PAID;
  }

  if (["pending", "in_process", "in_mediation", "authorized"].includes(paymentStatus)) {
    return OrderStatus.PENDING_PAYMENT;
  }

  if (paymentStatus === "expired") {
    return OrderStatus.EXPIRED;
  }

  if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentStatus)) {
    return OrderStatus.FAILED;
  }

  return null;
}

function normalizeCheckoutCarrier(value) {
  return normalizeEnviaCarrier(value);
}

function resolveOrderShipmentService(order, explicitService = null) {
  const requestedService = String(explicitService || "").trim();
  if (requestedService) {
    return requestedService;
  }

  const shippingLabel = String(order?.shippingLabel || "").trim();
  if (shippingLabel.includes("·")) {
    const service = shippingLabel.split("·").slice(1).join("·").trim();
    if (service) {
      return service;
    }
  }

  return "Estándar";
}

function isMercadoPagoSandboxMode() {
  return MERCADOPAGO_ACCESS_TOKEN.startsWith(MERCADOPAGO_TEST_ACCESS_TOKEN_PREFIX);
}

function buildSandboxShippingLabelUrl(orderId) {
  const labelPath = `/api/shipping/label/${encodeURIComponent(String(orderId))}`;
  return BACKEND_PUBLIC_URL ? `${BACKEND_PUBLIC_URL}${labelPath}` : labelPath;
}

function normalizeShipmentStatusToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function mapShipmentLifecycleStatus(value) {
  const normalized = normalizeShipmentStatusToken(value);
  if (!normalized || normalized === "unknown") {
    return null;
  }

  if (["created", "pending", "label_created", "label_generated", "ready", "ready_to_ship", "pre_transit", "processing"].includes(normalized)) {
    return "created";
  }

  if (
    ["pickup", "picked_up", "pickedup", "collected", "collection", "collection_successful", "recibido", "recibida", "colectado", "colectada"].includes(normalized)
    || normalized.includes("picked_up")
    || normalized.includes("pickup")
    || normalized.includes("collect")
    || normalized.includes("recib")
  ) {
    return "picked_up";
  }

  if (
    ["in_transit", "transit", "en_transito", "transito", "on_the_way", "linehaul", "sorting_center"].includes(normalized)
    || normalized.includes("transit")
    || normalized.includes("transito")
  ) {
    return "in_transit";
  }

  if (
    ["out_for_delivery", "delivery_route", "with_courier", "on_vehicle", "distribution", "en_reparto", "salio_a_reparto"].includes(normalized)
    || normalized.includes("out_for_delivery")
    || normalized.includes("delivery_route")
    || normalized.includes("reparto")
  ) {
    return "out_for_delivery";
  }

  if (
    ["delivered", "entregado", "delivery_completed", "delivered_to_customer"].includes(normalized)
    || normalized.includes("deliver")
    || normalized.includes("entreg")
  ) {
    return "delivered";
  }

  if (["cancelled", "canceled"].includes(normalized)) {
    return "cancelled";
  }

  if (
    ["returned", "return", "returned_to_sender", "devolucion", "devolucion_al_remitente", "returned_sender"].includes(normalized)
    || normalized.includes("return")
    || normalized.includes("devol")
  ) {
    return "returned";
  }

  return SHIPMENT_STATUS_PROGRESS_RANK[normalized] !== undefined ? normalized : null;
}

function publishShipmentOrderUpdate(order) {
  if (!order?.id) {
    return;
  }

  publishEvent("order-update", {
    orderId: order.id,
    status: order.status,
    shipmentStatus: order.shipmentStatus || null,
  });
}

function buildEnviaShipmentPayloadLog(order, { carrier, service }) {
  return {
    orderId: order?.id || null,
    carrier,
    service,
    shippingZone: order?.shippingZone || null,
    customerName: order?.customerName || null,
    customerEmail: order?.customerEmail || null,
    customerPhone: order?.customerPhone || null,
    address: {
      street: order?.shippingAddress || null,
      city: order?.shippingCity || null,
      province: order?.shippingProvince || null,
      postalCode: order?.shippingPostalCode || null,
    },
    items: Array.isArray(order?.items)
      ? order.items.map((item) => ({
          cardId: item.cardId,
          quantity: item.quantity,
        }))
      : [],
  };
}

async function createShipment({ order, carrier = null, service = null, isSandbox = false }) {
  const resolvedCarrier = normalizeCheckoutCarrier(carrier || order?.carrier) || normalizeEnviaCarrier(carrier || order?.carrier) || "andreani";
  const useFallbackShipment = isSandbox || shippingMode === "fallback";

  if (useFallbackShipment) {
    logEvent("ENVIACOM_REQUEST", "Creating sandbox shipment", {
      orderId: order?.id || null,
      carrier: resolvedCarrier,
      service: service || null,
      shippingMode,
    });

    const fakeShipment = {
      shipmentId: `sandbox_${order.id}`,
      trackingNumber: `TRACK-${Date.now()}`,
      carrier: resolvedCarrier,
      labelUrl: buildSandboxShippingLabelUrl(order.id),
      label: buildSandboxShippingLabelUrl(order.id),
      status: "created",
    };

    logEvent("ENVIACOM_RESPONSE_OK", "Sandbox shipment created", {
      orderId: order?.id || null,
      response: fakeShipment,
    });
    return fakeShipment;
  }

  const shipment = await createEnviaShipment({
    order,
    carrier: resolvedCarrier,
    service,
  });

  const normalizedShipment = {
    shipmentId: shipment?.shipmentId || null,
    trackingNumber: shipment?.trackingNumber || null,
    carrier: normalizeEnviaCarrier(shipment?.carrier || resolvedCarrier) || resolvedCarrier,
    labelUrl: shipment?.labelUrl || shipment?.label || null,
    label: shipment?.labelUrl || shipment?.label || null,
    status: shipment?.status || "created",
  };

  logEvent("ENVIACOM_RESPONSE_OK", "Shipment created", {
    orderId: order?.id || null,
    response: normalizedShipment,
  });
  return normalizedShipment;
}

async function createOrderShipmentWithEffects(order, { carrier = null, service = null, requestId = null, source = "payment" } = {}) {
  if (!order) {
    return { order: null, shipment: null, skipped: true, reason: "missing_order" };
  }

  if (order.shippingZone === ShippingZone.PICKUP) {
    return { order, shipment: null, skipped: true, reason: "pickup_order" };
  }

  if (order.shipmentId) {
    return { order, shipment: null, skipped: true, reason: "shipment_exists" };
  }

  const normalizedCarrier = normalizeCheckoutCarrier(carrier || order.carrier);
  if (!normalizedCarrier || normalizedCarrier === "showroom") {
    throw createAppError("Shipping carrier unavailable for shipment creation", {
      statusCode: 409,
      code: "SHIPMENT_CARRIER_UNAVAILABLE",
      details: {
        orderId: order.id,
        carrier: carrier || order.carrier || null,
      },
    });
  }

  const resolvedService = resolveOrderShipmentService(order, service);
  const isSandbox = isMercadoPagoSandboxMode();
  const shipmentOutcome = await prisma.$transaction(async (tx) => {
    await lockOrderForUpdate(tx, order.id);
    const freshOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, user: true, address: true },
    });

    if (!freshOrder) {
      return { order: null, shipment: null, skipped: true, reason: "missing_order" };
    }

    if (freshOrder.shipmentId) {
      logger.info("SHIPMENT_ALREADY_CREATED", {
        requestId,
        source,
        orderId: order.id,
        shipmentId: freshOrder.shipmentId,
      });
      return { order: freshOrder, shipment: null, skipped: true, reason: "shipment_exists" };
    }

    const enviaPayload = buildEnviaShipmentPayloadLog(freshOrder, {
      carrier: normalizedCarrier,
      service: resolvedService,
    });

    logEvent("SHIPMENT_FLOW_START", "Starting shipment flow", {
      requestId,
      source,
      orderId: freshOrder.id,
      carrier: normalizedCarrier,
      service: resolvedService,
      isSandbox,
    });

    logEvent("ENVIACOM_REQUEST", "Creating shipment", {
      requestId,
      orderId: freshOrder.id,
      payload: enviaPayload,
      isSandbox,
    });

    let shipment;
    try {
      shipment = await createShipment({
        order: freshOrder,
        carrier: normalizedCarrier,
        service: resolvedService,
        isSandbox,
      });
    } catch (error) {
      logEvent("ENVIACOM_ERROR", "Shipment failed", {
        requestId,
        orderId: freshOrder.id,
        payload: enviaPayload,
        status: error?.statusCode || null,
        body: error?.enviaBody || null,
        message: error?.message || "Shipment failed",
        stack: error?.stack || null,
      });
      throw error;
    }

    const persistedTrackingNumber = shipment?.trackingNumber || null;
    const persistedCarrier = shipment?.carrier || normalizedCarrier;
    const persistedLabelUrl = shipment?.labelUrl || shipment?.label || null;
    const persistedStatus = mapShipmentLifecycleStatus(shipment?.status) || "created";

    const updatedOrder = await tx.order.update({
      where: { id: freshOrder.id },
      data: {
        shipmentId: shipment.shipmentId || null,
        trackingCode: persistedTrackingNumber,
        shippingLabelUrl: persistedLabelUrl,
        carrier: persistedCarrier,
        shipmentStatus: persistedStatus,
        estimatedDelivery: null,
        trackingVisibleToUser: true,
      },
      include: { items: true, user: true, address: true },
    });

    return {
      order: updatedOrder,
      shipment,
      skipped: false,
      reason: null,
      persistedTrackingNumber,
      persistedCarrier,
      persistedLabelUrl,
    };
  });

  if (shipmentOutcome?.skipped || !shipmentOutcome?.order) {
    return shipmentOutcome;
  }

  const updatedOrder = shipmentOutcome.order;
  const { shipment, persistedTrackingNumber, persistedCarrier, persistedLabelUrl } = shipmentOutcome;

  logDbUpdate("order", updatedOrder.id, [
    "shipmentId",
    "trackingCode",
    "shippingLabelUrl",
    "carrier",
    "shipmentStatus",
    "estimatedDelivery",
    "trackingVisibleToUser",
  ], {
    requestId,
    source,
  });

  logEvent("SHIPMENT_PERSISTED", "Shipment persisted", {
    orderId: updatedOrder.id,
    tracking: persistedTrackingNumber,
    carrier: persistedCarrier,
    label: persistedLabelUrl,
  });

  publishShipmentOrderUpdate(updatedOrder);

  logEvent("SHIPMENT_FLOW_DONE", "Shipment flow completed", {
    requestId,
    source,
    orderId: updatedOrder.id,
    shipmentId: updatedOrder.shipmentId || null,
    trackingCode: updatedOrder.trackingCode || null,
    carrier: updatedOrder.carrier || null,
  });

  return {
    order: updatedOrder,
    shipment,
    skipped: false,
    reason: null,
  };
}

async function lockOrderForUpdate(tx, orderId) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

function sanitizeOrderForAudit(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    userId: order.userId ?? null,
    addressId: order.addressId ?? null,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    total: order.total,
    status: order.status,
    shippingZone: order.shippingZone,
    shippingLabel: order.shippingLabel,
    trackingCode: order.trackingCode || null,
    trackingVisibleToUser: Boolean(order.trackingVisibleToUser),
    shipmentId: order.shipmentId || null,
    carrier: order.carrier || null,
    shipmentStatus: order.shipmentStatus || null,
    estimatedDelivery: order.estimatedDelivery || null,
    customerName: order.customerName || null,
    customerEmail: order.customerEmail || null,
    customerPhone: order.customerPhone || null,
    shippingAddress: order.shippingAddress || null,
    shippingCity: order.shippingCity || null,
    shippingProvince: order.shippingProvince || null,
    shippingPostalCode: order.shippingPostalCode || null,
    notes: order.notes || null,
    currency: order.currency || null,
    exchange_rate: order.exchange_rate ?? null,
    total_ars: order.total_ars ?? null,
    payment_id: order.payment_id || null,
    payment_status: order.payment_status || null,
    payment_status_detail: order.payment_status_detail || null,
    preference_id: order.preference_id || null,
    expires_at: order.expires_at || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          id: item.id,
          cardId: item.cardId,
          quantity: item.quantity,
          price: item.price,
        }))
      : [],
  };
}

async function applyOrderInventoryTransition(tx, order, { decrementStock = false, incrementStock = false } = {}) {
  if (!decrementStock && !incrementStock) {
    return;
  }

  let cardsById = null;
  if (decrementStock) {
    const cardIds = [...new Set(order.items.map((item) => item.cardId))];
    const cards = await tx.card.findMany({ where: { id: { in: cardIds } } });
    cardsById = new Map(cards.map((card) => [card.id, card]));
  }

  for (const item of order.items) {
    if (decrementStock) {
      const card = cardsById.get(item.cardId);
      if (!card || !card.isVisible) {
        throw createAppError("Hay cartas del pedido que ya no están disponibles", {
          statusCode: 409,
          code: "CARD_UNAVAILABLE",
          unavailableCardIds: [item.cardId],
        });
      }

      const updated = await tx.card.updateMany({
        where: { id: item.cardId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });

      if (updated.count === 0) {
        throw createAppError(`Insufficient stock for ${card.name}`, {
          statusCode: 409,
          code: "INSUFFICIENT_STOCK",
          unavailableCardIds: [item.cardId],
        });
      }
    }

    if (incrementStock) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }
}

function getOrderInventoryChangeReason(previousStatus, nextStatus) {
  const wasBillable = isBillableStatus(previousStatus);
  const willBeBillable = isBillableStatus(nextStatus);

  if (!wasBillable && willBeBillable) {
    return "order_paid";
  }

  if (wasBillable && !willBeBillable) {
    if (nextStatus === OrderStatus.CANCELLED) {
      return "order_cancelled";
    }

    if (nextStatus === OrderStatus.EXPIRED) {
      return "order_expired";
    }

    return "order_reverted";
  }

  return null;
}

async function updateOrderStatusWithEffects(tx, order, nextStatus, extraData = {}) {
  const wasBillable = isBillableStatus(order.status);
  const willBeBillable = isBillableStatus(nextStatus);
  const decrementStock = !wasBillable && willBeBillable;
  const incrementStock = wasBillable && !willBeBillable;

  await applyOrderInventoryTransition(tx, order, {
    decrementStock,
    incrementStock,
  });

  for (const item of order.items) {
    if (!wasBillable && willBeBillable) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { salesCount: { increment: item.quantity } },
      });
    }

    if (wasBillable && !willBeBillable) {
      await tx.card.update({
        where: { id: item.cardId },
        data: { salesCount: { decrement: item.quantity } },
      });
    }
  }

  return tx.order.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      ...extraData,
    },
    include: { items: true, user: true, address: true },
  });
}

function buildOrderStatusPostCommitEffect(order, nextStatus) {
  const inventoryReason = getOrderInventoryChangeReason(order.status, nextStatus);

  return {
    orderId: order.id,
    previousStatus: order.status,
    nextStatus,
    inventoryChanged: Boolean(inventoryReason),
    inventoryReason,
    items: order.items.map((item) => ({
      cardId: item.cardId,
      quantity: item.quantity,
    })),
  };
}

async function applyOrderStatusPostCommitEffect(effect) {
  if (!effect) {
    return;
  }

  if (effect.items.length) {
    await invalidateOrderRelatedCache(effect.items);
  }

  publishEvent("order-update", {
    orderId: effect.orderId,
    previousStatus: effect.previousStatus,
    newStatus: effect.nextStatus,
    order: effect.orderSnapshot || null,
  });

  if (effect.inventoryChanged) {
    for (const item of effect.items) {
      publishEvent("stock-update", {
        cardId: item.cardId,
        reason: effect.inventoryReason,
        orderId: effect.orderId,
      });
    }
  }
}

function invalidatePublicCatalogCaches() {
  void invalidatePublicCatalogCache();
}

async function recordActivity(userId, action, requestContext, details) {
  await prisma.userActivity.create({
    data: {
      userId: userId ?? null,
      action,
      ipAddress: requestContext?.ipAddress || null,
      userAgent: requestContext?.userAgent || null,
      details: safeJsonStringify(details),
    },
  });
}

function buildQueuedRequestContext(data = {}) {
  const source = data?.source || "bullmq";
  return {
    requestId: data?.requestId || `job_${Date.now()}`,
    ipAddress: null,
    userAgent: data?.headers?.["user-agent"] || `bullmq/${source}`,
  };
}

export async function reconcileMercadoPagoPayment({ requestContext = null, payment, paymentIdOverride = null, providerRequestId = null } = {}) {
  const paymentId = String(paymentIdOverride || payment?.id || "").trim();
  const paymentStatus = normalizeMercadoPagoPaymentStatus(payment?.status);
  const orderId = resolveMercadoPagoOrderId(payment);
  const paymentAmount = resolveMercadoPagoPaymentAmount(payment);
  const requestId = requestContext?.requestId || null;

  logger.info("RECONCILE_START", {
    requestId,
    orderId,
    paymentId: paymentId || null,
    paymentStatus,
    providerRequestId: providerRequestId || null,
  });

  if (!paymentId) {
    logger.error("MISSING_PAYMENT_ID", {
      requestId,
      orderId,
      paymentStatus,
      providerRequestId: providerRequestId || null,
    });

    return {
      received: true,
      ignored: true,
      reason: "missing_payment_id",
      order: null,
      outcome: null,
    };
  }

  if (!Number.isFinite(orderId)) {
    logger.error("MISSING_ORDER_ID", {
      requestId,
      paymentId,
      paymentStatus,
      providerRequestId: providerRequestId || null,
      payment,
    });

    logEvent("MERCADOPAGO_WEBHOOK_IGNORED", "Payment without valid external_reference", {
      paymentId,
      paymentStatus,
      providerRequestId: providerRequestId || null,
    });

    return {
      received: true,
      ignored: true,
      reason: "missing_external_reference",
      order: null,
      outcome: null,
    };
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockOrderForUpdate(tx, orderId);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, user: true, address: true },
      });

      if (!order) {
        logger.error("ORDER_NOT_FOUND", {
          requestId,
          orderId,
          paymentId,
          providerRequestId: providerRequestId || null,
        });
        return null;
      }

      logger.info("ORDER_BEFORE", {
        requestId,
        orderId,
        paymentId,
        order: sanitizeOrderForAudit(order),
      });

      if (!Array.isArray(order.items) || order.items.length === 0) {
        logger.warn("ORDER_WITHOUT_ITEMS", {
          requestId,
          orderId,
          paymentId,
        });
      }

      if (order.status === OrderStatus.PENDING_PAYMENT && order.expires_at && order.expires_at <= new Date()) {
        logger.info("ABOUT_TO_UPDATE_ORDER", {
          requestId,
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.EXPIRED,
          paymentStatus,
        });

        const expiredOrder = await updateOrderStatusWithEffects(tx, order, OrderStatus.EXPIRED, {
          payment_status: order.payment_status || "expired",
          payment_status_detail: order.payment_status_detail || "expired_order",
        });

        logger.info("ORDER_UPDATED", {
          requestId,
          orderId,
          status: expiredOrder.status,
          payment_status: expiredOrder.payment_status || null,
          payment_status_detail: expiredOrder.payment_status_detail || null,
        });

        return {
          order: expiredOrder,
          duplicate: false,
          appliedStatus: OrderStatus.EXPIRED,
          paymentStatus,
          postCommitEffect: buildOrderStatusPostCommitEffect(order, OrderStatus.EXPIRED),
        };
      }

      const nextStatus = resolveWebhookOrderStatus(order.status, paymentStatus);
      const paymentData = {
        payment_id: String(payment?.id || paymentId),
        payment_status: paymentStatus || order.payment_status || null,
        payment_status_detail: normalizeMercadoPagoPaymentStatusDetail(payment?.status_detail) || order.payment_status_detail || null,
        payment_approved_at: paymentStatus === "approved"
          ? order.payment_approved_at || new Date()
          : order.payment_approved_at,
      };
      const staleWebhook = order.payment_id && order.payment_id !== paymentData.payment_id;
      const expectedAmount = formatCurrency(order.total_ars ?? order.total);

      if (staleWebhook) {
        return {
          order,
          duplicate: false,
          ignored: true,
          appliedStatus: order.status,
          paymentStatus,
          ignoreReason: "stale_payment_id",
        };
      }

      if (paymentStatus === "approved" && isApprovedPaymentReconciliationFailure(order)) {
        return {
          order,
          duplicate: false,
          ignored: true,
          appliedStatus: order.status,
          paymentStatus,
          ignoreReason: "approved_payment_already_reconciled",
        };
      }

      if (paymentStatus === "approved" && paymentAmount !== expectedAmount) {
        const mismatchData = {
          ...paymentData,
          payment_status_detail: "amount_mismatch",
        };
        const mismatchOrder = order.status === OrderStatus.FAILED
          ? await tx.order.update({
              where: { id: order.id },
              data: mismatchData,
              include: { items: true, user: true, address: true },
            })
          : await updateOrderStatusWithEffects(tx, order, OrderStatus.FAILED, mismatchData);

        logger.info("ORDER_UPDATED", {
          requestId,
          orderId,
          status: mismatchOrder.status,
          payment_status: mismatchOrder.payment_status || null,
          payment_status_detail: mismatchOrder.payment_status_detail || null,
        });

        return {
          order: mismatchOrder,
          duplicate: false,
          appliedStatus: order.status === OrderStatus.FAILED ? order.status : OrderStatus.FAILED,
          paymentStatus,
          paymentAmount,
          expectedAmount,
          amountMismatch: true,
          postCommitEffect: order.status === OrderStatus.FAILED
            ? null
            : buildOrderStatusPostCommitEffect(order, OrderStatus.FAILED),
        };
      }

      const isDuplicate = order.payment_id === paymentData.payment_id
        && order.payment_status === paymentData.payment_status
        && order.payment_status_detail === paymentData.payment_status_detail
        && (!nextStatus || order.status === nextStatus);

      if (isDuplicate) {
        return {
          order,
          duplicate: true,
          appliedStatus: order.status,
          paymentStatus,
          postCommitEffect: null,
        };
      }

      if (nextStatus && order.status !== nextStatus) {
        try {
          logger.info("ABOUT_TO_UPDATE_ORDER", {
            requestId,
            orderId,
            fromStatus: order.status,
            toStatus: nextStatus,
            paymentStatus,
          });

          const updatedOrder = await updateOrderStatusWithEffects(tx, order, nextStatus, paymentData);

          logger.info("ORDER_UPDATED", {
            requestId,
            orderId,
            status: updatedOrder.status,
            payment_status: updatedOrder.payment_status || null,
            payment_status_detail: updatedOrder.payment_status_detail || null,
          });

          return {
            order: updatedOrder,
            duplicate: false,
            appliedStatus: nextStatus,
            paymentStatus,
            paymentAmount,
            expectedAmount,
            postCommitEffect: buildOrderStatusPostCommitEffect(order, nextStatus),
          };
        } catch (transitionError) {
          if (paymentStatus === "approved" && transitionError?.code === "INSUFFICIENT_STOCK") {
            const stockConflictData = {
              ...paymentData,
              payment_status_detail: "stock_conflict_after_approval",
            };
            const conflictOrder = order.status === OrderStatus.FAILED
              ? await tx.order.update({
                  where: { id: order.id },
                  data: stockConflictData,
                  include: { items: true, user: true, address: true },
                })
              : await updateOrderStatusWithEffects(tx, order, OrderStatus.FAILED, stockConflictData);

            logger.info("ORDER_UPDATED", {
              requestId,
              orderId,
              status: conflictOrder.status,
              payment_status: conflictOrder.payment_status || null,
              payment_status_detail: conflictOrder.payment_status_detail || null,
            });

            return {
              order: conflictOrder,
              duplicate: false,
              appliedStatus: order.status === OrderStatus.FAILED ? order.status : OrderStatus.FAILED,
              paymentStatus,
              paymentAmount,
              expectedAmount,
              stockConflict: true,
              unavailableCardIds: transitionError.unavailableCardIds || [],
              postCommitEffect: order.status === OrderStatus.FAILED
                ? null
                : buildOrderStatusPostCommitEffect(order, OrderStatus.FAILED),
            };
          }

          throw transitionError;
        }
      }

      logger.info("ABOUT_TO_UPDATE_ORDER", {
        requestId,
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        paymentStatus,
      });

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: paymentData,
        include: { items: true, user: true, address: true },
      });

      logger.info("ORDER_UPDATED", {
        requestId,
        orderId,
        status: updatedOrder.status,
        payment_status: updatedOrder.payment_status || null,
        payment_status_detail: updatedOrder.payment_status_detail || null,
      });

      return {
        order: updatedOrder,
        duplicate: false,
        appliedStatus: order.status,
        paymentStatus,
        paymentAmount,
        expectedAmount,
        postCommitEffect: null,
      };
    });

    if (!outcome?.order) {
      logEvent("MERCADOPAGO_WEBHOOK_IGNORED", "Webhook for unknown order", {
        paymentId,
        orderId,
        paymentStatus,
        providerRequestId: providerRequestId || null,
      });

      return {
        received: true,
        ignored: true,
        reason: "order_not_found",
        order: null,
        outcome: null,
      };
    }

    await applyOrderStatusPostCommitEffect(outcome.postCommitEffect);

    let shipmentResult = null;
    if (outcome.paymentStatus === "approved" && !outcome.ignored && outcome.order.status === OrderStatus.PAID) {
      shipmentResult = await createOrderShipmentWithEffects(outcome.order, {
        requestId,
        source: "mercadopago_webhook",
      });

      if (shipmentResult?.order) {
        outcome.order = shipmentResult.order;
      }
    }

    const activityAction = outcome.duplicate
      ? "CHECKOUT_WEBHOOK_DUPLICATE"
      : outcome.ignored
        ? "CHECKOUT_WEBHOOK_IGNORED"
        : outcome.amountMismatch
          ? "CHECKOUT_PAYMENT_AMOUNT_MISMATCH"
          : outcome.stockConflict
            ? "CHECKOUT_PAYMENT_STOCK_CONFLICT"
            : outcome.paymentStatus === "approved" && outcome.appliedStatus === OrderStatus.PAID
              ? "CHECKOUT_PAYMENT_APPROVED"
              : outcome.appliedStatus === OrderStatus.EXPIRED
                ? "CHECKOUT_PAYMENT_EXPIRED"
                : outcome.paymentStatus === "pending" || outcome.paymentStatus === "in_process"
                  ? "CHECKOUT_PAYMENT_PENDING"
                  : "CHECKOUT_PAYMENT_FAILED";

    try {
      await recordActivity(outcome.order.userId ?? null, activityAction, requestContext, {
        orderId: outcome.order.id,
        paymentId: outcome.order.payment_id,
        paymentStatus: outcome.paymentStatus,
        paymentStatusDetail: outcome.order.payment_status_detail || null,
        appliedStatus: outcome.appliedStatus,
        duplicate: outcome.duplicate,
        ignored: Boolean(outcome.ignored),
        ignoreReason: outcome.ignoreReason || null,
        paymentAmount: outcome.paymentAmount || null,
        expectedAmount: outcome.expectedAmount || null,
        amountMismatch: Boolean(outcome.amountMismatch),
        stockConflict: Boolean(outcome.stockConflict),
        unavailableCardIds: outcome.unavailableCardIds || [],
        providerRequestId: providerRequestId || null,
        shipmentCreated: Boolean(shipmentResult && !shipmentResult.skipped),
        shipmentSkippedReason: shipmentResult?.reason || null,
      });
    } catch (activityError) {
      logEvent("SERVER_ERROR", "Failed to record Mercado Pago webhook activity", {
        requestId,
        orderId: outcome.order.id,
        error: activityError,
      });
    }

    logEvent("MERCADOPAGO_WEBHOOK_PROCESSED", "Mercado Pago webhook processed", {
      requestId,
      providerRequestId: providerRequestId || null,
      orderId: outcome.order.id,
      paymentStatus: outcome.paymentStatus,
      appliedStatus: outcome.appliedStatus,
      duplicate: outcome.duplicate,
      ignored: Boolean(outcome.ignored),
      ignoreReason: outcome.ignoreReason || null,
      expectedAmount: outcome.expectedAmount || null,
      amountMismatch: Boolean(outcome.amountMismatch),
      stockConflict: Boolean(outcome.stockConflict),
      shipmentCreated: Boolean(shipmentResult && !shipmentResult.skipped),
      shipmentSkippedReason: shipmentResult?.reason || null,
    });

    invalidatePublicCatalogCaches();

    return {
      received: true,
      ignored: false,
      reason: null,
      order: outcome.order,
      outcome,
    };
  } catch (error) {
    logger.error("PAYMENT_HANDLER_ERROR", {
      requestId,
      orderId,
      paymentId: paymentId || null,
      paymentStatus,
      providerRequestId: providerRequestId || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw error;
  }
}

export async function processQueuedMercadoPagoReconciliation(data = {}) {
  return reconcileMercadoPagoPayment({
    requestContext: buildQueuedRequestContext(data),
    payment: data?.payment,
    paymentIdOverride: data?.paymentId || data?.paymentIdOverride || null,
    providerRequestId: data?.providerRequestId || null,
  });
}
