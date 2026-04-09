import "../backend/src/lib/load-env.js";
const ORDER_ID = Number(process.env.ORDER_ID || 13);
const PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const BUYER_EMAIL = process.env.MP_BUYER_EMAIL;
const CARDHOLDER_NAME = process.env.MP_CARDHOLDER_NAME || "APRO";
const CARD_NUMBER = process.env.MP_CARD_NUMBER || "4509953566233704";
const SECURITY_CODE = process.env.MP_SECURITY_CODE || "123";
const EXP_MONTH = process.env.MP_EXP_MONTH || "11";
const EXP_YEAR = process.env.MP_EXP_YEAR || "2030";

if (!PUBLIC_KEY || !ACCESS_TOKEN || !BUYER_EMAIL) {
  throw new Error("MP_PUBLIC_KEY, MP_ACCESS_TOKEN and MP_BUYER_EMAIL are required");
}

async function requestJson(url, options = {}) {
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

async function main() {
  const token = await requestJson(`https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(PUBLIC_KEY)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  });

  const payment = await requestJson("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "X-Idempotency-Key": `sandbox-order-${ORDER_ID}-${Date.now()}`,
    },
    body: JSON.stringify({
      transaction_amount: 10060.65,
      token: token.id,
      description: `RareHunter sandbox order #${ORDER_ID}`,
      installments: 1,
      payment_method_id: "visa",
      external_reference: String(ORDER_ID),
      payer: {
        email: BUYER_EMAIL,
        identification: {
          type: "DNI",
          number: "12345678",
        },
      },
    }),
  });

  console.log(JSON.stringify({ token, payment }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    message: error.message,
    status: error.status || null,
    payload: error.payload || null,
  }, null, 2));
  process.exitCode = 1;
});
