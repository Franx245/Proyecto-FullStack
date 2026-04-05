import "../backend/src/lib/load-env.js";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";

const API_BASE_URL = String(process.env.API_BASE_URL || "http://127.0.0.1:3001").trim().replace(/\/$/, "");
const APP_URL = String(process.env.APP_URL || "http://127.0.0.1:3000").trim().replace(/\/$/, "");
const ADMIN_URL = String(process.env.ADMIN_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");
const ADMIN_IDENTIFIER = String(process.env.ADMIN_IDENTIFIER || "admin@test.com").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "admin123").trim();

const prisma = new PrismaClient();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value != null));
}

function parseLeadingNumber(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function shallowEqualNumberArrays(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (Number(left[index]) !== Number(right[index])) {
      return false;
    }
  }

  return true;
}

async function waitFor(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await sleep(500);
  }

  throw new Error(`No responde ${url}`);
}

async function requestJson(baseUrl, path, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(buildUrl(baseUrl, path), {
    ...options,
    headers: normalizeHeaders({
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    }),
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const rawBody = await response.text();
  let body = null;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = rawBody;
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} on ${path}`);
    error.status = response.status;
    error.body = body;
    error.durationMs = durationMs;
    throw error;
  }

  return {
    status: response.status,
    body,
    durationMs,
  };
}

async function fetchHtml(path) {
  const startedAt = performance.now();
  const response = await fetch(buildUrl(APP_URL, path), {
    headers: { Accept: "text/html" },
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on HTML ${path}`);
  }

  return {
    durationMs,
    html,
  };
}

async function loginAdmin() {
  const response = await requestJson(API_BASE_URL, "/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
    }),
  });

  const accessToken = response.body?.accessToken;
  if (!accessToken) {
    throw new Error("No se recibió accessToken del login admin");
  }

  return {
    accessToken,
    durationMs: response.durationMs,
    admin: response.body?.admin || null,
  };
}

function adminHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function getScopeSettings(accessToken) {
  return requestJson(API_BASE_URL, "/api/admin/settings/catalog-scope", {
    headers: adminHeaders(accessToken),
  });
}

async function updateScope(accessToken, selectedCardIds) {
  return requestJson(API_BASE_URL, "/api/admin/settings/catalog-scope", {
    method: "PUT",
    headers: adminHeaders(accessToken),
    body: JSON.stringify({
      mode: "SELECTED",
      selected_card_ids: selectedCardIds,
    }),
  });
}

async function fetchDbState() {
  const [inStockVisibleCount, stockPositiveCount, firstInStockCard, outOfStockCandidates] = await Promise.all([
    prisma.card.count({ where: { stock: { gt: 0 }, isVisible: true } }),
    prisma.card.count({ where: { stock: { gt: 0 } } }),
    prisma.card.findFirst({
      where: { stock: { gt: 0 }, isVisible: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.card.findMany({
      where: { stock: { lte: 0 }, isVisible: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, name: true },
    }),
  ]);

  return {
    inStockVisibleCount,
    stockPositiveCount,
    firstInStockCard,
    outOfStockCandidates,
  };
}

async function pickSearchSamples(firstInStockName, outOfStockCandidates) {
  const inStockSearch = await requestJson(
    API_BASE_URL,
    `/api/catalog?q=${encodeURIComponent(firstInStockName)}&page=1&pageSize=24`
  );

  let outOfStockSample = null;
  let outOfStockSearch = null;

  for (const candidate of outOfStockCandidates) {
    const response = await requestJson(
      API_BASE_URL,
      `/api/catalog?q=${encodeURIComponent(candidate.name)}&page=1&pageSize=24`
    );

    if (Number(response.body?.total || 0) === 0) {
      outOfStockSample = candidate;
      outOfStockSearch = response;
      break;
    }
  }

  if (!outOfStockSample) {
    throw new Error("No encontré un nombre visible con stock 0 que devuelva 0 resultados en la búsqueda pública");
  }

  return {
    inStock: {
      name: firstInStockName,
      total: Number(inStockSearch.body?.total || 0),
      durationMs: inStockSearch.durationMs,
    },
    outOfStock: {
      name: outOfStockSample.name,
      total: Number(outOfStockSearch.body?.total || 0),
      durationMs: outOfStockSearch.durationMs,
    },
  };
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
    || normalizedUrl.includes('/api/admin/events/stream')
  );
}

function simplifyApiPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function responseMatchesCatalogQuery(response, search) {
  try {
    const parsed = new URL(response.url());
    return parsed.pathname === '/api/catalog'
      && parsed.searchParams.get('q') === search
      && response.status() === 200;
  } catch {
    return false;
  }
}

function attachPageObservers(page, stats) {
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    if (isIgnorableConsoleError(text)) {
      return;
    }

    stats.consoleErrors.push(text);
  });

  page.on("pageerror", (error) => {
    stats.pageErrors.push(String(error?.message || error));
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    if (isIgnorableRequestFailure(request.url(), failure)) {
      return;
    }

    stats.failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure,
    });
  });

  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(API_BASE_URL)) {
      return;
    }

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
}

