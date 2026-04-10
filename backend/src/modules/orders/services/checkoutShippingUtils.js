const FALLBACK_SHIPPING_CARRIERS = ["correo-argentino", "andreani"];

export function normalizeCheckoutCarrier(value, normalizeEnviaCarrier) {
  return normalizeEnviaCarrier(value);
}

export function buildCheckoutShippingLabel(rate, zone, dependencies) {
  const { getShippingInfo } = dependencies;
  const fallbackLabel = getShippingInfo(zone).label;
  const carrierLabel = String(rate?.carrierLabel || "").trim();
  const service = String(rate?.service || "").trim();

  if (carrierLabel && service && carrierLabel.toLowerCase() !== service.toLowerCase()) {
    return `${carrierLabel} · ${service}`;
  }

  return carrierLabel || fallbackLabel;
}

export function getCheckoutCarrierLabel(carrier, normalizeEnviaCarrier) {
  const normalizedCarrier = normalizeCheckoutCarrier(carrier, normalizeEnviaCarrier);
  if (normalizedCarrier === "correo-argentino") {
    return "Correo Argentino";
  }

  if (normalizedCarrier === "andreani") {
    return "Andreani";
  }

  if (normalizedCarrier === "showroom") {
    return "Retiro en showroom";
  }

  return null;
}

export function buildFallbackShippingRate(carrier, zone, { reason = "provider_unavailable" } = {}, dependencies) {
  const { formatCurrency, getShippingInfo, normalizeEnviaCarrier } = dependencies;
  const normalizedCarrier = normalizeCheckoutCarrier(carrier, normalizeEnviaCarrier) || FALLBACK_SHIPPING_CARRIERS[0];
  const shippingInfo = getShippingInfo(zone);

  return {
    carrier: normalizedCarrier,
    carrierLabel: getCheckoutCarrierLabel(normalizedCarrier, normalizeEnviaCarrier) || shippingInfo.label,
    service: "Estimado",
    price: formatCurrency(Number(shippingInfo.cost || 0)),
    estimatedDays: shippingInfo.eta,
    currency: "ARS",
    fallback: true,
    fallbackReason: reason,
  };
}

export function buildFallbackShippingRates(zone, options = {}, dependencies) {
  const { buildFallbackShippingRate, normalizeCheckoutCarrier } = dependencies;
  const carriers = Array.isArray(options.carriers) && options.carriers.length
    ? options.carriers
    : FALLBACK_SHIPPING_CARRIERS;

  return [...new Set(carriers.map((carrier) => normalizeCheckoutCarrier(carrier)).filter(Boolean))]
    .filter((carrier) => carrier !== "showroom")
    .map((carrier) => buildFallbackShippingRate(carrier, zone, options));
}

export function buildFallbackCheckoutShippingQuote(carrier, zone, snapshotId, options = {}, dependencies) {
  const { buildCheckoutShippingLabel, buildFallbackShippingRate, formatCurrency } = dependencies;
  const fallbackRate = buildFallbackShippingRate(carrier, zone, options);

  return {
    carrier: fallbackRate.carrier,
    cost: formatCurrency(Number(fallbackRate.price || 0)),
    label: buildCheckoutShippingLabel(fallbackRate, zone),
    snapshotId: snapshotId || null,
    snapshotSource: "fallback",
    fallbackReason: options.reason || null,
  };
}