import { logEvent, logger } from "../logger.js";

export async function processQueuedMercadoPagoPayment(data = {}) {
  logger.info("HANDLE_PAYMENT_START", {
    orderId: Number(data?.payment?.metadata?.order_id || data?.payment?.external_reference || 0) || null,
    paymentId: String(data?.paymentIdOverride || data?.payment?.id || "").trim() || null,
    source: data?.source || "bullmq",
    requestId: data?.requestId || null,
  });

  logEvent("JOB_PAYMENT_RECONCILIATION_START", "Processing queued Mercado Pago reconciliation", {
    orderId: Number(data?.payment?.metadata?.order_id || data?.payment?.external_reference || 0) || null,
    paymentId: String(data?.paymentIdOverride || data?.payment?.id || "").trim() || null,
    source: data?.source || "bullmq",
    requestId: data?.requestId || null,
  });

  const { processQueuedMercadoPagoReconciliation } = await import("../../../server.js");
  const result = await processQueuedMercadoPagoReconciliation(data);

  logEvent("JOB_PAYMENT_RECONCILIATION_DONE", "Queued Mercado Pago reconciliation completed", {
    orderId: result?.order?.id || null,
    paymentId: String(data?.paymentIdOverride || data?.payment?.id || "").trim() || null,
    source: data?.source || "bullmq",
    requestId: data?.requestId || null,
    ignored: Boolean(result?.ignored),
  });

  return result;
}