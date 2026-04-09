import { chromium } from "@playwright/test";

const FORCED_APP_URL = String(process.env.QA_NEXT_APP_URL || process.env.APP_URL || "").trim();
const FORCED_API_URL = String(process.env.QA_NEXT_API_URL || process.env.API_URL || "").trim();
const APP_PORT_CANDIDATES = [3000, 3002, 3003, 5173];
const API_PORT_CANDIDATES = [3001, 3002, 3003];
const CHECKOUT_SMOKE_ORDER_ID = 1;
const TEST_USER = {
  identifier: "user@test.com",
  password: "user123",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findHealthyUrl(candidates, path, matcher) {
  for (const port of candidates) {
    const baseUrl = `http://127.0.0.1:${port}`;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}${path}`);
        if (!response.ok) {
          await sleep(250);
          continue;
        }

        const body = await response.text();
        if (!matcher || matcher(body)) {
          return baseUrl;
        }
      } catch {}

      await sleep(250);
    }
  }

  throw new Error(`No hay servicio sano para ${path}`);
}
async function clearClientStorage(page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function gotoAndWait(page, url, expectedText = null) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (expectedText) {
    await waitForBodyText(page, expectedText);
  }
}

async function waitForInteractiveAuthForm(page, submitButtonName) {
  const submitButton = page.getByRole("button", { name: submitButtonName }).first();
  await submitButton.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);
  return page.locator("form").filter({ has: submitButton }).first();
}

async function loginFromAuth(page, appUrl, redirectPath) {
  await gotoAndWait(page, `${appUrl}/auth?redirect=${encodeURIComponent(redirectPath)}`, "Entrar a mi cuenta");
  await clearClientStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBodyText(page, "Entrar a mi cuenta");

  const loginForm = await waitForInteractiveAuthForm(page, /Entrar a mi cuenta/i);
  await loginForm.locator("input").nth(0).fill(TEST_USER.identifier);
  await loginForm.locator('input[type="password"]').first().fill(TEST_USER.password);
  await loginForm.getByRole("button", { name: /Entrar a mi cuenta/i }).click();
}

async function waitForBodyText(page, text) {
  await page.waitForFunction(
    (expectedText) => document.body?.innerText?.includes(expectedText),
    text,
    { timeout: 15000 }
  );
}

async function main() {
  const API_URL = FORCED_API_URL || await findHealthyUrl(API_PORT_CANDIDATES, "/api/health", (body) => body.includes("ok") || body.includes("healthy"));
  const APP_URL = FORCED_APP_URL || await findHealthyUrl(
    APP_PORT_CANDIDATES,
    "/auth",
    (body) => body.includes("RareHunter") && body.includes("/_next/static/")
  );

  const browser = await chromium.launch({ headless: true });

  const smoke = {
    appUrl: APP_URL,
    apiUrl: API_URL,
    smokeOrderId: CHECKOUT_SMOKE_ORDER_ID,
    routes: {},
    auth: {},
  };

  try {
    const routeContext = await browser.newContext();
    const routePage = await routeContext.newPage();

    const routeChecks = [
      { path: "/contact", text: "Contacto" },
      { path: "/privacy", text: "Política de Privacidad" },
      { path: "/terms", text: "Términos y Condiciones" },
      { path: "/checkout/success?orderId=123", text: "Pago enviado a validación" },
      { path: "/checkout/pending?orderId=123", text: "Pago en procesamiento" },
      { path: "/checkout/failure?orderId=123", text: "Pago no aprobado" },
    ];

    for (const check of routeChecks) {
      await gotoAndWait(routePage, `${APP_URL}${check.path}`, check.text);
      smoke.routes[check.path] = await routePage.locator(`text=${check.text}`).first().isVisible().catch(() => false);
    }

    await gotoAndWait(routePage, `${APP_URL}/orders`, "Iniciá sesión para ver tu historial completo.");
    const anonymousOrdersBody = await routePage.locator("body").innerText();
    smoke.routes.ordersKeepsAnonymousRoute = /\/orders$/.test(routePage.url());
    smoke.routes.ordersAnonymousMessageVisible = anonymousOrdersBody.includes("Iniciá sesión para ver tu historial completo.");

    await clearClientStorage(routePage);
    await gotoAndWait(routePage, `${APP_URL}/checkout/pay/${CHECKOUT_SMOKE_ORDER_ID}`, "Entrar a mi cuenta");
    await routePage.waitForURL(new RegExp(`/auth\\?redirect=(%2F|\\/)checkout(%2F|\\/)pay(%2F|\\/)${CHECKOUT_SMOKE_ORDER_ID}$`), { timeout: 15000 });
    smoke.routes.checkoutPayRedirectsToAuth = routePage.url().includes(`/auth?redirect=%2Fcheckout%2Fpay%2F${CHECKOUT_SMOKE_ORDER_ID}`);
    smoke.routes.checkoutPayAuthPromptVisible = (await routePage.locator("body").innerText()).includes("Entrar a mi cuenta");

    await clearClientStorage(routePage);
    await gotoAndWait(routePage, `${APP_URL}/checkout/pay/abc`, "ID de orden inválido.");
    const invalidCheckoutBody = await routePage.locator("body").innerText();
    smoke.routes.checkoutPayInvalidKeepsRoute = /\/checkout\/pay\/abc$/.test(routePage.url());
    smoke.routes.checkoutPayInvalidShowsInvalidId = invalidCheckoutBody.includes("ID de orden inválido.");

    await routeContext.close();

    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginFromAuth(loginPage, APP_URL, "/orders");
    await loginPage.waitForURL(`${APP_URL}/orders`, { timeout: 15000 });
    await waitForBodyText(loginPage, "Historial de Pedidos");
    const ordersBody = await loginPage.locator("body").innerText();
    const headerBody = await loginPage.locator("header").innerText();
    smoke.auth.loginRedirectsToOrders = /\/orders$/.test(loginPage.url());
    smoke.auth.ordersHeadingVisible = ordersBody.includes("Historial de Pedidos");
    smoke.auth.headerShowsLoggedUser = headerBody.includes("Marcos Duelista") || headerBody.includes("duelist");
    await gotoAndWait(loginPage, `${APP_URL}/checkout/pay/${CHECKOUT_SMOKE_ORDER_ID}`, "Resumen de la orden");
    await waitForBodyText(loginPage, "Resumen de la orden");
    smoke.auth.loginRedirectsToCheckoutPay = new RegExp(`/checkout/pay/${CHECKOUT_SMOKE_ORDER_ID}$`).test(loginPage.url());
    smoke.auth.checkoutPayHeadingVisible = (await loginPage.locator("body").innerText()).includes("Resumen de la orden");
    await loginContext.close();

    const registerContext = await browser.newContext();
    const registerPage = await registerContext.newPage();
    const uniqueSuffix = `${Date.now()}`;
    const email = `next-user-${uniqueSuffix}@test.com`;
    const username = `nextuser${uniqueSuffix.slice(-6)}`;

    await gotoAndWait(registerPage, `${APP_URL}/auth?mode=register&redirect=/orders`, "Crear cuenta");
    await clearClientStorage(registerPage);
    await registerPage.reload({ waitUntil: "domcontentloaded" });
    await waitForBodyText(registerPage, "Crear cuenta");
    const registerForm = await waitForInteractiveAuthForm(registerPage, /^Crear cuenta$/i);
    await registerForm.locator("input").nth(0).fill("Usuario Next QA");
    await registerForm.locator("input").nth(1).fill(username);
    await registerForm.locator("input").nth(2).fill(email);
    await registerForm.locator("input").nth(3).fill("5491122334455");
    await registerForm.locator('input[type="password"]').nth(0).fill("next123");
    await registerForm.locator('input[type="password"]').nth(1).fill("next123");
    await registerForm.getByRole("button", { name: /^Crear cuenta$/i }).click();
    await registerPage.waitForURL(`${APP_URL}/orders`, { timeout: 15000 });
    await waitForBodyText(registerPage, "Historial de Pedidos");
    const registerHeaderBody = await registerPage.locator("header").innerText();
    smoke.auth.registerRedirectsToOrders = /\/orders$/.test(registerPage.url());
    smoke.auth.registeredOrdersHeadingVisible = (await registerPage.locator("body").innerText()).includes("Historial de Pedidos");
    smoke.auth.registeredHeaderShowsUser = registerHeaderBody.includes("Usuario Next QA");
    smoke.auth.registeredEmail = email;
    await registerContext.close();

    console.log(JSON.stringify(smoke, null, 2));
  } finally {
    await browser.close();
  }
}

await main();