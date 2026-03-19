const resolveApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return "";
};

export const ENV = {
  APP_NAME: import.meta.env.VITE_APP_NAME || "DuelVault",
  ENV: import.meta.env.VITE_APP_ENV || "development",
  CLOUDINARY_CLOUD_NAME: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "",
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  ENABLE_SUPABASE_REALTIME: import.meta.env.VITE_ENABLE_SUPABASE_REALTIME === "true",
  SUPABASE_SCHEMA: import.meta.env.VITE_SUPABASE_SCHEMA || "public",
  SUPABASE_CARDS_TABLE: import.meta.env.VITE_SUPABASE_CARDS_TABLE || "cards",

  API_BASE_URL: resolveApiBaseUrl(),
  API_TIMEOUT: Number(import.meta.env.VITE_API_TIMEOUT || 10000),

  AUTH_PROVIDER: import.meta.env.VITE_AUTH_PROVIDER || "base44",

  MP_PUBLIC_KEY: import.meta.env.VITE_MP_PUBLIC_KEY || null,

  FEATURES: {
    CART: import.meta.env.VITE_ENABLE_CART === "true",
    ORDERS: import.meta.env.VITE_ENABLE_ORDERS === "true",
    ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS === "true",
  },
};

/* DEV LOG (solo en desarrollo) */
if (ENV.ENV === "development") {
  console.log("🌱 ENV CONFIG:", ENV);
}