import { prisma } from "./prisma.js";
import { fetchAllMetadata } from "./ygoprodeck.js";

const DEFAULT_BATCH_SIZE = 200;

/** @param {string} name */
function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function buildDefaultPrice(metadata) {
  const rarity = String(metadata?.rarity || "").toLowerCase();

  if (rarity.includes("secret")) return 14.9;
  if (rarity.includes("ultra")) return 11.9;
  if (rarity.includes("super")) return 8.9;
  if (rarity.includes("rare")) return 6.9;
  if (String(metadata?.cardType || "").toLowerCase().includes("monster")) return 5.9;
  return 4.9;
}

function chunk(items, size = DEFAULT_BATCH_SIZE) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function buildCatalogCardData(metadata, existingCard) {
  const ygoproId = metadata.ygoproId;
  return {
    name: metadata.name,
    ygoproId,
    description: metadata.description || "",
    image: metadata.image || null,
    cardType: metadata.cardType || "Unknown",
    race: metadata.race || null,
    attribute: metadata.attribute || null,
    archetype: metadata.archetype || null,
    atk: metadata.atk ?? null,
    def: metadata.def ?? null,
    level: metadata.level ?? null,
    rarity: metadata.rarity || "Unknown",
    setName: metadata.setName || "YGOPRODeck",
    setCode: metadata.setCode || `YGO-${ygoproId}`,
    price: existingCard?.price ?? buildDefaultPrice(metadata),
    stock: existingCard?.stock ?? 5,
    lowStockThreshold: existingCard?.lowStockThreshold ?? 2,
    isVisible: existingCard?.isVisible ?? true,
    isFeatured: existingCard?.isFeatured ?? false,
    isNewArrival: existingCard?.isNewArrival ?? false,
    salesCount: existingCard?.salesCount ?? 0,
    cardIdentity: ygoproId ? String(ygoproId) : normalizeName(metadata.name),
    externalId: ygoproId ? String(ygoproId) : null,
  };
}

async function resolveScopeMetadata(scopeSettings) {
  return fetchAllMetadata();
}

export async function syncCatalogFromScope(scopeSettings) {
  const desiredMetadata = await resolveScopeMetadata(scopeSettings);
  const desiredYgoIds = [...new Set(desiredMetadata.map((item) => item.ygoproId).filter(Number.isFinite))];

  const existingScopedCards = desiredYgoIds.length
    ? await prisma.card.findMany({
      where: { ygoproId: { in: desiredYgoIds } },
      select: {
        id: true,
        ygoproId: true,
        price: true,
        stock: true,
        lowStockThreshold: true,
        isVisible: true,
        isFeatured: true,
        isNewArrival: true,
        salesCount: true,
      },
    })
    : [];

  const existingByYgoId = new Map(existingScopedCards.map((card) => [card.ygoproId, card]));
  const creates = [];
  const updates = [];

  for (const metadata of desiredMetadata) {
    const existingCard = existingByYgoId.get(metadata.ygoproId);
    if (existingCard) {
      updates.push({
        id: existingCard.id,
        data: buildCatalogCardData(metadata, existingCard),
      });
    } else {
      creates.push(buildCatalogCardData(metadata, null));
    }
  }

  for (const batch of chunk(creates)) {
    if (batch.length) {
      await prisma.card.createMany({ data: batch });
    }
  }

  for (const batch of chunk(updates)) {
    if (!batch.length) {
      continue;
    }

    await prisma.$transaction(
      batch.map((item) => prisma.card.update({ where: { id: item.id }, data: item.data }))
    );
  }

  const cardsOutsideScope = await prisma.card.findMany({
    where: desiredYgoIds.length ? { ygoproId: { notIn: desiredYgoIds } } : undefined,
    select: {
      id: true,
      ygoproId: true,
      isVisible: true,
      isFeatured: true,
      isNewArrival: true,
      _count: { select: { orderItems: true } },
    },
  });

  const deletableIds = cardsOutsideScope.filter((card) => card._count.orderItems === 0).map((card) => card.id);
  const protectedIds = cardsOutsideScope.filter((card) => card._count.orderItems > 0).map((card) => card.id);

  let deletedCount = 0;
  let hiddenCount = 0;

  for (const batch of chunk(deletableIds)) {
    if (!batch.length) {
      continue;
    }

    const result = await prisma.card.deleteMany({ where: { id: { in: batch } } });
    deletedCount += result.count;
  }

  if (protectedIds.length) {
    const result = await prisma.card.updateMany({
      where: { id: { in: protectedIds } },
      data: {
        isVisible: false,
        isFeatured: false,
        isNewArrival: false,
      },
    });
    hiddenCount = result.count;
  }

  return {
    mode: "ALL",
    limit: null,
    selectedCount: 0,
    requestedCount: desiredMetadata.length,
    createdCount: creates.length,
    updatedCount: updates.length,
    deletedCount,
    hiddenCount,
  };
}