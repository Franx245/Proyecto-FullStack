const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/**
 * Format a numeric value as an ARS price.
 * @param {number|string|null|undefined} value
 * @returns {string} e.g. "$ 12.500"
 */
export function formatPrice(value) {
  return arsFormatter.format(Number(value || 0));
}
