const API_BASE_URL = "https://db.ygoprodeck.com/api/v7";
const DEFAULT_CONDITION = "Near Mint";
const DEFAULT_STOCK = 8;

/**
 * @typedef {{
 *  id: number,
 *  name: string,
 *  type?: string,
 *  frameType?: string,
 *  race?: string,
 *  attribute?: string,
 *  desc?: string,
 *  level?: number,
 *  rank?: number,
 *  linkval?: number,
 *  atk?: number,
 *  def?: number,
 *  card_sets?: Array<{
 *    set_name?: string,
 *    set_code?: string,
 *    set_rarity?: string,
 *    set_price?: string
 *  }>,
 *  card_images?: Array<{
 *    image_url?: string,
 *    image_url_small?: string,
 *    image_url_cropped?: string
 *  }>,
 *  card_prices?: Array<{
 *    cardmarket_price?: string,
 *    tcgplayer_price?: string,
 *    ebay_price?: string,
 *    amazon_price?: string,
 *    coolstuffinc_price?: string
 *  }>
 * }} YgoCard
 */

/**
 * @typedef {{
 *  id: string,
 *  name: string,
 *  image?: string | null,
 *  image_url?: string | null,
 *  card_type: string,
 *  attribute?: string | null,
 *  version_id: string,
 *  set_name: string,
 *  set_code: string,
 *  rarity: string,
 *  price: number,
 *  stock: number,
 *  condition: string
 * }} MarketplaceCard
 */

/**
 * @typedef {{
 *  version_id: string,
 *  card_id: string,
 *  name: string,
 *  image?: string | null,
 *  set_name: string,
 *  set_code: string,
 *  rarity: string,
 *  price: number,
 *  stock: number,
 *  condition: string
 * }} MarketplaceVersion
 */

/**
 * @param {string} path
 * @param {Record<string, string | number | undefined>} [params]
 */
function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE_URL}/${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

/**
 * @param {string} path
 * @param {Record<string, string | number | undefined>} [params]
 */
async function fetchJson(path, params = {}) {
  const response = await fetch(buildUrl(path, params));

  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      return null;
    }

    throw new Error(`YGOPRODeck request failed with ${response.status}`);
  }

  return response.json();
}

/** @param {string | number | undefined} value */
function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** @param {YgoCard} card */
function getFallbackPrice(card) {
  const priceSource = card.card_prices?.[0];

  const candidates = [
    priceSource?.tcgplayer_price,
    priceSource?.cardmarket_price,
    priceSource?.ebay_price,
    priceSource?.coolstuffinc_price,
    priceSource?.amazon_price,
  ]
    .map(toPositiveNumber)
    .filter((value) => value !== null);

  return candidates[0] ?? 0;
}

/** @param {YgoCard} card */
function getCardImage(card) {
  return card.card_images?.[0]?.image_url || null;
}

/** @param {YgoCard} card */
function getMarketplaceCardType(card) {
  if (card.frameType === "spell") {
    return "Spell";
  }

  if (card.frameType === "trap") {
    return "Trap";
  }

  return "Monster";
}

/** @param {YgoCard} card */
function selectPrimarySet(card) {
  const sets = Array.isArray(card.card_sets) ? card.card_sets : [];
  const fallbackPrice = getFallbackPrice(card);

  if (sets.length === 0) {
    return {
      set_name: "YGOPRODeck",
      set_code: `YGO-${card.id}`,
      set_rarity: "Unknown",
      set_price: String(fallbackPrice),
    };
  }

  return [...sets].sort((left, right) => {
    const leftPrice = toPositiveNumber(left.set_price) ?? fallbackPrice;
    const rightPrice = toPositiveNumber(right.set_price) ?? fallbackPrice;
    return leftPrice - rightPrice;
  })[0];
}

/**
 * @param {YgoCard} card
 * @param {{ set_price?: string }} cardSet
 */
function getSetPrice(card, cardSet) {
  return toPositiveNumber(cardSet.set_price) ?? getFallbackPrice(card);
}

