import "../backend/src/lib/load-env.js";
import { chromium } from "@playwright/test";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || "0";

function resolveProductionUrl(primaryValue, secondaryValue, fallbackValue) {
  const candidates = [primaryValue, secondaryValue, fallbackValue];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().replace(/\/$/, "");
    if (!normalized) {
      continue;
    }

    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(normalized)) {
      continue;
    }

    return normalized;
  }

  return String(fallbackValue).trim().replace(/\/$/, "");
}

const STOREFRONT_URL = resolveProductionUrl(
  process.env.PRODUCTION_STOREFRONT_URL,
  process.env.FRONTEND_URL,
  "https://duelvault-store-api.vercel.app"
);
const API_URL = resolveProductionUrl(
  process.env.PRODUCTION_API_URL,
  process.env.BACKEND_URL,
  "https://proyecto-fullstack-production-8fe1.up.railway.app"
);
const MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || process.env.VITE_MP_PUBLIC_KEY || process.env.MP_PUBLIC_KEY || "";
const MP_CARDHOLDER_NAME = process.env.MP_CARDHOLDER_NAME || "APRO";
const MP_CARD_NUMBER = process.env.MP_CARD_NUMBER || "4509953566233704";
const MP_SECURITY_CODE = process.env.MP_SECURITY_CODE || "123";
const MP_EXP_MONTH = process.env.MP_EXP_MONTH || "11";
const MP_EXP_YEAR = process.env.MP_EXP_YEAR || "2030";
const ADMIN_IDENTIFIER = process.env.ADMIN_IDENTIFIER || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SMOKE_USER_EMAIL = String(process.env.SMOKE_USER_EMAIL || "").trim().toLowerCase();
const SMOKE_USER_USERNAME = String(process.env.SMOKE_USER_USERNAME || "").trim();
const SMOKE_USER_PASSWORD = String(process.env.SMOKE_USER_PASSWORD || "Smoke1234").trim() || "Smoke1234";
const SMOKE_USER_FULL_NAME = String(process.env.SMOKE_USER_FULL_NAME || "Smoke Buyer").trim() || "Smoke Buyer";
const SMOKE_CHECKOUT_EMAIL = String(process.env.SMOKE_CHECKOUT_EMAIL || "").trim().toLowerCase();

const ADDRESS_CANDIDATES = [
  {
    label: "CABA Smoke",
    recipient_name: "Smoke Buyer",
    line1: "Av. Rivadavia 1000",
    city: "CABA",
    state: "Ciudad Autónoma de Buenos Aires",
    postal_code: "1405",
    zone: "caba",
    phone: "5491100000001",
    is_default: true,
  },
  {
    label: "GBA Smoke",
    recipient_name: "Smoke Buyer",
    line1: "Av. Rivadavia 14520",
    city: "Ramos Mejía",
    state: "Buenos Aires",
    postal_code: "1704",
    zone: "gba",
    phone: "5491100000002",
    is_default: false,
  },
  {
    label: "Interior Smoke",
    recipient_name: "Smoke Buyer",
    line1: "Av. Colón 1200",
    city: "Córdoba",
    state: "Córdoba",
    postal_code: "5000",
    zone: "interior",
    phone: "5491100000003",
    is_default: false,
  },
];

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(baseUrl, path, options = {}) {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function createCardToken() {
  if (!MP_PUBLIC_KEY) {
    return null;
  }

  return requestJson("https://api.mercadopago.com", `/v1/card_tokens?public_key=${encodeURIComponent(MP_PUBLIC_KEY)}`, {
    method: "POST",
    body: JSON.stringify({
      card_number: MP_CARD_NUMBER,
      security_code: MP_SECURITY_CODE,
      expiration_month: MP_EXP_MONTH,
      expiration_year: MP_EXP_YEAR,
      cardholder: {
        name: MP_CARDHOLDER_NAME,
        identification: {
          type: "DNI",
          number: "12345678",
        },
      },
    }),
  });
}

async function createStoreUserSession() {
  const suffix = randomSuffix();
  const email = SMOKE_USER_EMAIL || `smoke_${suffix}@testuser.com`;
  const username = SMOKE_USER_USERNAME || email.split("@")[0] || `smoke_${suffix}`;
  const password = SMOKE_USER_PASSWORD;

  let session = null;
  try {
    session = await requestJson(API_URL, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        username,
        password,
        confirm_password: password,
        full_name: SMOKE_USER_FULL_NAME,
        phone: "5491100000000",
      }),
    });
  } catch (error) {
    if (error?.status !== 409) {
      throw error;
    }

    session = await requestJson(API_URL, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: email,
        password,
      }),
    });
  }

  return {
    session: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    },
    credentials: { email, username, password },
  };
}

