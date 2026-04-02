/** @type {Record<string, string | undefined>} */
let viteEnv = /** @type {Record<string, string | undefined>} */ ({});
try {
  viteEnv = /** @type {Record<string, string | undefined>} */ (import.meta.env || {});
} catch {
  // Not running inside Vite — fallback to empty
}

/** @type {Record<string, string | undefined>} */
const runtimeEnv = typeof process !== "undefined" && process?.env
  ? process.env
  : {};

/**
 * @typedef {keyof typeof nextPublicEnv} NextPublicEnvKey
 */

const nextPublicEnv = {
  NEXT_PUBLIC_APP_NAME: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_NAME : undefined,
  NEXT_PUBLIC_APP_ENV: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_ENV : undefined,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME : undefined,
  NEXT_PUBLIC_SUPABASE_URL: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined,
  NEXT_PUBLIC_ENABLE_SUPABASE_REALTIME: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ENABLE_SUPABASE_REALTIME : undefined,
  NEXT_PUBLIC_SUPABASE_SCHEMA: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_SCHEMA : undefined,
  NEXT_PUBLIC_SUPABASE_CARDS_TABLE: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_CARDS_TABLE : undefined,
  NEXT_PUBLIC_API_BASE_URL: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_BASE_URL : undefined,
  NEXT_PUBLIC_API_TIMEOUT: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_TIMEOUT : undefined,
  NEXT_PUBLIC_AUTH_PROVIDER: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_AUTH_PROVIDER : undefined,
  NEXT_PUBLIC_MP_PUBLIC_KEY: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MP_PUBLIC_KEY : undefined,
  NEXT_PUBLIC_LEGACY_STOREFRONT_URL: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_LEGACY_STOREFRONT_URL : undefined,
  NEXT_PUBLIC_ENABLE_CART: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ENABLE_CART : undefined,
  NEXT_PUBLIC_ENABLE_ORDERS: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ENABLE_ORDERS : undefined,
  NEXT_PUBLIC_ENABLE_ANALYTICS: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ENABLE_ANALYTICS : undefined,
  NEXT_PUBLIC_ENABLE_PERF_TRACE: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ENABLE_PERF_TRACE : undefined,
};

/**
 * @param {string} viteKey
 * @param {NextPublicEnvKey} nextKey
 * @param {string} [fallback]
 */
function readEnv(viteKey, nextKey, fallback = "") {
  const viteValue = viteEnv?.[viteKey];
  if (viteValue !== undefined && viteValue !== null && viteValue !== "") {
    return viteValue;
  }

  const runtimeValue = nextPublicEnv?.[nextKey] ?? runtimeEnv?.[nextKey];
  if (runtimeValue !== undefined && runtimeValue !== null && runtimeValue !== "") {
    return runtimeValue;
  }

  return fallback;
}

/**
 * @param {string} viteKey
 * @param {NextPublicEnvKey} nextKey
 * @param {boolean} [fallback]
 */
function readFlag(viteKey, nextKey, fallback = false) {
  const value = String(readEnv(viteKey, nextKey, fallback ? "true" : "false")).trim().toLowerCase();
  return value === "true";
}

const RAILWAY_BACKEND_URL = "https://proyecto-fullstack-production-8fe1.up.railway.app";

const resolveApiBaseUrl = () => {
  const configured = readEnv("VITE_API_BASE_URL", "NEXT_PUBLIC_API_BASE_URL", runtimeEnv?.BACKEND_URL || "");
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return RAILWAY_BACKEND_URL;
};

export const ENV = {
  APP_NAME: readEnv("VITE_APP_NAME", "NEXT_PUBLIC_APP_NAME", "DuelVault"),
  ENV: readEnv("VITE_APP_ENV", "NEXT_PUBLIC_APP_ENV", "development"),
  CLOUDINARY_CLOUD_NAME: readEnv("VITE_CLOUDINARY_CLOUD_NAME", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", ""),
  SUPABASE_URL: readEnv("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", ""),
  SUPABASE_ANON_KEY: readEnv("VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
  ENABLE_SUPABASE_REALTIME: readFlag("VITE_ENABLE_SUPABASE_REALTIME", "NEXT_PUBLIC_ENABLE_SUPABASE_REALTIME", false),
  SUPABASE_SCHEMA: readEnv("VITE_SUPABASE_SCHEMA", "NEXT_PUBLIC_SUPABASE_SCHEMA", "public"),
  SUPABASE_CARDS_TABLE: readEnv("VITE_SUPABASE_CARDS_TABLE", "NEXT_PUBLIC_SUPABASE_CARDS_TABLE", "cards"),

  API_BASE_URL: resolveApiBaseUrl(),
  API_TIMEOUT: Number(readEnv("VITE_API_TIMEOUT", "NEXT_PUBLIC_API_TIMEOUT", "10000")),

  AUTH_PROVIDER: readEnv("VITE_AUTH_PROVIDER", "NEXT_PUBLIC_AUTH_PROVIDER", "base44"),

  MP_PUBLIC_KEY: readEnv("VITE_MP_PUBLIC_KEY", "NEXT_PUBLIC_MP_PUBLIC_KEY", "") || null,
  LEGACY_STOREFRONT_URL: readEnv("VITE_STOREFRONT_URL", "NEXT_PUBLIC_LEGACY_STOREFRONT_URL", ""),

  FEATURES: {
    CART: readFlag("VITE_ENABLE_CART", "NEXT_PUBLIC_ENABLE_CART", true),
    ORDERS: readFlag("VITE_ENABLE_ORDERS", "NEXT_PUBLIC_ENABLE_ORDERS", true),
    ANALYTICS: readFlag("VITE_ENABLE_ANALYTICS", "NEXT_PUBLIC_ENABLE_ANALYTICS", false),
    PERF_TRACE: readFlag("VITE_ENABLE_PERF_TRACE", "NEXT_PUBLIC_ENABLE_PERF_TRACE", false),
  },
};

/* DEV LOG (solo en desarrollo) */
if (ENV.ENV === "development" && typeof window !== "undefined") {
  console.log("🌱 ENV CONFIG:", ENV);
}