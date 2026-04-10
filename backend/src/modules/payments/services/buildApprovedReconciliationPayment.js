export function buildApprovedReconciliationPayment({
  payment,
  paymentStatus,
  paymentStatusDetail,
  totalArs,
  orderId,
}) {
  const transactionAmount = Number(payment?.transaction_amount || totalArs);

  return {
    id: payment?.id,
    status: paymentStatus,
    status_detail: paymentStatusDetail,
    transaction_amount: transactionAmount,
    transaction_details: {
      total_paid_amount: transactionAmount,
    },
    metadata: {
      order_id: orderId,
    },
    external_reference: String(orderId),
  };
}