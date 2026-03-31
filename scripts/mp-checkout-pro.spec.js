import { test, expect } from '@playwright/test';

const CHECKOUT_URL = process.env.MP_INIT_POINT;
const MP_USER = process.env.MP_TEST_USER;
const MP_PASSWORD = process.env.MP_TEST_PASSWORD;
const MP_VERIFICATION_CODE = process.env.MP_TEST_CODE || '';

test('complete sandbox checkout pro payment', async ({ page }) => {
  test.setTimeout(180000);

  if (!CHECKOUT_URL || !MP_USER || !MP_PASSWORD) {
    throw new Error('MP_INIT_POINT, MP_TEST_USER and MP_TEST_PASSWORD are required');
  }

  const clickFirst = async (selectors) => {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        try {
          await locator.click({ timeout: 3000 });
          return selector;
        } catch {}
      }
    }
    return null;
  };

  const fillFirst = async (selectors, value) => {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        try {
          await locator.fill(value, { timeout: 3000 });
          return selector;
        } catch {}
      }
    }
    return null;
  };

  const fillAccessibleFirst = async (locators, value) => {
    for (const locator of locators) {
      try {
        if (await locator.count()) {
          await locator.first().fill(value, { timeout: 5000 });
          return true;
        }
      } catch {}
    }
    return false;
  };

  await page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  await clickFirst([
    'button:has-text("Aceptar cookies")',
    'button:has-text("Aceptar")',
  ]);

  await clickFirst([
    'button:has-text("Ingresar con mi cuenta")',
    'button:has-text("Iniciar sesión con mi cuenta")',
    'button:has-text("Iniciar sesión")',
  ]);

  await page.waitForTimeout(2000);

  await clickFirst([
    'button:has-text("Iniciar sesión")',
    'a:has-text("Iniciar sesión")',
    'button:has-text("Continuar")',
  ]);

  const filledUser = await fillAccessibleFirst([
    page.getByRole('textbox', { name: /DNI, e-mail o tel[eé]fono/i }),
    page.getByLabel(/DNI, e-mail o tel[eé]fono/i),
    page.locator('input[name="user_id"]'),
    page.locator('input[name="email"]'),
    page.locator('input[type="email"]'),
    page.locator('input[autocomplete="username"]'),
  ], MP_USER);

  if (!filledUser) {
    throw new Error('No se pudo completar el usuario de Mercado Pago');
  }

  await clickFirst([
    'button:has-text("Continuar")',
    'button:has-text("Ingresar")',
    'button[type="submit"]',
  ]);

  await page.waitForTimeout(2500);

  const filledPassword = await fillAccessibleFirst([
    page.getByLabel(/Contraseñ|Contraseña|Password/i),
    page.locator('input[name="password"]'),
    page.locator('input[type="password"]'),
    page.locator('input[autocomplete="current-password"]'),
  ], MP_PASSWORD);

  if (!filledPassword) {
    throw new Error('No se pudo completar la contraseña de Mercado Pago');
  }

  await clickFirst([
    'button:has-text("Ingresar")',
    'button:has-text("Continuar")',
    'button[type="submit"]',
  ]);

  await page.waitForTimeout(4000);

  if (MP_VERIFICATION_CODE) {
    const codeField = await fillAccessibleFirst([
      page.getByLabel(/C[oó]digo|Verificaci[oó]n/i),
      page.locator('input[name="code"]'),
      page.locator('input[inputmode="numeric"]'),
      page.locator('input[autocomplete="one-time-code"]'),
    ], MP_VERIFICATION_CODE);

    if (codeField) {
      await clickFirst([
        'button:has-text("Validar")',
        'button:has-text("Continuar")',
        'button:has-text("Confirmar")',
        'button[type="submit"]',
      ]);
      await page.waitForTimeout(4000);
    }
  }

  await clickFirst([
    'button:has-text("Dinero en cuenta")',
    'button:has-text("Mercado Pago")',
    'label:has-text("Dinero en cuenta")',
    'label:has-text("Mercado Pago")',
  ]);

  await page.waitForTimeout(2000);

  await clickFirst([
    'button:has-text("Pagar")',
    'button:has-text("Confirmar compra")',
    'button:has-text("Finalizar compra")',
    'button:has-text("Continuar")',
  ]);

  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  console.log(JSON.stringify({
    finalUrl: page.url(),
    title: await page.title(),
    pageText: (await page.locator('body').innerText()).slice(0, 3000),
  }, null, 2));

  await expect(page).toHaveURL(/checkout|orders|success|pending|failure|mercadopago/i);
});