async function readStorefrontSummary(page) {
  return page.evaluate(() => {
    const paragraphs = Array.from(document.querySelectorAll('[data-critical="singles-page"] p'));
    return paragraphs
      .map((node) => node.textContent?.trim() || "")
      .find((text) => /resultados/.test(text)) || null;
  });
}

async function readStorefrontTitles(page, limit = 5) {
  return page.locator('[data-critical="catalog-title"]').evaluateAll(
    (nodes, max) => nodes.slice(0, max).map((node) => node.textContent?.trim() || ""),
    limit
  );
}

async function applyStorefrontSearch(page, input, query, options = {}) {
  const { expectEmpty = false } = options;

  await input.fill(query);
  await page.waitForFunction(
    (expected) => new URL(window.location.href).searchParams.get('q') === expected,
    query,
    { timeout: 15000 }
  );

  if (expectEmpty) {
    await page.waitForSelector('text=No hay resultados para esta búsqueda', { timeout: 15000 });
  } else {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-critical="catalog-card"]').length > 0,
      { timeout: 15000 }
    );
  }

  await page.waitForTimeout(700);
}

async function clearStorefrontSearch(page, input) {
  await input.fill('');
  await page.waitForFunction(
    () => !new URL(window.location.href).searchParams.get('q'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(700);
}

async function runStorefrontValidation(browser, publicCatalog, searchSamples) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const stats = createRouteStats();
  attachPageObservers(page, stats);

  const inputSelector = 'input[aria-label="Buscar cartas por nombre, tipo o rareza"]';
  const loadStartedAt = Date.now();
  await page.goto(`${APP_URL}/singles`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  await page.waitForSelector('[data-critical="catalog-card"]', { timeout: 30000 });
  const initialLoadMs = Date.now() - loadStartedAt;

  const initialCardCount = await page.locator('[data-critical="catalog-card"]').count();
  const initialTitles = await readStorefrontTitles(page, 5);
  const initialSummary = await readStorefrontSummary(page);

  const searchInput = page.locator(inputSelector).first();

  const inStockStartedAt = Date.now();
  await applyStorefrontSearch(page, searchInput, searchSamples.inStock.name);
  const inStockSearchMs = Date.now() - inStockStartedAt;
  const inStockCardCount = await page.locator('[data-critical="catalog-card"]').count();
  const inStockSummary = await readStorefrontSummary(page);

  const outOfStockStartedAt = Date.now();
  await applyStorefrontSearch(page, searchInput, searchSamples.outOfStock.name, { expectEmpty: true });
  const outOfStockSearchMs = Date.now() - outOfStockStartedAt;
  const outOfStockCardCount = await page.locator('[data-critical="catalog-card"]').count();
  const outOfStockSummary = await readStorefrontSummary(page);

  return {
    context,
    page,
    stats,
    initialLoadMs,
    initialCardCount,
    initialTitles,
    initialSummary,
    inStockSearchMs,
    inStockCardCount,
    inStockSummary,
    outOfStockSearchMs,
    outOfStockCardCount,
    outOfStockSummary,
    expectedTitles: publicCatalog.body.cards.slice(0, 5).map((card) => card.name),
  };
}

async function runAdminUiValidation(browser, expectedInventoryTotal, expectedAllCatalogTotal) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const stats = createRouteStats();
  attachPageObservers(page, stats);

  const loadStartedAt = Date.now();
  await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('button:has-text("Ingresar")', { timeout: 15000 });
  await page.locator('input').nth(0).fill(ADMIN_IDENTIFIER);
  await page.locator('input').nth(1).fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/admin/login') && response.status() === 200, { timeout: 15000 }),
    page.getByRole('button', { name: /Ingresar/i }).click(),
  ]);
  await page.waitForSelector('text=Santuario Admin', { timeout: 15000 });
  const loginMs = Date.now() - loadStartedAt;

  const inventoryStartedAt = Date.now();
  const inventoryResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/admin/inventory') && response.status() === 200,
    { timeout: 15000 }
  ).catch(() => null);
  if (!(await page.getByRole('button', { name: /Inventario actual/i }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^Inventario$/i }).click();
  }
  await page.waitForSelector('button:has-text("Inventario actual")', { timeout: 15000 });
  await page.waitForSelector('text=Modo inventario actual', { timeout: 15000 });
  const inventoryResponse = await inventoryResponsePromise;
  const inventoryPayload = inventoryResponse ? await inventoryResponse.json().catch(() => null) : null;
  const inventoryLoadMs = Date.now() - inventoryStartedAt;

  const stockPillText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('span'))
      .map((node) => node.textContent?.trim() || '')
      .find((text) => /^\d+ resultados$/i.test(text)) || null;
  });

  const allStartedAt = Date.now();
  const allResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/admin/cards') && response.url().includes('mode=all') && response.status() === 200,
    { timeout: 15000 }
  ).catch(() => null);
  await page.getByRole('button', { name: /Todo el catálogo/i }).click();
  await page.waitForSelector('text=Buscá antes de cargar resultados', { timeout: 15000 });
  const allToggleMs = Date.now() - allStartedAt;
  const allResponse = await Promise.race([allResponsePromise, sleep(100).then(() => null)]);
  const allPayload = allResponse ? await allResponse.json().catch(() => null) : null;

  const allPillText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('span'))
      .map((node) => node.textContent?.trim() || '')
      .find((text) => /^\d+ resultados$/i.test(text)) || null;
  });

  return {
    stats,
    loginMs,
    inventoryLoadMs,
    allToggleMs,
    inventoryTotal: Number(inventoryPayload?.total || parseLeadingNumber(stockPillText) || 0),
    inventoryExpectedTotal: expectedInventoryTotal,
    inventoryResultsPill: stockPillText,
    allCatalogTotal: Number(allPayload?.total || parseLeadingNumber(allPillText) || 0),
    allCatalogExpectedTotal: expectedAllCatalogTotal,
    allResultsPill: allPillText,
    inventoryModeVisible: stockPillText === `${expectedInventoryTotal} resultados`,
    allModeVisible: await page.locator('text=Buscá antes de cargar resultados').isVisible().catch(() => false),
  };
}

