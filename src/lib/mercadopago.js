const MERCADOPAGO_SANDBOX_HOSTS = new Set([
  "sandbox.mercadopago.com.ar",
]);
const MERCADOPAGO_SDK_URL = "https://sdk.mercadopago.com/js/v2";
const MERCADOPAGO_TEST_PUBLIC_KEY_PREFIX = "TEST-";
const MERCADOPAGO_TEST_PAYER_EMAIL_DOMAIN = "example.com";

export function createMercadoPagoBrickDarkStyle() {
  return {
    theme: "dark",
    customVariables: {
    formBackgroundColor: "#0b1020",
    inputBackgroundColor: "#121a2f",
    textPrimaryColor: "#f8fafc",
    textSecondaryColor: "#94a3b8",
    baseColor: "#22c55e",
    baseColorFirstVariant: "#8b5cf6",
    baseColorSecondVariant: "#06b6d4",
    secondaryColor: "#0f172a",
    buttonTextColor: "#f8fafc",
    errorColor: "#fb7185",
    successColor: "#22c55e",
    secondarySuccessColor: "#86efac",
    outlinePrimaryColor: "rgba(139, 92, 246, 0.42)",
    outlineSecondaryColor: "rgba(148, 163, 184, 0.24)",
    inputFocusedBoxShadow: "0 0 0 3px rgba(139, 92, 246, 0.22)",
    inputErrorFocusedBoxShadow: "0 0 0 3px rgba(251, 113, 133, 0.18)",
    inputBorderWidth: "1px",
    inputFocusedBorderWidth: "1px",
    borderRadiusSmall: "12px",
    borderRadiusMedium: "16px",
    borderRadiusLarge: "24px",
    borderRadiusFull: "999px",
    fontSizeSmall: "14px",
    fontSizeMedium: "15px",
    fontSizeLarge: "18px",
    fontWeightNormal: "500",
    fontWeightSemiBold: "700",
    formPadding: "24px",
    inputVerticalPadding: "14px",
    inputHorizontalPadding: "14px",
    },
  };
}

export const MERCADOPAGO_BRICK_DARK_STYLE = createMercadoPagoBrickDarkStyle();

/** @type {Promise<*> | null} */
let mercadoPagoSdkPromise = null;

export const MERCADOPAGO_SANDBOX_HINT = "Si Mercado Pago entra en challenge o muestra ERR_TOO_MANY_REDIRECTS, probalo en una ventana privada de Chrome o Edge, con cookies habilitadas y sin bloqueos de Brave Shields.";

/** @param {string | null | undefined} value */
export function isMercadoPagoTestPublicKey(value) {
  return String(value || "").trim().toUpperCase().startsWith(MERCADOPAGO_TEST_PUBLIC_KEY_PREFIX);
}

/**
 * @param {{ publicKey?: string | null, preferredEmail?: string | null, orderId?: string | number | null }} options
 */
export function resolveMercadoPagoPayerEmail(options = {}) {
  const normalizedEmail = String(options.preferredEmail || "").trim().toLowerCase();
  if (!isMercadoPagoTestPublicKey(options.publicKey)) {
    return normalizedEmail;
  }

  const normalizedOrderId = Number(options.orderId);
  if (Number.isInteger(normalizedOrderId) && normalizedOrderId > 0) {
    return `checkout+order-${normalizedOrderId}@${MERCADOPAGO_TEST_PAYER_EMAIL_DOMAIN}`;
  }

  return `checkout@${MERCADOPAGO_TEST_PAYER_EMAIL_DOMAIN}`;
}

/**
 * @param {unknown} error
 * @param {{ publicKey?: string | null, origin?: string | null }} [options]
 */
export function formatMercadoPagoTokenizationError(error, options = {}) {
  const rawMessage = error instanceof Error
    ? String(error.message || "").trim()
    : String(error || "").trim();
  const normalizedMessage = rawMessage.toLowerCase();
  const normalizedOrigin = String(options.origin || "").trim();

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("load failed") || normalizedMessage.includes("networkerror")) {
    if (isMercadoPagoTestPublicKey(options.publicKey)) {
      return [
        "Mercado Pago rechazo la tokenizacion de tarjeta desde este dominio.",
        normalizedOrigin ? `Origen actual: ${normalizedOrigin}.` : null,
        "Revisa que la public key del storefront pertenezca a la misma cuenta que MP_ACCESS_TOKEN y que este dominio este cargado como URL permitida dentro de la aplicacion de Mercado Pago.",
      ].filter(Boolean).join(" ");
    }

    return [
      "Mercado Pago no permitio crear el token de tarjeta desde este origen.",
      normalizedOrigin ? `Origen actual: ${normalizedOrigin}.` : null,
      "Verifica las URLs permitidas de la aplicacion y que la public key del storefront sea la correcta.",
    ].filter(Boolean).join(" ");
  }

  return rawMessage || "Mercado Pago no pudo tokenizar la tarjeta.";
}

/** @param {string} value */
export function isMercadoPagoSandboxUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return MERCADOPAGO_SANDBOX_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** @param {string} initPoint */
export function openMercadoPagoCheckout(initPoint) {
  if (!isMercadoPagoSandboxUrl(initPoint)) {
    window.location.assign(initPoint);
    return "redirect";
  }

  const popup = window.open(initPoint, "_blank", "noopener,noreferrer");
  if (popup) {
    popup.focus?.();
    return "popup";
  }

  window.location.assign(initPoint);
  return "redirect";
}

export async function loadMercadoPagoSdk() {
  if (typeof window === "undefined") {
    throw new Error("Mercado Pago SDK is only available in the browser");
  }

  if (typeof /** @type {*} */ (window).MercadoPago === "function") {
    return /** @type {*} */ (window).MercadoPago;
  }

  if (!mercadoPagoSdkPromise) {
    mercadoPagoSdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${MERCADOPAGO_SDK_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(/** @type {*} */ (window).MercadoPago), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Mercado Pago SDK failed to load")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = MERCADOPAGO_SDK_URL;
      script.async = true;
      script.onload = () => {
        if (typeof /** @type {*} */ (window).MercadoPago !== "function") {
          reject(new Error("Mercado Pago SDK is unavailable after loading"));
          return;
        }

        resolve(/** @type {*} */ (window).MercadoPago);
      };
      script.onerror = () => {
        mercadoPagoSdkPromise = null;
        reject(new Error("Mercado Pago SDK failed to load"));
      };
      document.head.appendChild(script);
    });
  }

  return mercadoPagoSdkPromise;
}

/** @param {string} publicKey */
export async function createMercadoPagoBrowserClient(publicKey) {
  const MercadoPago = await loadMercadoPagoSdk();
  return new MercadoPago(publicKey, { locale: "es-AR" });
}

/**
 * @param {*} mercadoPagoClient
 * @param {*} settings
 */
export function createMercadoPagoCardForm(mercadoPagoClient, settings) {
  if (!mercadoPagoClient || typeof mercadoPagoClient.cardForm !== "function") {
    throw new Error("Mercado Pago CardForm no esta disponible en esta sesion.");
  }

  return mercadoPagoClient.cardForm(settings);
}

/** @param {*} mercadoPagoClient */
export function createMercadoPagoBrickBuilder(mercadoPagoClient) {
  return mercadoPagoClient.bricks({ theme: "dark" });
}
