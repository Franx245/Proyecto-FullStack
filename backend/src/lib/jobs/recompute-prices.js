/**
 * Job: recompute-prices
 * Recalculates card prices based on rarity rules.
 * Only touches cards whose computed price differs from current.
 */
import { prisma } from "../prisma.js";
import { invalidatePriceRelatedCache } from "../cache-invalidation.js";
import { publishEvent } from "../events.js";

const BATCH_SIZE = 200;

function computePriceByRarity(rarity) {
  const r = String(rarity || "").toLowerCase();
  if (r.includes("secret")) return 14.9;
  if (r.includes("ultra")) return 11.9;
  if (r.includes("super")) return 8.9;
  if (r.includes("rare")) return 6.9;
  return 4.9;
}

export async function handleRecomputePrices(_jobData) {
  const cards = await prisma.card.findMany({
    where: { isVisible: true },
    select: { id: true, rarity: true, price: true },
  });

  const toUpdate = cards.filter((card) => {
    const computed = computePriceByRarity(card.rarity);
    return Math.abs(card.price - computed) > 0.01;
  });

  let updatedCount = 0;
  const updatedCardIds = [];

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((card) =>
        prisma.card.update({
          where: { id: card.id },
          data: { price: computePriceByRarity(card.rarity) },
        })
      )
    );
    updatedCount += batch.length;
    updatedCardIds.push(...batch.map((card) => card.id));
  }

  if (updatedCount > 0) {
    await invalidatePriceRelatedCache(updatedCardIds);
    publishEvent("price-change", { updatedCount });
  }

  return { total: cards.length, updated: updatedCount };
}
