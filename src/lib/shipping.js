export const SHIPPING_OPTIONS = {
  caba: { cost: 3500, label: "Envío CABA", eta: "24 hs" },
  gba: { cost: 4500, label: "Envío GBA", eta: "24-48 hs" },
  interior: { cost: 6500, label: "Envío Interior", eta: "2-4 días" },
  pickup: { cost: 0, label: "Retiro en showroom", eta: "Coordinar" },
};

const SHIPPING_CARRIER_ALIASES = {
  showroom: "showroom",
  pickup: "showroom",
  andreani: "andreani",
  correoargentino: "correo-argentino",
  "correo argentino": "correo-argentino",
  "correo-argentino": "correo-argentino",
  correo_argentino: "correo-argentino",
};

const SHIPPING_CARRIER_LABELS = {
  showroom: "Retiro en showroom",
  andreani: "Andreani",
  "correo-argentino": "Correo Argentino",
};

/** @param {string} zone */
export function getShippingOption(zone) {
  return SHIPPING_OPTIONS[/** @type {keyof typeof SHIPPING_OPTIONS} */ (zone)] || SHIPPING_OPTIONS.pickup;
}

/** @param {string | null | undefined} value */
export function normalizeShippingCarrier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return SHIPPING_CARRIER_ALIASES[normalized] || normalized;
}

/** @param {string | null | undefined} value */
export function getShippingCarrierLabel(value) {
  const normalized = normalizeShippingCarrier(value);
  if (!normalized) {
    return null;
  }

  return SHIPPING_CARRIER_LABELS[normalized] || normalized;
}

/** @param {string} status */
export function orderStatusLabel(status) {
  /** @type {Record<string, string>} */
  const labels = {
    pending_payment: "Pendiente de pago",
    failed: "Pago rechazado",
    expired: "Pago expirado",
    paid: "Pagado",
    shipped: "Enviado",
    completed: "Completado",
    cancelled: "Cancelado",
  };

  return labels[status] || status;
}

/** @param {string} status */
export function getOrderProgress(status) {
  const steps = ["pending_payment", "paid", "shipped", "completed"];
  const currentIndex = steps.indexOf(status);
  const isStopped = status === "cancelled" || status === "failed" || status === "expired";

  return steps.map((step, index) => ({
    key: step,
    label: orderStatusLabel(step),
    state: isStopped
      ? "cancelled"
      : index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
}