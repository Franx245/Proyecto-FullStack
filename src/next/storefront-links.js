/** @param {string} href */
export function isExternalHref(href) {
  return /^https?:\/\//i.test(String(href || ""));
}