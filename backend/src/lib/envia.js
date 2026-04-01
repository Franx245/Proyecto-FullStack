/**
 * Envia.com shipping integration
 * Supports: rate quotes, shipment creation, tracking lookup
 * Carriers: Correo Argentino, Andreani
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const ENVIA_BASE_URL = process.env.ENVIA_BASE_URL || "https://api-test.envia.com";
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "";
const ENVIA_WEBHOOK_SECRET = process.env.ENVIA_WEBHOOK_SECRET || "";

/** Carriers that Envia supports for Argentina */
const ENVIA_CARRIERS = ["andreani", "correo-argentino"];

const ENVIA_TIMEOUT_MS = 5_000;
const ENVIA_MAX_RETRIES = 2;

const ARGENTINA_STATE_CODES = {
  ba: "BA",
  "buenos aires": "BA",
  gba: "BA",
  caba: "CF",
  cf: "CF",
  cabaa: "CF",
  "capital federal": "CF",
  "ciudad autonoma de buenos aires": "CF",
  "ciudad autónoma de buenos aires": "CF",
  catamarca: "CA",
  ca: "CA",
  chaco: "CH",
  ch: "CH",
  chubut: "CH",
  cordoba: "CO",
  córdoba: "CO",
  co: "CO",
  corrientes: "CR",
  cr: "CR",
  entrerrios: "ER",
  "entre rios": "ER",
  "entre ríos": "ER",
  er: "ER",
  formosa: "FO",
  fo: "FO",
  jujuy: "JY",
  jy: "JY",
  lapampa: "LP",
  "la pampa": "LP",
  lp: "LP",
  larioja: "LR",
  "la rioja": "LR",
  lr: "LR",
  mendoza: "ME",
  me: "ME",
  misiones: "MI",
  mi: "MI",
  neuquen: "NQ",
  neuquén: "NQ",
  nq: "NQ",
  rionegro: "RN",
  "rio negro": "RN",
  "río negro": "RN",
  rn: "RN",
  salta: "SA",
  sa: "SA",
  sanjuan: "SJ",
  "san juan": "SJ",
  sj: "SJ",
  sanluis: "SL",
  "san luis": "SL",
  sl: "SL",
  santacruz: "SC",
  "santa cruz": "SC",
  sc: "SC",
  santafe: "SF",
  "santa fe": "SF",
  sf: "SF",
  santiagodelestero: "SE",
  "santiago del estero": "SE",
  se: "SE",
  tierradelfuego: "TF",
  "tierra del fuego": "TF",
  tf: "TF",
  tucuman: "TU",
  tucumán: "TU",
  tu: "TU",
};

/** @param {string | null | undefined} value */
export function normalizeEnviaCarrier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["correoargentino", "correo argentino", "correo_argentino", "correo-argentino"].includes(normalized)) {
    return "correo-argentino";
  }

  if (["pickup", "showroom", "retiro"].includes(normalized)) {
    return "showroom";
  }

  return normalized;
}

/** @param {string | null | undefined} value @param {string | null | undefined} postalCode */
export function normalizeEnviaState(value, postalCode) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized) {
    const collapsed = normalized.replace(/[^a-z]/g, "");
    return ARGENTINA_STATE_CODES[normalized] || ARGENTINA_STATE_CODES[collapsed] || String(value).trim().toUpperCase();
  }

  return inferStateFromPostalCode(postalCode);
}

