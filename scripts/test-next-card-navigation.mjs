import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];

page.on("console", (message) => {
  consoleMessages.push(`${message.type()}: ${message.text()}`);
});

page.on("pageerror", (error) => {
  pageErrors.push(String(error?.message || error));
});

try {
  await page.goto("http://127.0.0.1:3000/singles", { waitUntil: "networkidle" });
  await page.waitForSelector('a[href^="/card/"]', { timeout: 15000 });

  const firstLink = page.locator('a[href^="/card/"]').first();
  const href = await firstLink.getAttribute("href");
  const cardTitle = await firstLink.textContent();

  await firstLink.click();
  await page.waitForURL(/\/card\/\d+$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  const heading = page.locator("h1").first();
  const headingText = await heading.textContent();
  const content = await page.content();

  console.log(JSON.stringify({
    clickedHref: href,
    cardTitle: cardTitle?.trim() ?? null,
    finalUrl: page.url(),
    heading: headingText?.trim() ?? null,
    legacyRedirectPresent: content.includes("Redirigiendo al storefront actual"),
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    error: String(error?.message || error),
    finalUrl: page.url(),
    pageErrors,
    consoleMessages,
    contentSnippet: (await page.content()).slice(0, 1500),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}