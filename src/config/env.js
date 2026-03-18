const required = (value, name) => {
  if (!value) {
    throw new Error(`❌ Missing env variable: ${name}`);
  }
  return value;
};

export const ENV = {
  APP_NAME: import.meta.env.VITE_APP_NAME || "DuelVault",
  ENV: import.meta.env.VITE_APP_ENV || "development",

  API_BASE_URL: required(import.meta.env.VITE_API_BASE_URL, "VITE_API_BASE_URL"),
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