/** @param {string} rawBody @param {string} signature */
export function verifyEnviaWebhookSignature(rawBody, signature) {
  if (!ENVIA_WEBHOOK_SECRET || !signature) {
    return false;
  }

  const expected = createHmac("sha256", ENVIA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export function isEnviaConfigured() {
  return Boolean(ENVIA_API_KEY);
}

/**
 * @param {string} path
 * @param {object} [options]
 */
async function enviaFetch(path, options = {}) {
  const url = `${ENVIA_BASE_URL}${path}`;
  let lastError;

  for (let attempt = 1; attempt <= ENVIA_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENVIA_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENVIA_API_KEY}`,
          ...options.headers,
        },
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = body?.message || body?.error || `Envia API error ${response.status}`;
        const error = new Error(errorMessage);
        /** @type {*} */ (error).statusCode = response.status;
        /** @type {*} */ (error).enviaBody = body;
        throw error;
      }

      return body;
    } catch (err) {
      lastError = err;
      if (attempt < ENVIA_MAX_RETRIES && (err.name === "AbortError" || /** @type {*} */ (err).statusCode >= 500)) {
        console.warn(`ENVIA_RETRY attempt=${attempt} path=${path} error=${err.message}`);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

/**
 * @typedef {object} RateQuoteInput
 * @property {{ postal_code: string, city?: string, state?: string }} origin
 * @property {{ postal_code: string, city?: string, state?: string }} destination
 * @property {{ weight: number, height?: number, width?: number, length?: number }} parcel
 */

/**
 * @typedef {object} ShippingRate
 * @property {string} carrier
 * @property {string} carrierLabel
 * @property {string} service
 * @property {number} price
 * @property {string} estimatedDays
 * @property {string} currency
 */

/** Default origin = CABA (DuelVault showroom) */
const DEFAULT_ORIGIN = {
  name: "DuelVault",
  company: "DuelVault",
  street: "Av Corrientes",
  number: "1234",
  city: "Buenos Aires",
  state: "CF",
  postalCode: "1425",
  country: "AR",
};

/** Default parcel dimensions for card shipments */
const DEFAULT_PARCEL = {
  weight: 0.3,
  height: 5,
  width: 15,
  length: 20,
};

/**
 * Get shipping rates from Envia (one request per carrier, in parallel)
 * @param {{ postalCode: string, city?: string, state?: string }} destination
 * @param {{ weight?: number, itemCount?: number }} [options]
 * @returns {Promise<ShippingRate[]>}
 */
export async function getShippingRates(destination, options = {}) {
  if (!isEnviaConfigured()) {
    throw new Error("Envia no esta configurado");
  }

  if (!destination?.postalCode) {
    throw new Error("Código postal requerido para cotizar envío");
  }

  const weight = options.weight || Math.max(0.3, (options.itemCount || 1) * 0.6);

  const destinationPayload = {
    name: "Cliente",
    street: "Calle",
    number: "0",
    city: destination.city || "Buenos Aires",
    state: normalizeEnviaState(destination.state, destination.postalCode),
    postalCode: destination.postalCode,
    country: "AR",
  };

  const packagesPayload = [{
    content: "cards",
    amount: 1,
    type: "box",
    weight,
    weightUnit: "KG",
    lengthUnit: "CM",
    insurance: 0,
    declaredValue: 0,
    dimensions: {
      length: DEFAULT_PARCEL.length,
      width: DEFAULT_PARCEL.width,
      height: DEFAULT_PARCEL.height,
    },
  }];

  try {
    const ratePromises = ENVIA_CARRIERS.map(async (carrier) => {
      try {
        const body = await enviaFetch("/ship/rate/", {
          method: "POST",
          body: JSON.stringify({
            origin: DEFAULT_ORIGIN,
            destination: destinationPayload,
            packages: packagesPayload,
            shipment: {
              type: 1,
              carrier,
            },
            settings: {
              currency: "ARS",
            },
          }),
        });

        const rates = Array.isArray(body?.data) ? body.data : [];
        return rates
          .map((rate) => {
            const normalizedCarrier = normalizeEnviaCarrier(rate.carrier || carrier);
            const currency = String(rate.currency || "ARS").trim().toUpperCase();
            const price = Number(rate.totalPrice ?? rate.basePrice ?? 0);

            if (!normalizedCarrier || !Number.isFinite(price) || price <= 0 || (currency && currency !== "ARS")) {
              return null;
            }

            return {
              carrier: normalizedCarrier,
              carrierLabel: carrierDisplayName(rate.carrier || carrier),
              service: String(rate.serviceDescription || rate.service || "Estándar"),
              price: Math.round(price),
              estimatedDays: String(rate.deliveryEstimate || rate.days || "3-7 días"),
              currency,
            };
          })
          .filter(Boolean);
      } catch (err) {
        console.warn(`Envia rate failed for ${carrier}:`, err.message);
        return [];
      }
    });

    const allRates = (await Promise.all(ratePromises)).flat();

    if (!allRates.length) {
      throw new Error("No shipping rates available");
    }

    return allRates.sort((a, b) => a.price - b.price);
  } catch (error) {
    console.warn("Envia rate quote failed", error.message);
    throw error;
  }
}

/**
 * Create shipment after payment is approved
 * @param {object} params
 * @param {object} params.order
 * @param {string} params.carrier
 * @param {string} params.service
 * @returns {Promise<{ shipmentId: string, trackingNumber: string, label?: string }>}
 */
export async function createShipment({ order, carrier, service }) {
  if (!isEnviaConfigured()) {
    throw new Error("Envia no está configurado");
  }

  if (order.status !== "paid" && order.status !== "PAID") {
    throw new Error("Solo se pueden crear envíos para órdenes pagadas");
  }

  if (!order.shippingAddress || !order.shippingPostalCode) {
    throw new Error("La orden no tiene dirección de envío completa");
  }

  const normalizedCarrier = normalizeEnviaCarrier(carrier);
  const body = await enviaFetch("/ship/generate/", {
    method: "POST",
    body: JSON.stringify({
      origin: {
        ...DEFAULT_ORIGIN,
        email: "soporte@duelvault.com",
        phone: "+5491168401039",
      },
      destination: {
        name: order.customerName || "Cliente",
        email: order.customerEmail || "",
        phone: order.customerPhone || "",
        street: order.shippingAddress || "Calle",
        number: "S/N",
        city: order.shippingCity || "Buenos Aires",
        state: normalizeEnviaState(order.shippingProvince, order.shippingPostalCode),
        postalCode: order.shippingPostalCode,
        country: "AR",
      },
      packages: [{
        weight: Math.max(0.3, (order.items || []).reduce((sum, item) => sum + (0.6 * Number(item.quantity || 0)), 0)),
        weightUnit: "KG",
        lengthUnit: "CM",
        height: DEFAULT_PARCEL.height,
        width: DEFAULT_PARCEL.width,
        length: DEFAULT_PARCEL.length,
        content: `Cartas Yu-Gi-Oh! - Orden #${order.id}`,
      }],
      shipment: {
        type: 1,
        carrier: normalizedCarrier,
        service,
      },
      settings: {
        currency: "ARS",
      },
    }),
  });

  const shipment = Array.isArray(body?.data) ? body.data[0] : body?.data;

  return {
    shipmentId: String(shipment?.shipmentId || shipment?.shipment_id || shipment?.id || shipment?.carrier_tracking_number || ""),
    trackingNumber: String(shipment?.trackingNumber || shipment?.tracking || shipment?.carrier_tracking_number || ""),
    label: shipment?.label || null,
  };
}

