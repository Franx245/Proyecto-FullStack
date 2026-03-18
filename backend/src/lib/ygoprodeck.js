export function normalizeMetadata(card) {
  const primarySet = Array.isArray(card.card_sets) && card.card_sets.length > 0
    ? card.card_sets[0]
    : null;

  return {
    ygoproId: card.id,
    name: card.name,
    description: card.desc || "",
    image: card.card_images?.[0]?.image_url || null,
    cardType: card.humanReadableCardType || card.type || "Unknown",
    race: card.race || null,
    attribute: card.attribute || null,
    archetype: card.archetype || null,
    atk: typeof card.atk === "number" ? card.atk : null,
    def: typeof card.def === "number" ? card.def : null,
    level: card.level ?? card.rank ?? card.linkval ?? null,
    rarity: primarySet?.set_rarity || "Unknown",
    setName: primarySet?.set_name || "YGOPRODeck",
    setCode: primarySet?.set_code || `YGO-${card.id}`,
  };
}

function buildCardInfoUrl(params = {}) {
  const url = new URL("https://db.ygoprodeck.com/api/v7/cardinfo.php");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function fetchBatch(ids) {
  if (ids.length === 0) {
    return [];
  }

  const url = buildCardInfoUrl({ id: ids.join(",") });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YGOPRODeck request failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.data ?? [];
}

export async function fetchMetadataByYgoIds(ids) {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Number.isFinite))];

  const result = new Map();

  for (let index = 0; index < uniqueIds.length; index += 20) {
    const chunk = uniqueIds.slice(index, index + 20);
    const cards = await fetchBatch(chunk);

    for (const card of cards) {
      result.set(card.id, normalizeMetadata(card));
    }
  }

  return result;
}

export async function fetchMetadataByYgoId(id) {
  const metadata = await fetchMetadataByYgoIds([id]);
  return metadata.get(Number(id)) || null;
}

export async function fetchAllMetadata() {
  const pageSize = 2000;
  const allCards = [];

  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(buildCardInfoUrl({ num: pageSize, offset }));

    if (!response.ok) {
      throw new Error(`YGOPRODeck catalog request failed with ${response.status}`);
    }

    const payload = await response.json();
    const cards = payload.data ?? [];

    if (cards.length === 0) {
      break;
    }

    allCards.push(...cards.map(normalizeMetadata));

    if (cards.length < pageSize) {
      break;
    }
  }

  return allCards;
}