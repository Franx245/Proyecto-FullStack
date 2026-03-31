import { DEFAULT_FILTERS } from "@/lib/catalog-url-state";
import { buildCardsQueryKey } from "@/lib/query-client";

export function pickPrimaryCatalogFilter(filters = DEFAULT_FILTERS) {
  if (filters.priceRange) return { kind: "priceRange", value: filters.priceRange };
  if (filters.sets.length === 1) return { kind: "sets", value: filters.sets[0] };
  if (filters.rarities.length === 1) return { kind: "rarities", value: filters.rarities[0] };
  if (filters.cardTypes.length === 1) return { kind: "cardTypes", value: filters.cardTypes[0] };
  if (filters.conditions.length === 1) return { kind: "conditions", value: filters.conditions[0] };
  return { kind: "none", value: null };
}

export function shouldFallbackToServer(filters = DEFAULT_FILTERS) {
  return filters.rarities.length > 2 || filters.cardTypes.length > 2 || filters.conditions.length > 2;
}

/**
 * @param {*} filters
 * @param {*} primaryFilter
 * @param {boolean} useServerFallback
 */
export function buildServerSideFilters(filters = DEFAULT_FILTERS, primaryFilter, useServerFallback) {
  if (useServerFallback) {
    return {
      rarities: filters.rarities,
      cardTypes: filters.cardTypes,
      conditions: filters.conditions,
      sets: filters.sets,
      priceRange: filters.priceRange,
    };
  }

  return {
    rarities: primaryFilter.kind === "rarities" && typeof primaryFilter.value === "string" ? [primaryFilter.value] : [],
    cardTypes: primaryFilter.kind === "cardTypes" && typeof primaryFilter.value === "string" ? [primaryFilter.value] : [],
    conditions: primaryFilter.kind === "conditions" && typeof primaryFilter.value === "string" ? [primaryFilter.value] : [],
    sets: primaryFilter.kind === "sets" && typeof primaryFilter.value === "string" ? [primaryFilter.value] : [],
    priceRange: primaryFilter.kind === "priceRange" && primaryFilter.value && typeof primaryFilter.value === "object" ? primaryFilter.value : null,
  };
}

/**
 * @param {*} filters
 * @param {*} primaryFilter
 * @param {boolean} useServerFallback
 */
export function hasClientSideRefinements(filters = DEFAULT_FILTERS, primaryFilter, useServerFallback) {
  if (useServerFallback) return false;

  return (
    (primaryFilter.kind !== "rarities" && filters.rarities.length > 0) ||
    (primaryFilter.kind !== "cardTypes" && filters.cardTypes.length > 0) ||
    (primaryFilter.kind !== "conditions" && filters.conditions.length > 0) ||
    (primaryFilter.kind !== "sets" && filters.sets.length > 0) ||
    (primaryFilter.kind !== "priceRange" && Boolean(filters.priceRange))
  );
}

/**
 * @param {*} filters
 * @param {boolean} useServerFallback
 */
export function buildServerFiltersKey(filters, useServerFallback) {
  if (!useServerFallback) {
    return "";
  }

  return JSON.stringify({
    rarities: [...(filters.rarities ?? [])].sort(),
    cardTypes: [...(filters.cardTypes ?? [])].sort(),
    conditions: [...(filters.conditions ?? [])].sort(),
    sets: [...(filters.sets ?? [])].sort(),
    priceRange: filters.priceRange
      ? {
          min: filters.priceRange.min,
          max: filters.priceRange.max ?? null,
        }
      : null,
  });
}

/** @param {{ page?: number, pageSize?: number, search?: string, category?: string, filters?: * }} [options] */
export function buildCatalogQueryPlan({ page = 1, pageSize, search = "", category, filters = DEFAULT_FILTERS } = {}) {
  const primaryFilter = pickPrimaryCatalogFilter(filters);
  const useServerFallback = shouldFallbackToServer(filters);
  const serverFilters = buildServerSideFilters(filters, primaryFilter, useServerFallback);
  const serverFiltersKey = buildServerFiltersKey(serverFilters, useServerFallback);

  return {
    primaryFilter,
    useServerFallback,
    serverFilters,
    serverFiltersKey,
    cardsQueryKey: buildCardsQueryKey({
      page,
      pageSize,
      search,
      category,
      mainFilter: primaryFilter,
      serverFiltersKey,
    }),
  };
}