/**
 * Get tracking info for a shipment
 * @param {string} trackingNumber
 * @param {string} carrier
 * @returns {Promise<{ status: string, events: Array<{ date: string, description: string, location?: string }> }>}
 */
export async function getTracking(trackingNumber, carrier) {
  if (!isEnviaConfigured()) {
    return { status: "unknown", events: [] };
  }

  if (!trackingNumber || typeof trackingNumber !== "string") {
    throw new Error("Número de tracking inválido");
  }

  try {
    const body = await enviaFetch(`/ship/tracking/?carrier=${encodeURIComponent(carrier)}&tracking_number=${encodeURIComponent(trackingNumber)}`);

    const events = Array.isArray(body?.data?.events || body?.data)
      ? (body.data.events || body.data).map((e) => ({
        date: e.date || e.created_at || "",
        description: e.description || e.status || "",
        location: e.location || e.city || "",
      }))
      : [];

    return {
      status: normalizeTrackingStatus(body?.data?.status || body?.data?.shipment_status || ""),
      events,
    };
  } catch (error) {
    console.warn("Envia tracking lookup failed", error.message);
    return { status: "unknown", events: [] };
  }
}

/** @param {string} carrier */
function carrierDisplayName(carrier) {
  const names = {
    "correo-argentino": "Correo Argentino",
    "andreani": "Andreani",
    showroom: "Retiro en showroom",
  };
  return names[normalizeEnviaCarrier(carrier) || ""] || carrier;
}

/** Infer Argentine province code from postal code prefix */
function inferStateFromPostalCode(postalCode) {
  const cp = String(postalCode).trim();
  if (!cp) return "BA";
  const n = parseInt(cp, 10);
  if (n >= 1000 && n <= 1499) return "CF";
  if (n >= 1600 && n <= 1899) return "BA";
  if (n >= 2000 && n <= 2999) return "SF";
  if (n >= 3000 && n <= 3699) return "ER";
  if (n >= 4000 && n <= 4699) return "TU";
  if (n >= 5000 && n <= 5999) return "CO";
  if (n >= 6000 && n <= 6699) return "BA";
  if (n >= 7000 && n <= 7699) return "BA";
  if (n >= 8000 && n <= 8499) return "RN";
  if (n >= 8500 && n <= 8599) return "NQ";
  if (n >= 9000 && n <= 9499) return "CH";
  if (n >= 9400 && n <= 9999) return "SC";
  return "BA";
}

/** @param {string} status */
function normalizeTrackingStatus(status) {
  const s = String(status).toLowerCase();
  if (s.includes("deliver") || s.includes("entrega")) return "delivered";
  if (s.includes("transit") || s.includes("tránsito")) return "in_transit";
  if (s.includes("pickup") || s.includes("recib") || s.includes("colect")) return "picked_up";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("return") || s.includes("devol")) return "returned";
  return s || "pending";
}

/**
 * Normalize Envia webhook payload status
 * @param {string} status
 * @returns {string}
 */
export function normalizeEnviaWebhookStatus(status) {
  return normalizeTrackingStatus(status);
}
