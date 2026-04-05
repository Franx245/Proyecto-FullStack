import "../backend/src/lib/load-env.js";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

const API_BASE_URL = normalizeBaseUrl(
  process.env.CHECKOUT_API_BASE_URL
  || process.env.BACKEND_URL
  || process.env.CHECKOUT_BASE_URL
  || "https://duelvault-store-api.vercel.app"
);
const PAGE_BASE_URL = normalizeBaseUrl(
  process.env.CHECKOUT_PAGE_BASE_URL
  || process.env.FRONTEND_URL
  || process.env.CHECKOUT_BASE_URL
  || API_BASE_URL
);
const PUBLIC_KEY = process.env.MP_PUBLIC_KEY || process.env.VITE_MP_PUBLIC_KEY || null;
const CARDHOLDER_NAME = process.env.MP_CARDHOLDER_NAME || "APRO";
const CARD_NUMBER = process.env.MP_CARD_NUMBER || "4509953566233704";
const SECURITY_CODE = process.env.MP_SECURITY_CODE || "123";
const EXP_MONTH = process.env.MP_EXP_MONTH || "11";
const EXP_YEAR = process.env.MP_EXP_YEAR || "2030";
const STORE_IDENTIFIER = process.env.STORE_IDENTIFIER || null;
const STORE_PASSWORD = process.env.STORE_PASSWORD || null;
const CHECKOUT_CUSTOMER_EMAIL = process.env.CHECKOUT_CUSTOMER_EMAIL || null;
const CHECKOUT_CUSTOMER_NAME = process.env.CHECKOUT_CUSTOMER_NAME || null;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${path}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetries(run, label) {
  let lastError = null;

  for (const delay of [0, 2000, 5000]) {
    if (delay) {
      await sleep(delay);
    }

    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_STATUS_CODES.has(Number(error?.status || 0))) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`${label} failed without response`);
}