async function runCacheConsistencyValidation(page, accessToken, fullSelectedIds, expectedFullTotal) {
  const input = page.locator('input[aria-label="Buscar cartas por nombre, tipo o rareza"]').first();
  const originalSummary = await readStorefrontSummary(page);
  const shrinkIds = fullSelectedIds.slice(0, 5);
  let restored = false;

  try {
    const shrinkUpdate = await updateScope(accessToken, shrinkIds);
    const shrinkPublic = await requestJson(API_BASE_URL, '/api/catalog?page=1&pageSize=24');
    const shrinkInventory = await requestJson(API_BASE_URL, '/api/admin/inventory?page=1&pageSize=24', {
      headers: adminHeaders(accessToken),
    });
    const shrinkSearchName = String(shrinkPublic.body?.cards?.[0]?.name || '').trim();

    if (!shrinkSearchName) {
      throw new Error('No pude obtener una carta visible para validar la recarga con scope reducido');
    }

    await applyStorefrontSearch(page, input, shrinkSearchName);
    await clearStorefrontSearch(page, input);

    const samePageSummaryAfterShrink = await readStorefrontSummary(page);
    const samePageCountAfterShrink = await page.locator('[data-critical="catalog-card"]').count();

    const reloadStartedAt = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-critical="catalog-card"]', { timeout: 15000 });
    const reloadToShrinkMs = Date.now() - reloadStartedAt;
    const reloadedShrinkSummary = await readStorefrontSummary(page);
    const reloadedShrinkCount = await page.locator('[data-critical="catalog-card"]').count();

    const restoreUpdate = await updateScope(accessToken, fullSelectedIds);
    restored = true;
    const restoredPublic = await requestJson(API_BASE_URL, '/api/catalog?page=1&pageSize=24');
    const restoredInventory = await requestJson(API_BASE_URL, '/api/admin/inventory?page=1&pageSize=24', {
      headers: adminHeaders(accessToken),
    });

    const reloadRestoreStartedAt = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-critical="catalog-card"]', { timeout: 15000 });
    const reloadToRestoreMs = Date.now() - reloadRestoreStartedAt;
    const restoredSummary = await readStorefrontSummary(page);

    return {
      originalSummary,
      shrink: {
        updateDurationMs: shrinkUpdate.durationMs,
        publicTotal: Number(shrinkPublic.body?.total || 0),
        inventoryTotal: Number(shrinkInventory.body?.total || 0),
        samePageSummaryAfterShrink,
        samePageCountAfterShrink,
        reloadedSummary: reloadedShrinkSummary,
        reloadedCount: reloadedShrinkCount,
        reloadMs: reloadToShrinkMs,
      },
      restore: {
        updateDurationMs: restoreUpdate.durationMs,
        publicTotal: Number(restoredPublic.body?.total || 0),
        inventoryTotal: Number(restoredInventory.body?.total || 0),
        reloadedSummary: restoredSummary,
        reloadMs: reloadToRestoreMs,
      },
      expectedFullTotal,
    };
  } finally {
    if (!restored) {
      await updateScope(accessToken, fullSelectedIds);
    }
  }
}

