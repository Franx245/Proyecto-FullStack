/**
 * Envia.com shipping integration
 * Supports: rate quotes, shipment creation, tracking lookup
 * Carriers: Correo Argentino, Andreani
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const ENVIA_BASE_URL = process.env.ENVIA_BASE_URL || "https://ship-test.envia.com";
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "";
const ENVIA_WEBHOOK_SECRET = process.env.ENVIA_WEBHOOK_SECRET || "";

const ALLOWED_CARRIERS = new Set(["correo-argentino", "andreani"]);

const ENVIA_TIMEOUT_MS = 10_000;

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
  } finally {
    clearTimeout(timeout);
  }
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
  postal_code: "1425",
  city: "Buenos Aires",
  state: "AR-C",
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
 * Get shipping rates from Envia
 * @param {{ postalCode: string, city?: string, state?: string }} destination
 * @param {{ weight?: number, itemCount?: number }} [options]
 * @returns {Promise<ShippingRate[]>}
 */
export async function getShippingRates(destination, options = {}) {
  if (!isEnviaConfigured()) {
    return getFallbackRates();
  }

  if (!destination?.postalCode) {
    throw new Error("Código postal requerido para cotizar envío");
  }

  const weight = options.weight || Math.max(0.3, (options.itemCount || 1) * 0.05);

  try {
    const body = await enviaFetch("/ship/rate/", {
      method: "POST",
      body: JSON.stringify({
        origin: DEFAULT_ORIGIN,
        destination: {
          postal_code: destination.postalCode,
          city: destination.city || "",
          state: destination.state || "",
          country: "AR",
        },
        packages: [{
          weight,
          height: DEFAULT_PARCEL.height,
          width: DEFAULT_PARCEL.width,
          length: DEFAULT_PARCEL.length,
        }],
      }),
    });

    const rates = Array.isArray(body?.data) ? body.data : [];

    return rates
      .filter((rate) => ALLOWED_CARRIERS.has(String(rate.carrier || "").toLowerCase()))
      .map((rate) => ({
        carrier: String(rate.carrier || "").toLowerCase(),
        carrierLabel: carrierDisplayName(rate.carrier),
        service: String(rate.service || rate.service_description || "Estándar"),
        price: Number(rate.total_price || rate.base_price || 0),
        estimatedDays: String(rate.days || rate.estimated_delivery || "3-5 días"),
        currency: "ARS",
      }))
      .sort((a, b) => a.price - b.price);
  } catch (error) {
    console.warn("Envia rate quote failed, using fallback", error.message);
    return getFallbackRates();
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

  const body = await enviaFetch("/ship/generate/", {
    method: "POST",
    body: JSON.stringify({
      origin: {
        name: "DuelVault",
        company: "DuelVault",
        email: "soporte@duelvault.com",
        phone: "+5491168401039",
        ...DEFAULT_ORIGIN,
        street: "Showroom DuelVault",
        number: "S/N",
      },
      destination: {
        name: order.customerName || "Cliente",
        email: order.customerEmail || "",
        phone: order.customerPhone || "",
        street: order.shippingAddress,
        number: "S/N",
        city: order.shippingCity || "",
        state: order.shippingProvince || "",
        postal_code: order.shippingPostalCode,
        country: "AR",
      },
      packages: [{
        weight: Math.max(0.3, (order.items?.length || 1) * 0.05),
        height: DEFAULT_PARCEL.height,
        width: DEFAULT_PARCEL.width,
        length: DEFAULT_PARCEL.length,
        content: `Cartas Yu-Gi-Oh! - Orden #${order.id}`,
      }],
      carrier,
      service,
    }),
  });

  return {
    shipmentId: String(body?.data?.carrier_tracking_number || body?.data?.shipment_id || body?.data?.id || ""),
    trackingNumber: String(body?.data?.carrier_tracking_number || body?.data?.tracking || ""),
    label: body?.data?.label || null,
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
  };
  return names[String(carrier).toLowerCase()] || carrier;
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

/** Fallback flat rates when Envia is unavailable */
function getFallbackRates() {
  return [
    {
      carrier: "correo-argentino",
      carrierLabel: "Correo Argentino",
      service: "Estándar",
      price: 4500,
      estimatedDays: "3-5 días",
      currency: "ARS",
    },
    {
      carrier: "andreani",
      carrierLabel: "Andreani",
      service: "Express",
      price: 6000,
      estimatedDays: "2-3 días",
      currency: "ARS",
    },
    {
      carrier: "showroom",
      carrierLabel: "Retiro en showroom",
      service: "Retiro",
      price: 0,
      estimatedDays: "Coordinar",
      currency: "ARS",
    },
  ];
}

/**
 * Normalize Envia webhook payload status
 * @param {string} status
 * @returns {string}
 */
export function normalizeEnviaWebhookStatus(status) {
  return normalizeTrackingStatus(status);
}
