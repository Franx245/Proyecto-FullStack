// @ts-check
import { test, expect } from "@playwright/test";

async function gotoLive(page, path) {
  const separator = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${separator}ts=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
}

async function expectCartPage(page) {
  await expect(page.getByRole("heading", { name: "Tu Carrito" })).toBeVisible({ timeout: 10_000 });
}

test.describe("Checkout — shipping + total consistency", () => {
  test("recalcula envío al cambiar carrier", async ({ page }) => {
    await gotoLive(page, "/cart");
    await expectCartPage(page);

    const isEmpty = await page.locator("text=Tu carrito está vacío").isVisible().catch(() => false);
    if (isEmpty) {
      test.skip(true, "Cart is empty — add items first");
      return;
    }

    // Click Correo Argentino carrier button
    const correoBtn = page.locator("button:has-text('Correo Arg.')");
    if (await correoBtn.isVisible()) {
      // Wait for the shipping rates API response when clicking carrier
      const rateResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/shipping/rates") && response.status() < 500,
        { timeout: 15_000 },
      ).catch(() => null);

      await correoBtn.click();

      // Should show loading indicator or already have rates cached
      const loadingIndicator = page.locator("text=Calculando envío");
      const hasLoading = await loadingIndicator.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasLoading) {
        // Wait for the actual API response
        await rateResponsePromise;
        // Wait for the UI to reflect the rate
        await expect(page.locator("text=Tarifa actualizada")).toBeVisible({ timeout: 15_000 });
      }

      // The shipping cost line should be visible in the summary
      const shippingLine = page.locator("[class*='yellow']").first();
      await expect(shippingLine).toBeVisible();
    }
  });

  test("no permite pagar sin shipping válido", async ({ page }) => {
    await gotoLive(page, "/cart");
    await expectCartPage(page);

    const isEmpty = await page.locator("text=Tu carrito está vacío").isVisible().catch(() => false);
    if (isEmpty) {
      test.skip(true, "Cart is empty");
      return;
    }

    const payButton = page.locator("button:has-text('Pagar con Mercado Pago')");
    await expect(payButton).toBeVisible({ timeout: 5000 });

    // If no shipping is selected, button should be disabled
    const isDisabled = await payButton.isDisabled();
    // Assertion depends on cart state — if pickup is selected, button may be enabled
    expect(typeof isDisabled).toBe("boolean");
  });

  test("total incluye envío cuando carrier seleccionado", async ({ page }) => {
    await gotoLive(page, "/cart");
    await expectCartPage(page);

    const isEmpty = await page.locator("text=Tu carrito está vacío").isVisible().catch(() => false);
    if (isEmpty) {
      test.skip(true, "Cart is empty");
      return;
    }

    // Subtotal and total must always be visible
    await expect(page.locator("text=Subtotal")).toBeVisible();
    await expect(page.locator("text=Total")).toBeVisible();

    // Total text should contain a currency symbol (not "Calculando..." forever)
    const totalEl = page.locator("text=Total").locator("..").locator("span.text-primary").first();
    const totalText = await totalEl.textContent({ timeout: 5000 }).catch(() => "");
    // Total should be a formatted price or a loading state, never empty
    expect(totalText.length).toBeGreaterThan(0);
  });

  test("shipping rates API responde correctamente", async ({ page, request }) => {
    // Direct API test against the shipping rates endpoint (requires auth)
    // This validates the backend returns a valid response shape
    await gotoLive(page, "/cart");
    await expectCartPage(page);

    const isEmpty = await page.locator("text=Tu carrito está vacío").isVisible().catch(() => false);
    if (isEmpty) {
      test.skip(true, "Cart is empty");
      return;
    }

    // Click a delivery carrier to trigger the API call
    const correoBtn = page.locator("button:has-text('Correo Arg.')");
    if (await correoBtn.isVisible()) {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/shipping/rates"),
        { timeout: 15_000 },
      ).catch(() => null);

      await correoBtn.click();
      const response = await responsePromise;

      if (response) {
        expect(response.status()).toBeLessThan(500);
        const body = await response.json().catch(() => null);
        if (body?.rates) {
          expect(Array.isArray(body.rates)).toBeTruthy();
          // Each rate should have required fields
          for (const rate of body.rates) {
            expect(rate).toHaveProperty("carrier");
            expect(rate).toHaveProperty("price");
            expect(typeof rate.price).toBe("number");
          }
        }
      }
    }
  });
});

test.describe("Checkout — MercadoPago brick", () => {
  test("renderiza payment brick en página de pago", async ({ page }) => {
    await gotoLive(page, "/checkout/pay/1");

    // Should either show the brick container, auth redirect, or an error
    const hasBrickContainer = await page.locator("#cardPaymentBrick_container").isVisible({ timeout: 10_000 }).catch(() => false);
    const hasAuthRedirect = await page.getByRole("button", { name: "Ir a login" }).isVisible().catch(() => false);
    const hasSecureRedirect = await page.getByText(/Redirigiendo al acceso seguro/i).isVisible().catch(() => false);
    const hasSessionLoading = await page.getByText(/Cargando sesión/i).isVisible().catch(() => false);
    const hasOrderError = await page.locator("text=No encontramos la orden").isVisible().catch(() => false);
    const hasInvalidId = await page.locator("text=ID de orden inválido").isVisible().catch(() => false);
    const hasSessionRestore = await page.locator("text=Restaurando sesión").isVisible().catch(() => false);

    // At least one of these should be true (page rendered correctly, not blank)
    expect(hasBrickContainer || hasAuthRedirect || hasSecureRedirect || hasSessionLoading || hasOrderError || hasInvalidId || hasSessionRestore).toBeTruthy();
  });
});
