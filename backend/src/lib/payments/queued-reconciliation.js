import { logEvent, logger } from "../logger.js";
import { processQueuedMercadoPagoReconciliation as processQueuedMercadoPagoReconciliationShared } from "../services/payment-reconciliation.js";

export async function processQueuedMercadoPagoPayment(data = {}) {
  const orderId = Number(data?.payment?.metadata?.order_id || data?.payment?.external_reference || 0) || null;
  const paymentId = String(data?.paymentId || data?.paymentIdOverride || data?.payment?.id || "").trim() || null;
  const source = data?.source || "bullmq";
  const requestId = data?.requestId || null;

  logger.info("HANDLE_PAYMENT_START", {
    orderId,
    paymentId,
    source,
    requestId,
  });

  logEvent("JOB_PAYMENT_RECONCILIATION_START", "Processing queued Mercado Pago reconciliation", {
    orderId,
    paymentId,
    source,
    requestId,
  });

  logger.info("PAYMENT_ID_IN_HANDLER", {
    orderId,
    paymentId,
    source,
    requestId,
  });

  if (!orderId) {
    logger.error("MISSING_ORDER_ID", {
      paymentId,
      source,
      requestId,
      data,
    });

    return {
      received: true,
      ignored: true,
      reason: "missing_order_id",
      order: null,
      outcome: null,
    };
  }

  try {
    const result = await processQueuedMercadoPagoReconciliationShared(data);

    logEvent("JOB_PAYMENT_RECONCILIATION_DONE", "Queued Mercado Pago reconciliation completed", {
      orderId: result?.order?.id || orderId,
      paymentId,
      source,
      requestId,
      ignored: Boolean(result?.ignored),
    });

    return result;
  } catch (error) {
    logger.error("PAYMENT_HANDLER_ERROR", {
      orderId,
      paymentId,
      source,
      requestId,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    throw error;
  }
}