/**
 * Job: sync-cards
 * Pulls full catalog from YGOPRODeck and upserts into DB.
 * Invalidates public catalog cache on completion.
 */
import { syncCatalogFromScope } from "../catalogSync.js";
import { invalidatePublicCatalogCache } from "../cache.js";
import { prisma } from "../prisma.js";
import { publishEvent } from "../events.js";

export async function handleSyncCards(_jobData) {
  const scopeSettings = await prisma.appSetting.findMany({
    where: { key: { startsWith: "catalog_" } },
  });

  const settingsMap = Object.fromEntries(
    scopeSettings.map((s) => [s.key, s.value])
  );

  const result = await syncCatalogFromScope(settingsMap);

  await invalidatePublicCatalogCache();

  publishEvent("catalog-synced", {
    created: result.createdCount,
    updated: result.updatedCount,
    deleted: result.deletedCount,
    hidden: result.hiddenCount,
  });

  return {
    ...result,
    idempotent: true,
  };
}
