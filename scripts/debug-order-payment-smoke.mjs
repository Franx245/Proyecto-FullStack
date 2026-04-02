import "../backend/src/lib/load-env.js";
import { chromium } from "@playwright/test";

const STOREFRONT_URL = String(
  process.env.PRODUCTION_STOREFRONT_URL
  || process.env.FRONTEND_URL
  || "https://duelvault-store-api.vercel.app"
).replace(/\/$/, "");

const API_URL = String(
  process.env.PRODUCTION_API_URL
  || process.env.BACKEND_URL
  || "https://proyecto-fullstack-production-8fe1.up.railway.app"
).replace(/\/$/, "");

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${path} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  const suffix = randomSuffix();
  const email = `debug_${suffix}@testuser.com`;
  const username = `debug_${suffix}`;
  const password = "Smoke1234";

  const register = await requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      confirm_password: password,
      full_name: "Debug User",
      phone: "5491100000000",
    }),
  });

  const cardsPayload = await requestJson("/api/cards?page=1&pageSize=20");
  const card = Array.isArray(cardsPayload?.cards)
    ? cardsPayload.cards.find((entry) => Number(entry?.stock || 0) > 0 && Number(entry?.price || 0) > 0)
    : null;

  if (!card) {
    throw new Error("No card available");
  }

  const addressPayload = await requestJson("/api/auth/addresses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${register.accessToken}`,
    },
    body: JSON.stringify({
      label: "Debug Address",
      recipient_name: "Debug User",
      line1: "Av. Rivadavia 1000",
      city: "CABA",
      state: "Ciudad Autónoma de Buenos Aires",
      postal_code: "1405",
      zone: "caba",
      phone: "5491100000000",
      is_default: true,
    }),
  });

  const ratesPayload = await requestJson("/api/shipping/rates", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${register.accessToken}`,
    },
    body: JSON.stringify({
      postal_code: "1405",
      city: "CABA",
      state: "Ciudad Autónoma de Buenos Aires",
      item_count: 1,
      weight: 0.6,
    }),
  });

  const selectedRate = Array.isArray(ratesPayload?.rates)
    ? ratesPayload.rates.find((entry) => Number(entry?.price || 0) > 0 && String(entry?.carrier || "").trim())
    : null;

  if (!selectedRate) {
    throw new Error("No shipping rate available");
  }

  const checkout = await requestJson("/api/checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${register.accessToken}`,
      "X-Idempotency-Key": `debug-order-payment-${suffix}`,
    },
    body: JSON.stringify({
      items: [{ cardId: Number(card.id), quantity: 1 }],
      customer_name: "Debug User",
      customer_email: email,
      phone: "5491100000000",
      accepted: true,
      shipping_zone: "caba",
      shipping_carrier: selectedRate.carrier,
      addressId: Number(addressPayload?.address?.id),
      mutation_id: `debug-order-payment-${suffix}`,
    }),
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addInitScript(({ session }) => {
    window.localStorage.setItem("duelvault_user_session", JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    }));
  }, { session: register });

  const page = await context.newPage();

  page.on("console", (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/orders") || url.includes("/api/auth/me")) {
      console.log(`[request] ${request.method()} ${url}`);
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/orders") || url.includes("/api/auth/me")) {
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "";
      }
      console.log(`[response] ${response.status()} ${url} ${body.slice(0, 500)}`);
    }
  });

  console.log(JSON.stringify({
    orderId: checkout?.order?.id,
    storefrontUrl: STOREFRONT_URL,
    apiUrl: API_URL,
  }, null, 2));

  await page.goto(`${STOREFRONT_URL}/checkout/pay/${checkout.order.id}?ts=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForTimeout(15000);

  const bodyText = await page.locator("body").textContent();
  console.log(`[body] ${String(bodyText || "").replace(/\s+/g, " ").slice(0, 1500)}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});