async function apiExternal(url, options = {}) {
  const response = await fetch(url, options);
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
  if (!PUBLIC_KEY) {
    throw new Error("MP_PUBLIC_KEY or VITE_MP_PUBLIC_KEY is required to create a sandbox card token");
  }

  return withRetries(() => apiExternal(`https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(PUBLIC_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      card_number: CARD_NUMBER,
      security_code: SECURITY_CODE,
      expiration_month: EXP_MONTH,
      expiration_year: EXP_YEAR,
      cardholder: {
        name: CARDHOLDER_NAME,
        identification: {
          type: "DNI",
          number: "12345678",
        },
      },
    }),
  }), "card token");
}

async function main() {
  const suffix = randomSuffix();
  const email = `sandbox_${suffix}@testuser.com`;
  const username = `sandbox_${suffix}`;
  const password = "sandbox123";

  const registerPayload = {
    email,
    username,
    password,
    confirm_password: password,
    full_name: "Sandbox Checkout",
    phone: "5491100000000",
  };

  let session = null;
  let sessionLabel = "register";

  if (STORE_IDENTIFIER && STORE_PASSWORD) {
    session = await withRetries(() => api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: STORE_IDENTIFIER,
        password: STORE_PASSWORD,
      }),
    }), "store login");
    sessionLabel = "store-login";
  } else {
    try {
      session = await withRetries(() => api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerPayload),
      }), "register");
    } catch (error) {
      if (Number(error?.status) !== 409) {
        throw error;
      }

      session = await withRetries(() => api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: email,
          password,
        }),
      }), "login fallback");
      sessionLabel = "login-fallback";
    }
  }

  const cardsPayload = await withRetries(() => api("/api/cards?page=1&pageSize=5"), "catalog");
  const selectedCard = Array.isArray(cardsPayload.cards)
    ? cardsPayload.cards.find((card) => Number(card.stock || 0) > 0)
    : null;

  if (!selectedCard) {
    throw new Error("No in-stock card found for sandbox checkout");
  }

  const checkoutPayload = {
    items: [
      {
        cardId: Number(selectedCard.id),
        quantity: 1,
      },
    ],
    accepted: true,
    shipping_zone: "pickup",
    notes: "sandbox validation",
    mutation_id: `sandbox_checkout_${suffix}`,
    ...(CHECKOUT_CUSTOMER_EMAIL
      ? {
          customer_email: CHECKOUT_CUSTOMER_EMAIL,
        }
      : {}),
    ...(CHECKOUT_CUSTOMER_NAME
      ? {
          customer_name: CHECKOUT_CUSTOMER_NAME,
        }
      : {}),
  };

  const checkout = await withRetries(() => api("/api/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      "X-Idempotency-Key": `sandbox_checkout_${suffix}`,
    },
    body: JSON.stringify(checkoutPayload),
  }), "checkout");

  const checkoutPage = await withRetries(() => apiExternal(`${PAGE_BASE_URL}/checkout/pay/${checkout?.order?.id}`), "checkout page");

  const orders = await withRetries(() => api("/api/auth/orders", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  }), "orders");

  const createdOrder = Array.isArray(orders.orders)
    ? orders.orders.find((order) => Number(order.id) === Number(checkout?.order?.id))
    : null;

  let paymentAttempt = null;
  let paymentAttemptError = null;
  let cardTokenId = null;
  if (PUBLIC_KEY) {
    try {
      const cardToken = await createCardToken();
      cardTokenId = cardToken?.id || null;
      paymentAttempt = await withRetries(() => api("/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
          "X-Idempotency-Key": `sandbox_payment_${suffix}`,
        },
        body: JSON.stringify({
          orderId: Number(checkout?.order?.id),
          token: cardToken.id,
          payment_method_id: "visa",
          installments: 1,
          identification: {
            type: "DNI",
            number: "12345678",
          },
          mutation_id: `sandbox_payment_${suffix}`,
        }),
      }), "payment");
    } catch (error) {
      paymentAttemptError = {
        message: error.message,
        status: error.status || null,
        payload: error.payload || null,
      };
    }
  }

  console.log(JSON.stringify({
    session: {
      email: STORE_IDENTIFIER || email,
      username: STORE_IDENTIFIER || username,
      mode: sessionLabel,
      apiBaseUrl: API_BASE_URL,
      pageBaseUrl: PAGE_BASE_URL,
      accessTokenPresent: Boolean(session.accessToken),
    },
    selectedCard: selectedCard
      ? {
          id: selectedCard.id,
          name: selectedCard.name,
          stock: selectedCard.stock,
          price: selectedCard.price,
        }
      : null,
    checkout: {
      orderId: checkout?.order?.id || null,
      status: checkout?.order?.status || null,
      customerEmail: checkout?.order?.customer_email || null,
      pageLoaded: typeof checkoutPage?.raw === "string" || typeof checkoutPage === "string",
      initPoint: checkout?.init_point || null,
      paymentRedirectAvailable: checkout?.payment_redirect_available || false,
      expiresAt: checkout?.expires_at || null,
      totalArs: checkout?.total_ars || null,
    },
    paymentAttempt: paymentAttempt
      ? {
          attempted: true,
          orderId: paymentAttempt?.order?.id || null,
          orderStatus: paymentAttempt?.order?.status || null,
          paymentId: paymentAttempt?.payment?.id || null,
          paymentStatus: paymentAttempt?.payment?.status || null,
          paymentStatusDetail: paymentAttempt?.payment?.status_detail || null,
          webhookPending: Boolean(paymentAttempt?.webhook_pending),
        }
      : {
          attempted: Boolean(cardTokenId || paymentAttemptError),
          skipped: !PUBLIC_KEY,
          reason: PUBLIC_KEY ? null : "Missing MP_PUBLIC_KEY/VITE_MP_PUBLIC_KEY",
          cardTokenId,
        },
    paymentAttemptError,
    orderSnapshot: createdOrder
      ? {
          id: createdOrder.id,
          status: createdOrder.status,
          payment_status: createdOrder.payment_status,
          payment_status_detail: createdOrder.payment_status_detail || null,
          preference_id: createdOrder.preference_id,
          processing_payment: createdOrder.processing_payment,
          expires_at: createdOrder.expires_at,
        }
      : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    message: error.message,
    status: error.status || null,
    payload: error.payload || null,
  }, null, 2));
  process.exitCode = 1;
});