async function main() {
  await Promise.all([
    waitFor(`${API_BASE_URL}/api/health`),
    waitFor(`${APP_URL}/singles`),
    waitFor(ADMIN_URL),
  ]);

  const adminSession = await loginAdmin();
  const dbState = await fetchDbState();
  const scopeResponse = await getScopeSettings(adminSession.accessToken);
  const publicCatalog = await requestJson(API_BASE_URL, '/api/catalog?page=1&pageSize=24');
  const inventoryCatalog = await requestJson(API_BASE_URL, '/api/admin/inventory?page=1&pageSize=24', {
    headers: adminHeaders(adminSession.accessToken),
  });
  const adminAllCatalog = await requestJson(API_BASE_URL, '/api/admin/cards?page=1&pageSize=24&mode=all', {
    headers: adminHeaders(adminSession.accessToken),
  });
  const searchSamples = await pickSearchSamples(dbState.firstInStockCard.name, dbState.outOfStockCandidates);
  const singlesHtml = await fetchHtml('/singles');

  const browser = await chromium.launch({ headless: true });
  let storefrontValidation = null;

  try {
    storefrontValidation = await runStorefrontValidation(browser, publicCatalog, searchSamples);
    const cacheValidation = await runCacheConsistencyValidation(
      storefrontValidation.page,
      adminSession.accessToken,
      scopeResponse.body?.settings?.selected_card_ids || [],
      Number(publicCatalog.body?.total || 0)
    );
    const adminUiValidation = await runAdminUiValidation(
      browser,
      Number(inventoryCatalog.body?.total || 0),
      Number(adminAllCatalog.body?.total || 0)
    );

    const publicIds = publicCatalog.body.cards.map((card) => card.id);
    const inventoryIds = inventoryCatalog.body.cards.map((card) => card.id);
    const ssrCardCount = (singlesHtml.html.match(/data-critical="catalog-card"/g) || []).length;

    const summary = {
      environment: {
        apiBaseUrl: API_BASE_URL,
        appUrl: APP_URL,
        adminUrl: ADMIN_URL,
        admin: adminSession.admin?.email || null,
      },
      population: {
        query: 'SELECT id FROM "Card" WHERE stock > 0 ORDER BY name ASC, id ASC',
        dbStockPositiveCount: dbState.stockPositiveCount,
        dbVisibleStockPositiveCount: dbState.inStockVisibleCount,
        scopeMode: scopeResponse.body?.settings?.mode || null,
        scopeSelectedCount: Number(scopeResponse.body?.settings?.selected_count || 0),
        scopeAppliedCardCount: Number(scopeResponse.body?.settings?.applied_card_count || 0),
      },
      api: {
        publicCatalogTotal: Number(publicCatalog.body?.total || 0),
        publicCatalogPageCount: Array.isArray(publicCatalog.body?.cards) ? publicCatalog.body.cards.length : 0,
        publicCatalogDurationMs: publicCatalog.durationMs,
        adminInventoryTotal: Number(inventoryCatalog.body?.total || 0),
        adminInventoryPageCount: Array.isArray(inventoryCatalog.body?.cards) ? inventoryCatalog.body.cards.length : 0,
        adminInventoryDurationMs: inventoryCatalog.durationMs,
        adminAllCatalogTotal: Number(adminAllCatalog.body?.total || 0),
        adminAllCatalogPageCount: Array.isArray(adminAllCatalog.body?.cards) ? adminAllCatalog.body.cards.length : 0,
        adminAllCatalogDurationMs: adminAllCatalog.durationMs,
        firstPageIdsMatch: shallowEqualNumberArrays(publicIds, inventoryIds),
      },
      storefront: {
        ssrHtmlDurationMs: singlesHtml.durationMs,
        ssrCardCount,
        clientInitialLoadMs: storefrontValidation.initialLoadMs,
        clientInitialCardCount: storefrontValidation.initialCardCount,
        initialSummary: storefrontValidation.initialSummary,
        initialTitles: storefrontValidation.initialTitles,
        expectedTitles: storefrontValidation.expectedTitles,
        inStockSearch: {
          name: searchSamples.inStock.name,
          apiTotal: searchSamples.inStock.total,
          apiDurationMs: searchSamples.inStock.durationMs,
          clientDurationMs: storefrontValidation.inStockSearchMs,
          clientCardCount: storefrontValidation.inStockCardCount,
          clientSummary: storefrontValidation.inStockSummary,
        },
        outOfStockSearch: {
          name: searchSamples.outOfStock.name,
          apiTotal: searchSamples.outOfStock.total,
          apiDurationMs: searchSamples.outOfStock.durationMs,
          clientDurationMs: storefrontValidation.outOfStockSearchMs,
          clientCardCount: storefrontValidation.outOfStockCardCount,
          clientSummary: storefrontValidation.outOfStockSummary,
        },
        consoleErrors: storefrontValidation.stats.consoleErrors,
        pageErrors: storefrontValidation.stats.pageErrors,
        failedRequests: storefrontValidation.stats.failedRequests,
      },
      adminUi: adminUiValidation,
      cache: cacheValidation,
      expectations: {
        populationMatchesDb: Number(scopeResponse.body?.settings?.selected_count || 0) === dbState.stockPositiveCount,
        publicMatchesInventory: Number(publicCatalog.body?.total || 0) === Number(inventoryCatalog.body?.total || 0),
        publicMatchesVisibleDb: Number(publicCatalog.body?.total || 0) === dbState.inStockVisibleCount,
        inventoryMatchesScope: Number(inventoryCatalog.body?.total || 0) === Number(scopeResponse.body?.settings?.selected_count || 0),
        ssrMatchesClientPageCount: ssrCardCount === storefrontValidation.initialCardCount,
        clientTitlesMatchApi: shallowEqualNumberArrays(
          storefrontValidation.initialTitles.map((_, index) => index),
          storefrontValidation.expectedTitles.map((_, index) => index)
        ) && storefrontValidation.initialTitles.join('|') === storefrontValidation.expectedTitles.join('|'),
        inStockSearchWorks: searchSamples.inStock.total > 0 && storefrontValidation.inStockCardCount > 0,
        outOfStockSearchWorks: searchSamples.outOfStock.total === 0 && storefrontValidation.outOfStockCardCount === 0,
        adminUiInventoryLoaded: adminUiValidation.inventoryModeVisible,
        adminUiAllLoaded: adminUiValidation.allModeVisible,
        cacheShrinkApiSync: cacheValidation.shrink.publicTotal === 5 && cacheValidation.shrink.inventoryTotal === 5,
        cacheShrinkSamePageSync: parseLeadingNumber(cacheValidation.shrink.samePageSummaryAfterShrink) === 5,
        cacheShrinkReloadSync: parseLeadingNumber(cacheValidation.shrink.reloadedSummary) === 5,
        cacheRestoreSync: parseLeadingNumber(cacheValidation.restore.reloadedSummary) === Number(publicCatalog.body?.total || 0),
      },
    };

    const failures = [];

    if (!summary.expectations.populationMatchesDb) failures.push('scope_selected_count != stock_positive_count_db');
    if (!summary.expectations.publicMatchesInventory) failures.push('public_total != admin_inventory_total');
    if (!summary.expectations.publicMatchesVisibleDb) failures.push('public_total != db_visible_stock_positive_count');
    if (!summary.expectations.inventoryMatchesScope) failures.push('admin_inventory_total != scope_selected_count');
    if (!summary.expectations.ssrMatchesClientPageCount) failures.push('ssr_card_count != client_card_count');
    if (!summary.expectations.clientTitlesMatchApi) failures.push('storefront_titles != public_api_titles');
    if (!summary.expectations.inStockSearchWorks) failures.push('in_stock_search_failed');
    if (!summary.expectations.outOfStockSearchWorks) failures.push('out_of_stock_search_failed');
    if (!summary.expectations.adminUiInventoryLoaded) failures.push('admin_ui_inventory_not_loaded');
    if (!summary.expectations.adminUiAllLoaded) failures.push('admin_ui_all_not_loaded');
    if (!summary.expectations.cacheShrinkApiSync) failures.push('cache_shrink_api_not_synced');
    if (!summary.expectations.cacheShrinkSamePageSync) failures.push('cache_shrink_same_page_stale');
    if (!summary.expectations.cacheShrinkReloadSync) failures.push('cache_shrink_reload_stale');
    if (!summary.expectations.cacheRestoreSync) failures.push('cache_restore_stale');
    if (storefrontValidation.stats.consoleErrors.length) failures.push('storefront_console_errors');
    if (storefrontValidation.stats.pageErrors.length) failures.push('storefront_page_errors');
    if (storefrontValidation.stats.failedRequests.length) failures.push('storefront_failed_requests');
    if (adminUiValidation.stats.consoleErrors.length) failures.push('admin_console_errors');
    if (adminUiValidation.stats.pageErrors.length) failures.push('admin_page_errors');
    if (adminUiValidation.stats.failedRequests.length) failures.push('admin_failed_requests');

    summary.verdict = failures.length === 0 ? 'PASS' : 'FAIL';
    summary.failures = failures;

    console.log(JSON.stringify(summary, null, 2));

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (storefrontValidation?.context) {
      await storefrontValidation.context.close().catch(() => undefined);
    }

    await browser.close().catch(() => undefined);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}