function resolveSmokeCheckoutEmail(userEmail) {
  const preferred = String(SMOKE_CHECKOUT_EMAIL || "").trim().toLowerCase();
  if (preferred) {
    return preferred;
  }

  if (String(MP_PUBLIC_KEY || "").trim().toUpperCase().startsWith("TEST-")) {
    return `checkout+smoke-${randomSuffix()}@example.com`;
  }

  return String(userEmail || "").trim().toLowerCase();
}

async function fetchCardForCheckout() {
  const payload = await requestJson(API_URL, "/api/cards?page=1&pageSize=20");
  const card = Array.isArray(payload?.cards)
    ? payload.cards.find((entry) => Number(entry?.stock || 0) > 0 && Number(entry?.price || 0) > 0)
    : null;

  if (!card) {
    throw new Error("No hay cartas con stock para el smoke productivo");
  }

  return card;
}

async function createAddress(accessToken, address) {
  const payload = await requestJson(API_URL, "/api/auth/addresses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(address),
  });

  return payload.address;
}

async function quoteAddress(accessToken, address, quantity) {
  const payload = await requestJson(API_URL, "/api/shipping/rates", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      postal_code: address.postal_code,
      city: address.city,
      state: address.state,
      item_count: quantity,
      weight: quantity * 0.6,
    }),
  });

  return {
    address,
    rates: Array.isArray(payload?.rates) ? payload.rates : [],
  };
}

