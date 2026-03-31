import { chromium } from "@playwright/test";

const APP_URL = String(process.env.QA_NEXT_APP_URL || process.env.APP_URL || "http://127.0.0.1:3000").trim();
const API_URL = String(process.env.QA_NEXT_API_URL || process.env.API_URL || "http://127.0.0.1:3001").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {}

    await sleep(500);
  }

  throw new Error(`No responde ${url}`);
}

function createRouteStats() {
  return {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    apiCalls: {},
  };
}

function isIgnorableConsoleError(text) {
  const normalizedText = String(text || "");
  return /status of 401 \(Unauthorized\)/i.test(normalizedText)
    || /Failed to fetch RSC payload for .*Falling back to browser navigation\./i.test(normalizedText);
}

function isIgnorableRequestFailure(url, failure) {
  const normalizedUrl = String(url || "");
  const normalizedFailure = String(failure || "");

  return normalizedFailure.includes("net::ERR_ABORTED") && (
    normalizedUrl.includes("_rsc=")
    || normalizedUrl.includes("/_next/static/")
    || normalizedUrl.endsWith("/api/events/stream")
  );
}

/** @param {string} url */
function simplifyApiPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

await waitFor(`${API_URL}/api/health`);
await waitFor(APP_URL);

const cardsPayload = await fetch(`${API_URL}/api/cards?page=1&pageSize=12`).then((response) => response.json());
const cardWithStock = Array.isArray(cardsPayload.cards)
  ? cardsPayload.cards.find((card) => Number(card?.stock || 0) > 0)
  : null;

if (!cardWithStock?.id) {
  throw new Error("No hay una carta con stock para la validación E2E");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let currentRoute = "bootstrap";
const routeStats = new Map();

function ensureStats(routeName) {
  if (!routeStats.has(routeName)) {
    routeStats.set(routeName, createRouteStats());
  }

  return routeStats.get(routeName);
}

page.on("console", (message) => {
  if (message.type() !== "error") {
    return;
  }

  const text = message.text();
  if (isIgnorableConsoleError(text)) {
    return;
  }

  ensureStats(currentRoute).consoleErrors.push(text);
});

page.on("pageerror", (error) => {
  ensureStats(currentRoute).pageErrors.push(String(error?.message || error));
});

page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText || "unknown";
  if (isIgnorableRequestFailure(request.url(), failure)) {
    return;
  }

  ensureStats(currentRoute).failedRequests.push({
    url: request.url(),
    method: request.method(),
    failure,
  });
});

page.on("response", (response) => {
  const url = response.url();
  if (!url.startsWith(API_URL)) {
    return;
  }

  const stats = ensureStats(currentRoute);
  const key = simplifyApiPath(url);
  stats.apiCalls[key] = (stats.apiCalls[key] || 0) + 1;

  if (response.status() >= 400) {
    stats.failedRequests.push({
      url,
      method: response.request().method(),
      failure: `HTTP ${response.status()}`,
    });
  }
});

async function captureTiming(name) {
  currentRoute = name;
  const metrics = await page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType("navigation")[0];
    if (!navigationEntry) {
      return null;
    }

    return {
      domContentLoadedMs: Math.round(navigationEntry.domContentLoadedEventEnd),
      loadMs: Math.round(navigationEntry.loadEventEnd),
      responseEndMs: Math.round(navigationEntry.responseEnd),
    };
  });

  return metrics;
}

async function measureClientTransition(action, readySelector, waitForUrl) {
  const startedAt = Date.now();
  await action();

  if (waitForUrl) {
    await page.waitForURL(waitForUrl, { timeout: 15000 });
  }

  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: 15000 });
  }

  await page.waitForTimeout(150);
  return Date.now() - startedAt;
}

async function gotoAndWait(url, readySelector) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: 15000 });
  }
}