/** @param {YgoCard} card */
export function normalizeCatalogCard(card) {
  const primarySet = selectPrimarySet(card);
  const image = getCardImage(card) || undefined;

  return {
    id: String(card.id),
    name: card.name,
    image,
    image_url: image,
    card_type: getMarketplaceCardType(card),
    attribute: card.attribute || undefined,
    version_id: String(card.id),
    set_name: primarySet.set_name || "YGOPRODeck",
    set_code: primarySet.set_code || `YGO-${card.id}`,
    rarity: primarySet.set_rarity || "Unknown",
    price: getSetPrice(card, primarySet),
    stock: DEFAULT_STOCK + Math.min(card.card_sets?.length ?? 0, 4),
    condition: DEFAULT_CONDITION,
  };
}

/** @param {YgoCard} card */
export function normalizeCardVersions(card) {
  const image = getCardImage(card) || undefined;
  const sets = Array.isArray(card.card_sets) && card.card_sets.length > 0
    ? card.card_sets
    : [
        {
          set_name: "YGOPRODeck",
          set_code: `YGO-${card.id}`,
          set_rarity: "Unknown",
          set_price: String(getFallbackPrice(card)),
        },
      ];

  return sets.map((cardSet, index) => ({
    version_id: `${card.id}:${cardSet.set_code || index}:${index}`,
    card_id: String(card.id),
    name: card.name,
    image,
    set_name: cardSet.set_name || "YGOPRODeck",
    set_code: cardSet.set_code || `YGO-${card.id}`,
    rarity: cardSet.set_rarity || "Unknown",
    price: getSetPrice(card, cardSet),
    stock: Math.max(DEFAULT_STOCK - index, 1),
    condition: DEFAULT_CONDITION,
  }));
}

/** @param {string | undefined} category */
function normalizeCategory(category) {
  if (!category) {
    return null;
  }

  const normalized = category.toLowerCase();

  if (normalized.includes("spell") || normalized.includes("magia")) {
    return "Spell";
  }

  if (normalized.includes("trap") || normalized.includes("trampa")) {
    return "Trap";
  }

  if (normalized.includes("monster") || normalized.includes("monstruo")) {
    return "Monster";
  }

  return null;
}

/**
 * @param {YgoCard} card
 * @param {string | undefined} category
 */
function matchesCategory(card, category) {
  const expectedCategory = normalizeCategory(category);

  if (!expectedCategory) {
    return true;
  }

  return getMarketplaceCardType(card) === expectedCategory;
}

/**
 * @param {{
 *  page?: number,
 *  pageSize?: number,
 *  search?: string,
 *  category?: string
 * }} [options]
 */
export async function fetchCatalogCards(options = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const search = options.search?.trim();
  const offset = (page - 1) * pageSize;

  const response = await fetchJson("cardinfo.php", {
    num: pageSize,
    offset,
    fname: search || undefined,
  });

  if (!response?.data) {
    return {
      cards: [],
      totalRows: 0,
      totalPages: 0,
    };
  }

  const cards = response.data
    .filter((card) => matchesCategory(card, options.category))
    .map(normalizeCatalogCard);

  return {
    cards,
    totalRows: Number(response.meta?.total_rows) || cards.length,
    totalPages: Number(response.meta?.total_pages) || (cards.length > 0 ? 1 : 0),
  };
}

export async function fetchCardSets() {
  const response = await fetchJson("cardsets.php");

  if (!Array.isArray(response)) {
    return [];
  }

  return response
    .map((cardSet) => cardSet?.set_name)
    .filter((setName) => typeof setName === "string" && setName.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

/** @param {number} [limit] */
export async function fetchFeaturedCards(limit = 5) {
  const response = await fetchJson("cardinfo.php", {
    sort: "new",
    num: limit,
    offset: 0,
  });

  if (!response?.data) {
    return [];
  }

  return response.data.map(normalizeCatalogCard);
}

/** @param {string} id */
export async function fetchCardDetail(id) {
  const response = await fetchJson("cardinfo.php", { id });

  const rawCard = response?.data?.[0];
  if (!rawCard) {
    return null;
  }

  return {
    card: normalizeCatalogCard(rawCard),
    versions: normalizeCardVersions(rawCard),
    ygoproData: {
      ...rawCard,
      link_val: rawCard.linkval ?? null,
    },
  };
}