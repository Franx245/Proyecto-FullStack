function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function extractCardIdFromRouteSegment(segment) {
  const rawValue = String(segment || "").trim();
  if (/^\d+$/.test(rawValue)) {
    return rawValue;
  }

  const match = rawValue.match(/(?:^|[^\d])(\d+)$/);
  return match?.[1] || "";
}

export function buildCardSeoSlug(name, id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    return "";
  }

  const baseSlug = slugify(name) || "card";
  return `${baseSlug}-${normalizedId}`;
}

export function buildCardPath(cardOrId, fallbackName = "") {
  if (cardOrId && typeof cardOrId === "object") {
    const id = cardOrId.version_id ?? cardOrId.card_id ?? cardOrId.id ?? cardOrId.ygopro_id;
    const name = cardOrId.name || fallbackName;
    const slug = buildCardSeoSlug(name, id);
    return slug ? `/card/${slug}` : id ? `/card/${id}` : "/singles";
  }

  const slug = buildCardSeoSlug(fallbackName, cardOrId);
  return slug ? `/card/${slug}` : `/card/${cardOrId}`;
}

export function resolveSiteUrl() {
  const explicitSiteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (explicitSiteUrl) {
    return explicitSiteUrl.replace(/\/$/, "");
  }

  const vercelUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  return `http://127.0.0.1:${Number(process.env.NEXT_STORE_PORT || 3002)}`;
}

export function buildCardJsonLd(card) {
  if (!card) {
    return null;
  }

  const name = String(card.name || "Carta Yu-Gi-Oh!").trim();
  const image = card.image ? [card.image] : undefined;
  const description = String(card.description || `${name} disponible en DuelVault.`).trim();
  const url = `${resolveSiteUrl()}${buildCardPath(card)}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image,
    sku: String(card.id || card.card_id || ""),
    category: card.card_type || "Trading Card Game",
    brand: {
      "@type": "Brand",
      name: "Yu-Gi-Oh!",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "ARS",
      price: typeof card.price === "number" ? card.price.toFixed(2) : undefined,
      availability: Number(card.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
    },
  };
}

export { slugify };