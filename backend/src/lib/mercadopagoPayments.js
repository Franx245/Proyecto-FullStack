const MERCADOPAGO_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";
const DEFAULT_TIMEOUT_MS = 45000;

function readJsonSafely(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function extractMercadoPagoErrorMessage(payload, fallbackMessage) {
  if (payload?.message) {
    return String(payload.message);
  }

  const firstCause = Array.isArray(payload?.cause) ? payload.cause[0] : null;
  if (firstCause?.description) {
    return String(firstCause.description);
  }

  if (firstCause?.code) {
    return String(firstCause.code);
  }

  return fallbackMessage;
}

function extractMercadoPagoErrorReason(payload, fallbackReason = null) {
  const firstCause = Array.isArray(payload?.cause) ? payload.cause[0] : null;

  if (firstCause?.description) {
    return String(firstCause.description);
  }

  if (firstCause?.code) {
    return String(firstCause.code);
  }

  if (payload?.error) {
    return String(payload.error);
  }

  if (payload?.message) {
    return String(payload.message);
  }

  return fallbackReason;
}

export async function createMercadoPagoDirectPayment({ accessToken, idempotencyKey, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const abortFromUpstream = () => controller.abort("cancelled");

  if (signal) {
    signal.addEventListener("abort", abortFromUpstream, { once: true });
  }

  try {
    const response = await fetch(MERCADOPAGO_PAYMENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(idempotencyKey
          ? {
              "X-Idempotency-Key": idempotencyKey,
              "Idempotency-Key": idempotencyKey,
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await response.text();
    const payload = readJsonSafely(rawText) ?? { raw: rawText };

    if (!response.ok) {
      const error = new Error(
        extractMercadoPagoErrorMessage(payload, `Mercado Pago payment request failed with ${response.status}`)
      );
      error.statusCode = response.status;
      error.code = "MERCADOPAGO_PAYMENT_FAILED";
      error.reason = extractMercadoPagoErrorReason(payload, `provider_http_${response.status}`);
      error.providerPayload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Mercado Pago payment request timed out");
      timeoutError.statusCode = 504;
      timeoutError.code = "MERCADOPAGO_PAYMENT_TIMEOUT";
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", abortFromUpstream);
    }
  }
}