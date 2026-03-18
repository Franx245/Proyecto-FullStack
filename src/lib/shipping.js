export const SHIPPING_OPTIONS = {
  caba: { cost: 5.99, label: "Envío CABA", eta: "24 hs" },
  gba: { cost: 8.99, label: "Envío GBA", eta: "24-48 hs" },
  interior: { cost: 12.99, label: "Envío Interior", eta: "2-4 días" },
  pickup: { cost: 0, label: "Retiro por showroom", eta: "Coordinar" },
};

export function getShippingOption(zone) {
  return SHIPPING_OPTIONS[zone] || SHIPPING_OPTIONS.pickup;
}

export function orderStatusLabel(status) {
  const labels = {
    pending_payment: "Pendiente de pago",
    paid: "Pagado",
    shipped: "Enviado",
    completed: "Completado",
    cancelled: "Cancelado",
  };

  return labels[status] || status;
}

export function getOrderProgress(status) {
  const steps = ["pending_payment", "paid", "shipped", "completed"];
  const currentIndex = steps.indexOf(status);

  return steps.map((step, index) => ({
    key: step,
    label: orderStatusLabel(step),
    state: status === "cancelled"
      ? "cancelled"
      : index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
}