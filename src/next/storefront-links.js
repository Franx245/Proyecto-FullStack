import { ENV } from "@/config/env";

export function getLegacyStorefrontBaseUrl() {
  return String(ENV.LEGACY_STOREFRONT_URL || process.env.NEXT_PUBLIC_LEGACY_STOREFRONT_URL || "http://127.0.0.1:5173")
    .trim()
    .replace(/\/$/, "");
}

export function getLegacyStorefrontUrl(path = "/") {
  const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : `/${String(path || "")}`;
  return `${getLegacyStorefrontBaseUrl()}${normalizedPath}`;
}

export function isExternalHref(href) {
  return /^https?:\/\//i.test(String(href || ""));
}