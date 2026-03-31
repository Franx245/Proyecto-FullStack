const MERCADOPAGO_SANDBOX_HOSTS = new Set([
  "sandbox.mercadopago.com.ar",
]);
const MERCADOPAGO_SDK_URL = "https://sdk.mercadopago.com/js/v2";

let mercadoPagoSdkPromise = null;

export const MERCADOPAGO_SANDBOX_HINT = "Si Mercado Pago entra en challenge o muestra ERR_TOO_MANY_REDIRECTS, probalo en una ventana privada de Chrome o Edge, con cookies habilitadas y sin bloqueos de Brave Shields.";

export function isMercadoPagoSandboxUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return MERCADOPAGO_SANDBOX_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

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

  if (typeof window.MercadoPago === "function") {
    return window.MercadoPago;
  }

  if (!mercadoPagoSdkPromise) {
    mercadoPagoSdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${MERCADOPAGO_SDK_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.MercadoPago), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Mercado Pago SDK failed to load")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = MERCADOPAGO_SDK_URL;
      script.async = true;
      script.onload = () => {
        if (typeof window.MercadoPago !== "function") {
          reject(new Error("Mercado Pago SDK is unavailable after loading"));
          return;
        }

        resolve(window.MercadoPago);
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

export async function createMercadoPagoBrowserClient(publicKey) {
  const MercadoPago = await loadMercadoPagoSdk();
  return new MercadoPago(publicKey, { locale: "es-AR" });
}
