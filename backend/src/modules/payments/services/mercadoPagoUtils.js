import { createHmac, timingSafeEqual } from "node:crypto";

export function buildCheckoutBackUrl(frontendPublicUrl, statusPath, orderId) {
  return `${frontendPublicUrl}/checkout/${statusPath}?orderId=${encodeURIComponent(String(orderId))}`;
}

export function isMercadoPagoCheckoutAutoReturnAllowed(value, localHostnames = ["localhost", "127.0.0.1"]) {
  if (!value) {
    return false;
  }

  const localHostSet = localHostnames instanceof Set
    ? localHostnames
    : new Set(localHostnames.map((hostname) => String(hostname || "").trim().toLowerCase()).filter(Boolean));

  try {
    const parsed = new URL(value);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();

    if (!hostname || localHostSet.has(hostname) || hostname === "0.0.0.0") {
      return false;
    }

    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function shouldUseMercadoPagoSandbox(accountDetails) {
  return Boolean(accountDetails?.isTestUser);
}

export function shouldUseMercadoPagoSandboxWebhook(accountDetails, accessToken, testAccessTokenPrefix) {
  return shouldUseMercadoPagoSandbox(accountDetails)
    || String(accessToken || "").startsWith(String(testAccessTokenPrefix || ""));
}

function isMercadoPagoWebhookBaseUrlAllowed(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();

    if (!hostname || ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function buildMercadoPagoNotificationUrl(backendPublicUrl, webhookPaths, { useSandboxWebhook = false } = {}) {
  if (!isMercadoPagoWebhookBaseUrlAllowed(backendPublicUrl)) {
    return null;
  }

  const webhookPath = useSandboxWebhook ? webhookPaths?.[1] : webhookPaths?.[0];
  return webhookPath ? `${backendPublicUrl}${webhookPath}?source_news=webhooks` : null;
}

export function splitMercadoPagoFullName(fullName) {
  const normalized = String(fullName || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function resolveMercadoPagoPayerEmail(order, accessToken, testBuyerEmail) {
  const email = String(order?.customerEmail || order?.user?.email || "").trim().toLowerCase();
  const isSandbox = String(accessToken || "").startsWith("TEST");

  if (!isSandbox) {
    return email;
  }

  return testBuyerEmail;
}

export function buildMercadoPagoPreferenceItems(order, cardsById, exchangeRate, formatCurrency) {
  const items = order.items.map((item) => {
    const card = cardsById.get(item.cardId);
    return {
      id: String(item.cardId),
      title: String(card?.name || `Carta #${item.cardId}`).slice(0, 120),
      description: String(card?.description || card?.setName || card?.cardType || "Carta coleccionable").slice(0, 240),
      category_id: "others",
      quantity: item.quantity,
      currency_id: "ARS",
      unit_price: formatCurrency(item.price * exchangeRate),
    };
  });

  if (order.shippingCost > 0) {
    items.push({
      id: `shipping-${order.id}`,
      title: String(order.shippingLabel || "Envio").slice(0, 120),
      description: String(order.shippingAddress || order.shippingZone || "Costo de envio").slice(0, 240),
      category_id: "services",
      quantity: 1,
      currency_id: "ARS",
      unit_price: formatCurrency(order.shippingCost * exchangeRate),
    });
  }

  return items;
}

export function alignMercadoPagoItemsTotal(items, totalArs, formatCurrency) {
  if (!Array.isArray(items) || items.length === 0) {
    return [
      {
        id: "order-total",
        title: "RareHunter Order",
        description: "Checkout total",
        category_id: "others",
        quantity: 1,
        currency_id: "ARS",
        unit_price: formatCurrency(totalArs),
      },
    ];
  }

  const currentTotal = formatCurrency(items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0));
  const delta = formatCurrency(totalArs - currentTotal);

  if (delta === 0) {
    return items;
  }

  const lastItem = items[items.length - 1];
  const adjustedUnitPrice = formatCurrency(lastItem.unit_price + (delta / Math.max(lastItem.quantity || 1, 1)));

  items[items.length - 1] = {
    ...lastItem,
    unit_price: adjustedUnitPrice > 0 ? adjustedUnitPrice : lastItem.unit_price,
  };

  return items;
}

export function resolveMercadoPagoCheckoutUrl(preference, { useSandbox }) {
  if (useSandbox) {
    return preference?.sandbox_init_point || preference?.init_point || null;
  }

  return preference?.init_point || preference?.sandbox_init_point || null;
}

export function unwrapMercadoPagoBody(payload) {
  return payload?.body || payload?.response || payload || null;
}

export function parseMercadoPagoSignature(headerValue) {
  const parts = String(headerValue || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.reduce((result, part) => {
    const [key, value] = part.split("=", 2);
    if (key === "ts") {
      result.ts = String(value || "").trim();
    }
    if (key === "v1") {
      result.v1 = String(value || "").trim();
    }
    return result;
  }, { ts: "", v1: "" });
}

export function buildMercadoPagoWebhookManifest(paymentId, requestId, ts) {
  const normalizedPaymentId = String(paymentId || "").trim().toLowerCase();
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedTs = String(ts || "").trim();
  const parts = [];

  if (normalizedPaymentId) {
    parts.push(`id:${normalizedPaymentId}`);
  }
  if (normalizedRequestId) {
    parts.push(`request-id:${normalizedRequestId}`);
  }
  if (normalizedTs) {
    parts.push(`ts:${normalizedTs}`);
  }

  return `${parts.join(";")};`;
}

export function validateMercadoPagoWebhookSignature({ headers, paymentId, webhookSecret, createAppError }) {
  const signature = parseMercadoPagoSignature(headers?.["x-signature"]);
  const requestId = String(headers?.["x-request-id"] || "").trim();

  if (!signature.ts || !signature.v1 || !requestId || !paymentId) {
    throw createAppError("Mercado Pago webhook signature headers are incomplete", {
      statusCode: 401,
      code: "INVALID_WEBHOOK_SIGNATURE",
    });
  }

  const manifest = buildMercadoPagoWebhookManifest(paymentId, requestId, signature.ts);
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(manifest)
    .digest("hex");
  const receivedSignature = signature.v1.toLowerCase();
  const isValid = expectedSignature.length === receivedSignature.length
    && timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature));

  if (!isValid) {
    throw createAppError("Mercado Pago webhook signature mismatch", {
      statusCode: 401,
      code: "INVALID_WEBHOOK_SIGNATURE",
    });
  }

  return {
    providerRequestId: requestId,
    manifest,
    ts: signature.ts,
  };
}

export function extractMercadoPagoPaymentId(payload, query) {
  const candidates = [
    payload?.data?.id,
    payload?.id,
    query?.id,
    query?.["data.id"],
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function isMercadoPagoSandboxMode(accessToken, testAccessTokenPrefix) {
  return String(accessToken || "").startsWith(String(testAccessTokenPrefix || ""));
}

export function buildSandboxShippingLabelUrl(orderId, backendPublicUrl) {
  const labelPath = `/api/shipping/label/${encodeURIComponent(String(orderId))}`;
  return backendPublicUrl ? `${backendPublicUrl}${labelPath}` : labelPath;
}