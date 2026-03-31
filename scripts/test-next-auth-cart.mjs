import { chromium } from "@playwright/test";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falló ${url} con status ${response.status}`);
  }
  return response.json();
}

const catalogPayload = await fetchJson("http://127.0.0.1:3001/api/cards?page=1&pageSize=12");
const cardWithStock = Array.isArray(catalogPayload.cards)
  ? catalogPayload.cards.find((card) => Number(card?.stock || 0) > 0)
  : null;
const cardId = cardWithStock?.id;

if (!cardId) {
  throw new Error("No se obtuvo una carta con stock para probar auth/cart");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto("http://127.0.0.1:3000/auth?redirect=/cart", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });

  await page.getByPlaceholder("Email o usuario").fill("user@test.com");
  await page.getByPlaceholder("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: "Entrar a mi cuenta" }).click();
  await page.waitForTimeout(800);
  const invalidLoginVisible = await page.locator("text=No pudimos iniciar sesión").isVisible().catch(() => false);

  await page.getByPlaceholder("Email o usuario").fill("user@test.com");
  await page.getByPlaceholder("Contraseña").fill("user123");
  await page.getByRole("button", { name: "Entrar a mi cuenta" }).click();
  await page.waitForURL("http://127.0.0.1:3000/cart", { timeout: 15000 });

  await page.goto(`http://127.0.0.1:3000/card/${cardId}`, { waitUntil: "networkidle" });
  const detailButtonsBeforeAdd = await page.getByRole("button").allTextContents();
  await page.locator("button").filter({ hasText: /^Agregar$/ }).last().click();
  const detailButtonsAfterActivate = await page.getByRole("button").allTextContents();
  await page.locator("button").filter({ hasText: /^Añadir$/ }).first().click();
  await page.waitForTimeout(800);

  await page.goto("http://127.0.0.1:3000/cart", { waitUntil: "networkidle" });
  const cartContent = await page.content();
  const itemPresentBeforeReload = cartContent.includes(cardWithStock.name);

  await page.reload({ waitUntil: "networkidle" });
  const cartContentAfterReload = await page.content();
  const itemPresentAfterReload = cartContentAfterReload.includes(cardWithStock.name);

  await page.locator("button").filter({ has: page.locator("svg.lucide-trash2") }).first().click();
  await page.waitForTimeout(500);
  const emptyCartVisible = await page.locator("text=Tu carrito está vacío.").isVisible().catch(() => false);

  console.log(JSON.stringify({
    cardId,
    cardName: cardWithStock.name,
    detailButtonsBeforeAdd,
    detailButtonsAfterActivate,
    invalidLoginVisible,
    loginRedirectedToCart: page.url() === "http://127.0.0.1:3000/cart",
    itemPresentBeforeReload,
    itemPresentAfterReload,
    emptyCartVisible,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    error: String(error?.message || error),
    currentUrl: page.url(),
    buttons: await page.getByRole("button").allTextContents().catch(() => []),
    contentSnippet: (await page.content()).slice(0, 3000),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}