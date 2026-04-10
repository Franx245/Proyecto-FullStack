export function buildCheckoutExpirationDate(baseTime = Date.now(), expirationMinutes) {
  return new Date(baseTime + expirationMinutes * 60 * 1000);
}