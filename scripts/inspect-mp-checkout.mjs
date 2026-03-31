import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const CHECKOUT_URL = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=3280065165-c95a826b-942e-43f8-b023-9aa73fe846ae";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  await page.goto(CHECKOUT_URL, { waitUntil: "networkidle", timeout: 120000 });

  const outDir = path.resolve("artifacts", "mp-checkout");
  await fs.mkdir(outDir, { recursive: true });

  await page.screenshot({ path: path.join(outDir, "checkout.png"), fullPage: true });
  await fs.writeFile(path.join(outDir, "checkout.html"), await page.content(), "utf8");

  console.log(JSON.stringify({
    url: page.url(),
    title: await page.title(),
    outDir,
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});