function findCarrierPair(quotes) {
  const candidates = ["correo-argentino", "andreani"];
  for (const carrier of candidates) {
    const matching = quotes
      .map((quote) => ({
        quote,
        rate: quote.rates.find((entry) => String(entry?.carrier || "").trim().toLowerCase() === carrier && Number(entry?.price || 0) > 0),
      }))
      .filter((entry) => entry.rate);

    for (let index = 0; index < matching.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < matching.length; innerIndex += 1) {
        const left = matching[index];
        const right = matching[innerIndex];
        if (roundCurrency(left.rate.price) !== roundCurrency(right.rate.price)) {
          return {
            carrier,
            primary: left,
            secondary: right,
          };
        }
      }
    }
  }

  return null;
}

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function fetchOrders(accessToken) {
  return requestJson(API_URL, "/api/auth/orders?page=1&limit=20", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function fetchAdminOrders(accessToken, search) {
  return requestJson(API_URL, `/api/admin/orders?page=1&pageSize=20&search=${encodeURIComponent(search)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function waitForOrderUpdate(accessToken, orderId, matcher, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await fetchOrders(accessToken);
    const order = Array.isArray(payload?.orders) ? payload.orders.find((entry) => Number(entry?.id) === Number(orderId)) : null;
    if (order && matcher(order)) {
      return order;
    }
    await sleep(2000);
  }
  return null;
}

async function runUiSmoke({ session, card, primaryAddressId, secondaryAddressId, primaryRate, secondaryRate, orderId }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  await context.addInitScript(({ storedSession, cartItem }) => {
    window.localStorage.setItem("duelvault_user_session", JSON.stringify(storedSession));
    window.localStorage.setItem("yugioh_cart", JSON.stringify([cartItem]));
  }, {
    storedSession: session,
    cartItem: {
      version_id: String(card.id),
      detail_id: String(card.id),
      name: card.name,
      quantity: 1,
      price: Number(card.price),
      image: card.image || null,
      stock: Number(card.stock || 1),
      rarity: card.rarity || null,
      set_name: card.set_name || null,
    },
  });

  const page = await context.newPage();
  const timestamp = Date.now();
  const uiResult = {
    cart: null,
    checkout: null,
  };

  try {
    await page.goto(`${STOREFRONT_URL}/cart?ts=${timestamp}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Tu Carrito" }).waitFor({ timeout: 20000 });
    await page.locator("select").waitFor({ timeout: 20000 });

    const addressSelect = page.locator("select").first();
    await addressSelect.selectOption(String(primaryAddressId));
    await page.waitForTimeout(1000);

    const shippingValueLocator = page.locator("div.text-yellow-400 span").last();
    const totalValueLocator = page.locator("div.font-black.text-base.pt-1 span.text-lg.text-primary").first();

    await page.waitForFunction(
      () => {
        const shippingRow = document.querySelector("div.text-yellow-400");
        if (!shippingRow) return false;
        return !/Seleccioná envío|Cotizando|Calculando/i.test(String(shippingRow.textContent || ""));
      },
      null,
      { timeout: 20000 }
    );

    const initialShippingText = String(await shippingValueLocator.textContent() || "").trim();
    const initialTotalText = String(await totalValueLocator.textContent() || "").trim();

    await addressSelect.selectOption(String(secondaryAddressId));
    await page.waitForFunction(
      ({ initialShipping, initialTotal }) => {
        const shippingNode = document.querySelector("div.text-yellow-400 span:last-child");
        const totalNode = document.querySelector("div.font-black.text-base.pt-1 span.text-lg.text-primary");
        const shippingText = String(shippingNode?.textContent || "").trim();
        const totalText = String(totalNode?.textContent || "").trim();
        if (!shippingText || !totalText) {
          return false;
        }
        if (/Seleccioná envío|Cotizando|Calculando/i.test(shippingText) || /Calculando/i.test(totalText)) {
          return false;
        }
        return shippingText !== initialShipping || totalText !== initialTotal;
      },
      { initialShipping: initialShippingText, initialTotal: initialTotalText },
      { timeout: 25000 }
    );

    const updatedShippingText = String(await shippingValueLocator.textContent() || "").trim();
    const updatedTotalText = String(await totalValueLocator.textContent() || "").trim();

    uiResult.cart = {
      initialShippingText,
      initialTotalText,
      updatedShippingText,
      updatedTotalText,
      expectedPrimaryShipping: Number(primaryRate.price),
      expectedSecondaryShipping: Number(secondaryRate.price),
    };

    assert(initialShippingText !== updatedShippingText || initialTotalText !== updatedTotalText, "El carrito no recalculó automáticamente al cambiar de dirección", uiResult.cart);

    await page.goto(`${STOREFRONT_URL}/checkout/pay/${orderId}?ts=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Formulario de pago" }).waitFor({ timeout: 20000 });
    await page.waitForFunction(
      () => {
        const bodyText = String(document.body?.textContent || "");
        const stillLoadingOrder = /Cargando orden/i.test(bodyText);
        const hasBrickContainer = Boolean(document.querySelector('[id^="cardPaymentBrick_container"]'));
        const hasCardNumber = /Número de tarjeta/i.test(bodyText);
        const hasPayButton = /Pagar/i.test(bodyText);
        return !stillLoadingOrder && (hasBrickContainer || hasCardNumber || hasPayButton);
      },
      null,
      { timeout: 25000 }
    );

    const brickLocator = page.locator(`[id="cardPaymentBrick_container_${orderId}"]`);
    const anyBrickLocator = page.locator('[id^="cardPaymentBrick_container"]');
    const brickPresent = await anyBrickLocator.count().then((count) => count > 0).catch(() => false);
    const brickVisible = brickPresent ? await anyBrickLocator.first().isVisible().catch(() => false) : false;
    const loadingVisible = await page.getByText(/Cargando formulario seguro de Mercado Pago/i).isVisible().catch(() => false);
    const cardNumberVisible = await page.getByText(/Número de tarjeta/i).isVisible().catch(() => false);
    const payButtonVisible = await page.getByRole("button", { name: /^Pagar$/i }).isVisible().catch(() => false);
    const brickChildren = brickPresent
      ? await brickLocator.evaluate((node) => node.childElementCount).catch(() => 0)
      : 0;
    const shellText = await page.locator("body").textContent();
    const shellSnippet = String(shellText || "").replace(/\s+/g, " ").trim().slice(0, 800);

    uiResult.checkout = {
      brickPresent,
      brickVisible,
      brickChildren,
      cardNumberVisible,
      payButtonVisible,
      loadingVisible,
      shellSnippet,
      shellHasError: /No encontramos la orden|ID de orden inválido|Redirigiendo al acceso seguro/i.test(String(shellText || "")),
      shellHasHeading: /Formulario de pago/i.test(String(shellText || "")),
    };

    assert(
      uiResult.checkout.shellHasHeading
      && !uiResult.checkout.shellHasError
      && (uiResult.checkout.brickPresent || uiResult.checkout.cardNumberVisible || uiResult.checkout.payButtonVisible),
      "La página de pago no renderizó el shell/brick esperado",
      uiResult.checkout
    );
  } finally {
    await context.close();
    await browser.close();
  }

  return uiResult;
}

async function main() {
  const health = await requestJson(API_URL, "/api/health");
  const adminSession = await requestJson(API_URL, "/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
    }),
  });

  const { session, credentials } = await createStoreUserSession();
  const checkoutEmail = resolveSmokeCheckoutEmail(credentials.email);
  const card = await fetchCardForCheckout();

  const createdAddresses = [];
  for (const candidate of ADDRESS_CANDIDATES) {
    const address = await createAddress(session.accessToken, candidate);
    try {
      const quote = await quoteAddress(session.accessToken, address, 1);
      createdAddresses.push(quote);
    } catch (error) {
      createdAddresses.push({ address, rates: [], quoteError: error.message });
    }
  }

  const validQuotes = createdAddresses.filter((entry) => Array.isArray(entry.rates) && entry.rates.length > 0);
  assert(validQuotes.length >= 2, "No se pudieron obtener al menos dos cotizaciones válidas de shipping", createdAddresses);

  const pair = findCarrierPair(validQuotes);
  assert(pair, "No se encontró un carrier reutilizable con precios distintos entre dos direcciones", validQuotes);

  const primaryRate = pair.primary.rate;
  const secondaryRate = pair.secondary.rate;
  const checkout = await requestJson(API_URL, "/api/checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "X-Idempotency-Key": `production-smoke-checkout-${randomSuffix()}`,
    },
    body: JSON.stringify({
      items: [
        {
          cardId: Number(card.id),
          quantity: 1,
        },
      ],
      customer_name: credentials.username,
      customer_email: checkoutEmail,
      phone: "5491100000000",
      accepted: true,
      shipping_zone: pair.primary.quote.address.zone,
      shipping_carrier: primaryRate.carrier,
      addressId: Number(pair.primary.quote.address.id),
      notes: "production smoke",
      mutation_id: `production-smoke-checkout-${randomSuffix()}`,
    }),
  });

  const order = checkout?.order;
  assert(order?.id, "Checkout productivo sin order.id", checkout);

  const expectedSubtotal = roundCurrency(card.price);
  const expectedShipping = roundCurrency(primaryRate.price);
  const expectedTotal = roundCurrency(expectedSubtotal + expectedShipping);

  assert(roundCurrency(order.subtotal) === expectedSubtotal, "Subtotal persistido distinto al item seleccionado", { expectedSubtotal, actual: order.subtotal, card });
  assert(roundCurrency(order.shipping_cost) === expectedShipping, "Shipping persistido distinto a la tarifa elegida", { expectedShipping, actual: order.shipping_cost, selectedRate: primaryRate });
  assert(roundCurrency(order.total) === expectedTotal || roundCurrency(order.total_ars) === expectedTotal, "Total persistido inconsistente", { expectedTotal, total: order.total, total_ars: order.total_ars });
  assert(String(order.carrier || "").trim().toLowerCase() === String(primaryRate.carrier || "").trim().toLowerCase(), "Carrier persistido inconsistente", { expectedCarrier: primaryRate.carrier, actualCarrier: order.carrier });

  const ordersPayload = await fetchOrders(session.accessToken);
  const historyOrder = Array.isArray(ordersPayload?.orders)
    ? ordersPayload.orders.find((entry) => Number(entry?.id) === Number(order.id))
    : null;
  assert(historyOrder, "La orden no apareció en historial del usuario", ordersPayload);
  assert(roundCurrency(historyOrder.shipping_cost) === expectedShipping, "Historial con shipping desincronizado", { expectedShipping, historyOrder });
  assert(String(historyOrder.carrier || "").trim().toLowerCase() === String(primaryRate.carrier || "").trim().toLowerCase(), "Historial sin carrier sincronizado", historyOrder);

  const adminOrdersPayload = await fetchAdminOrders(adminSession.accessToken, String(order.id));
  const adminOrder = Array.isArray(adminOrdersPayload?.orders)
    ? adminOrdersPayload.orders.find((entry) => Number(entry?.id) === Number(order.id))
    : null;
  assert(adminOrder, "La orden no apareció en admin", adminOrdersPayload);
  assert(roundCurrency(adminOrder.shipping_cost) === expectedShipping, "Admin con shipping desincronizado", { expectedShipping, adminOrder });
  assert(String(adminOrder.carrier || "").trim().toLowerCase() === String(primaryRate.carrier || "").trim().toLowerCase(), "Admin sin carrier sincronizado", adminOrder);

  const ui = await runUiSmoke({
    session,
    card,
    primaryAddressId: pair.primary.quote.address.id,
    secondaryAddressId: pair.secondary.quote.address.id,
    primaryRate,
    secondaryRate,
    orderId: order.id,
  });

  let paymentAttempt = null;
  let paymentError = null;
  if (MP_PUBLIC_KEY) {
    try {
      const cardToken = await createCardToken();
      paymentAttempt = await requestJson(API_URL, "/api/payments/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-Idempotency-Key": `production-smoke-payment-${randomSuffix()}`,
        },
        body: JSON.stringify({
          orderId: Number(order.id),
          token: cardToken.id,
          payment_method_id: "visa",
          installments: 1,
          identification: {
            type: "DNI",
            number: "12345678",
          },
          mutation_id: `production-smoke-payment-${randomSuffix()}`,
        }),
      });
    } catch (error) {
      paymentError = {
        message: error?.message || String(error),
        status: error?.status || null,
        payload: error?.payload || null,
      };
    }
  }

  const paymentOrder = paymentAttempt
    ? await waitForOrderUpdate(session.accessToken, order.id, (entry) => Boolean(entry.payment_id || entry.payment_status), 20000)
    : null;

  console.log(JSON.stringify({
    ok: true,
    storefrontUrl: STOREFRONT_URL,
    apiUrl: API_URL,
    health,
    createdUser: {
      id: session.user?.id || null,
      email: credentials.email,
      checkoutEmail,
      username: credentials.username,
    },
    card: {
      id: card.id,
      name: card.name,
      price: Number(card.price),
    },
    shippingPair: {
      carrier: pair.carrier,
      primary: {
        addressId: pair.primary.quote.address.id,
        zone: pair.primary.quote.address.zone,
        postalCode: pair.primary.quote.address.postal_code,
        city: pair.primary.quote.address.city,
        price: Number(primaryRate.price),
      },
      secondary: {
        addressId: pair.secondary.quote.address.id,
        zone: pair.secondary.quote.address.zone,
        postalCode: pair.secondary.quote.address.postal_code,
        city: pair.secondary.quote.address.city,
        price: Number(secondaryRate.price),
      },
    },
    checkoutOrder: {
      id: order.id,
      subtotal: order.subtotal,
      shipping_cost: order.shipping_cost,
      total: order.total,
      total_ars: order.total_ars,
      carrier: order.carrier,
      shipping_label: order.shipping_label,
      status: order.status,
    },
    historyOrder: historyOrder
      ? {
          id: historyOrder.id,
          shipping_cost: historyOrder.shipping_cost,
          total: historyOrder.total,
          carrier: historyOrder.carrier,
          shipping_label: historyOrder.shipping_label,
          status: historyOrder.status,
        }
      : null,
    adminOrder: adminOrder
      ? {
          id: adminOrder.id,
          shipping_cost: adminOrder.shipping_cost,
          total: adminOrder.total,
          carrier: adminOrder.carrier,
          shipping_label: adminOrder.shipping_label,
          status: adminOrder.status,
        }
      : null,
    paymentAttempt: paymentAttempt
      ? {
          payment: paymentAttempt.payment,
          order: paymentAttempt.order,
        }
      : null,
    paymentError,
    paymentOrder: paymentOrder
      ? {
          id: paymentOrder.id,
          status: paymentOrder.status,
          payment_id: paymentOrder.payment_id,
          payment_status: paymentOrder.payment_status,
          payment_status_detail: paymentOrder.payment_status_detail,
        }
      : null,
    ui,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error?.message || String(error),
    status: error?.status || null,
    details: error?.details || null,
    payload: error?.payload || null,
    stack: error?.stack || null,
  }, null, 2));
  process.exitCode = 1;
});