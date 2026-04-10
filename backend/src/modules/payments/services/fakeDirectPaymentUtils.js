import { createHash } from "node:crypto";
import { normalizeFakePaymentStatus } from "./paymentStatusUtils.js";

function buildFakePaymentId({ orderId, idempotencyKey, status }) {
  const hash = createHash("sha1")
    .update(JSON.stringify({
      orderId,
      idempotencyKey: String(idempotencyKey || "").trim() || "anonymous",
      status,
      provider: "fake",
    }))
    .digest("hex")
    .slice(0, 16);

  return `fake_${orderId}_${hash}`;
}

export function buildFakeDirectPaymentResult({
  orderId,
  idempotencyKey,
  transactionAmount,
  paymentMethodId,
  issuerId,
  installments,
  requestedStatus,
  dependencies,
}) {
  const { formatCurrency } = dependencies;
  const status = normalizeFakePaymentStatus(requestedStatus);

  return {
    id: buildFakePaymentId({ orderId, idempotencyKey, status }),
    provider: "fake",
    status,
    status_detail: status === "approved"
      ? "accredited"
      : status === "rejected"
        ? "insufficient_funds"
        : null,
    transaction_amount: formatCurrency(Number(transactionAmount || 0)),
    installments: Number.isInteger(Number(installments)) && Number(installments) > 0
      ? Number(installments)
      : 1,
    payment_method_id: paymentMethodId || null,
    issuer_id: issuerId || null,
    external_reference: String(orderId),
    metadata: {
      order_id: orderId,
      provider: "fake",
    },
  };
}