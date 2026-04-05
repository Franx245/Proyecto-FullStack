const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

const ARGENTINA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: ARGENTINA_TIME_ZONE,
});

/**
 * @param {string | number | Date | null | undefined} value
 * @param {string} [fallback]
 */
export function formatArgentinaDateTime(value, fallback = "Sin fecha") {
  if (!value) {
    return fallback;
  }

  const normalizedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalizedDate.getTime())) {
    return fallback;
  }

  return ARGENTINA_DATE_TIME_FORMATTER.format(normalizedDate);
}