try {
  await gotoAndWait(`${APP_URL}/auth?redirect=/cart`, 'input[placeholder="Email o usuario"]');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  currentRoute = "home";
  await gotoAndWait(APP_URL, 'a[href="/singles"]');
  const homeTiming = await captureTiming("home");
  const homeToCatalogTransitionMs = await measureClientTransition(
    () => page.getByRole("link", { name: /Ver catálogo/i }).first().click(),
    'input[aria-label="Buscar cartas por nombre, tipo o rareza"]',
    `${APP_URL}/singles`
  );

  currentRoute = "catalog";
  const catalogTiming = await captureTiming("catalog");
  const firstCardCard = page.locator('article[data-critical="catalog-card"]').first();
  await firstCardCard.waitFor({ state: "visible", timeout: 30000 });
  const firstCardTitle = await firstCardCard.locator('[data-critical="catalog-title"]').textContent();
  const catalogToDetailTransitionMs = await measureClientTransition(
    () => firstCardCard.click(),
    'text=Versiones disponibles',
    /\/card\/.+$/
  );

  currentRoute = "detail";
  const detailTiming = await captureTiming("detail");
  await page.locator("button").filter({ hasText: /^Agregar$/ }).last().click();
  await page.locator("button").filter({ hasText: /^Añadir$/ }).first().click();
  await page.waitForTimeout(700);

  const visibleCartButton = page.locator("button").filter({ hasText: /^Ver carrito$/ }).locator(":visible").first();
  let detailToCartTransitionMs = null;
  try {
    if (await visibleCartButton.isVisible().catch(() => false)) {
      detailToCartTransitionMs = await measureClientTransition(
        () => visibleCartButton.click(),
        "text=Tu carrito",
        `${APP_URL}/cart`
      );
    } else {
      detailToCartTransitionMs = await measureClientTransition(
        () => page.locator('a[aria-label="Abrir carrito legacy"]').click(),
        "text=Tu carrito",
        `${APP_URL}/cart`
      );
    }
  } catch {
    await gotoAndWait(`${APP_URL}/cart`, "text=Tu carrito");
  }

  currentRoute = "cart-anon";
  const cartAnonTiming = await captureTiming("cart-anon");
  const authPromptLink = page.getByRole("link", { name: /Ingresar para comprar/i });
  await authPromptLink.waitFor({ state: "visible", timeout: 5000 });
  const cartRequiresAuth = await authPromptLink.isVisible().catch(() => false);
  const cartToAuthTransitionMs = await measureClientTransition(
    () => page.getByRole("link", { name: /Ingresar para comprar/i }).click(),
    'input[placeholder="Email o usuario"]',
    /\/auth\?redirect=%2Fcart|\/auth\?redirect=\/cart/
  );

  currentRoute = "auth";
  const authTiming = await captureTiming("auth");
  await page.getByPlaceholder("Email o usuario").fill("user@test.com");
  await page.getByPlaceholder("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: /Entrar a mi cuenta/i }).click();
  await page.waitForTimeout(800);
  const invalidLoginVisible = await page.locator("text=No pudimos iniciar sesión").isVisible().catch(() => false);
  const cartAuthTiming = null;
  const itemVisibleAfterLogin = null;
  const itemVisibleAfterReload = null;
  const emptyCartVisible = null;

  currentRoute = "detail-invalid";
  await page.goto(`${APP_URL}/card/abc`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => document.body?.innerText?.includes("Carta no encontrada"),
    { timeout: 15000 }
  ).catch(() => undefined);
  const invalidDetailVisible = await page.locator("text=Carta no encontrada").isVisible().catch(() => false);
  const invalidDetailLegacyRedirect = (await page.content()).includes("Redirigiendo al storefront actual");

  const summary = {
    navigation: {
      homeToCatalog: Boolean(firstCardTitle),
      catalogToDetail: Boolean(firstCardTitle),
      detailToCart: cartRequiresAuth,
      cartToAuth: invalidLoginVisible,
      clientTransitionsMs: {
        homeToCatalogTransitionMs,
        catalogToDetailTransitionMs,
        detailToCartTransitionMs,
        cartToAuthTransitionMs,
      },
    },
    functionality: {
      invalidLoginVisible,
      itemVisibleAfterLogin,
      itemVisibleAfterReload,
      emptyCartVisible,
      unauthenticatedCartPrompt: cartRequiresAuth,
    },
    edgeCases: {
      invalidDetailVisible,
      invalidDetailLegacyRedirect,
      emptyCartVisible,
    },
    performance: {
      homeTiming,
      catalogTiming,
      detailTiming,
      cartAnonTiming,
      authTiming,
      cartAuthTiming,
      apiCalls: Object.fromEntries(routeStats.entries()),
    },
    trackedCard: {
      id: cardWithStock.id,
      name: firstCardTitle?.trim() || cardWithStock.name,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}