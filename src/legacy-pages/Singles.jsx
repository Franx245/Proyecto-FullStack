import { useState, useMemo, useCallback, useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/lib/useDebounce";
import { getCardImage } from "@/lib/cardImage";
import { buildCardsQueryKey, refreshCards } from "@/lib/query-client";
import { useParams, useOutletContext } from "react-router-dom";
import {
  CATALOG_PAGE_SIZE,
  CATALOG_QUERY_STALE_TIME,
  fetchCatalogCards,
  fetchCardSets,
  getInitialCatalogSnapshot,
} from "@/api/store";

import CardGrid from "@/components/marketplace/CardGrid";
import FiltersSidebar from "@/components/marketplace/FiltersSidebar";
import MobileFilters from "@/components/marketplace/MobileFilters";

/** @param {CardVersion | undefined} card */
function extractPreloadImage(card) {
  const rawId = card?.ygopro_id ?? card?.id;
  const optimizedImage = getCardImage(rawId, "thumb");

  if (optimizedImage?.src) {
    return optimizedImage.src;
  }

  return typeof card?.image === "string" ? card.image : "";
}

/**
 * @typedef {{ label: string, min: number, max: number | null }} PriceRange
 */

/**
 * @typedef {{
 *  rarities: string[],
 *  cardTypes: string[],
 *  conditions: string[],
 *  sets: string[],
 *  priceRange: PriceRange | null
 * }} Filters
 */

/**
 * @typedef {{
 *  id: string,
 *  ygopro_id?: string | number,
 *  name: string,
 *  image?: string,
 *  image_url?: string,
 *  card_type: string,
 *  attribute?: string,
 *  featured?: boolean,
 *  version_id: string,
 *  set_name: string,
 *  set_code: string,
 *  rarity: string,
 *  price: number,
 *  stock: number,
 *  condition: string
 * }} CardVersion
 */

/** @type {Filters} */
const DEFAULT_FILTERS = {
  rarities: [],
  cardTypes: [],
  conditions: [],
  sets: [],
  priceRange: null,
};

/**
 * @typedef {{
 *  kind: "none" | "priceRange" | "sets" | "rarities" | "cardTypes" | "conditions",
 *  value: string | PriceRange | null
 * }} PrimaryCatalogFilter
 */

/**
 * @param {Filters} filters
 * @returns {PrimaryCatalogFilter}
 */
function pickPrimaryCatalogFilter(filters) {
  if (filters.priceRange) {
    return { kind: "priceRange", value: filters.priceRange };
  }

  if (filters.sets.length === 1) {
    return { kind: "sets", value: filters.sets[0] };
  }

  if (filters.rarities.length === 1) {
    return { kind: "rarities", value: filters.rarities[0] };
  }

  if (filters.cardTypes.length === 1) {
    return { kind: "cardTypes", value: filters.cardTypes[0] };
  }

  if (filters.conditions.length === 1) {
    return { kind: "conditions", value: filters.conditions[0] };
  }

  return { kind: "none", value: null };
}

/** @param {Filters} filters */
function shouldFallbackToServer(filters) {
  return (
    filters.rarities.length > 2 ||
    filters.cardTypes.length > 2 ||
    filters.conditions.length > 2
  );
}

/** @param {Filters} filters
 *  @param {PrimaryCatalogFilter} primaryFilter
 *  @param {boolean} useServerFallback
 */
function buildServerSideFilters(filters, primaryFilter, useServerFallback) {
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
    rarities: primaryFilter.kind === "rarities" && typeof primaryFilter.value === 'string' ? [primaryFilter.value] : [],
    cardTypes: primaryFilter.kind === "cardTypes" && typeof primaryFilter.value === 'string' ? [primaryFilter.value] : [],
    conditions: primaryFilter.kind === "conditions" && typeof primaryFilter.value === 'string' ? [primaryFilter.value] : [],
    sets: primaryFilter.kind === "sets" && typeof primaryFilter.value === 'string' ? [primaryFilter.value] : [],
    priceRange: primaryFilter.kind === "priceRange" && primaryFilter.value && typeof primaryFilter.value === 'object' ? primaryFilter.value : null,
  };
}

/**
 * @param {CardVersion[]} cards
 * @param {Filters} filters
 * @param {PrimaryCatalogFilter} primaryFilter
 * @param {boolean} useServerFallback
 */
function applyClientSideFilters(cards, filters, primaryFilter, useServerFallback) {
  return cards.filter((card) => {
    if (!useServerFallback && primaryFilter.kind !== "rarities" && filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) {
      return false;
    }

    if (!useServerFallback && primaryFilter.kind !== "cardTypes" && filters.cardTypes.length > 0 && !filters.cardTypes.includes(card.card_type)) {
      return false;
    }

    if (!useServerFallback && primaryFilter.kind !== "conditions" && filters.conditions.length > 0 && !filters.conditions.includes(card.condition)) {
      return false;
    }

    if (!useServerFallback && primaryFilter.kind !== "sets" && filters.sets.length > 0 && !filters.sets.includes(card.set_name)) {
      return false;
    }

    if (!useServerFallback && primaryFilter.kind !== "priceRange" && filters.priceRange) {
      const minPrice = filters.priceRange.min;
      const maxPrice = filters.priceRange.max;

      if (typeof minPrice === "number" && card.price < minPrice) {
        return false;
      }

      if (typeof maxPrice === "number" && card.price > maxPrice) {
        return false;
      }
    }

    return true;
  });
}

/**
 * @param {Filters} filters
 * @param {PrimaryCatalogFilter} primaryFilter
 * @param {boolean} useServerFallback
 */
function hasClientSideRefinements(filters, primaryFilter, useServerFallback) {
  if (useServerFallback) {
    return false;
  }

  return (
    (primaryFilter.kind !== "rarities" && filters.rarities.length > 0) ||
    (primaryFilter.kind !== "cardTypes" && filters.cardTypes.length > 0) ||
    (primaryFilter.kind !== "conditions" && filters.conditions.length > 0) ||
    (primaryFilter.kind !== "sets" && filters.sets.length > 0) ||
    (primaryFilter.kind !== "priceRange" && Boolean(filters.priceRange))
  );
}

export default function Singles() {
  const outletContext = /** @type {{ searchQuery?: string } | null} */ (useOutletContext());
  const { searchQuery = "" } = outletContext ?? {};
  const { category } = useParams();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 300);
  const debouncedFilters = useDebounce(filters, 150);
  const primaryFilter = useMemo(
    () => pickPrimaryCatalogFilter(debouncedFilters),
    [debouncedFilters]
  );
  const useServerFallback = useMemo(
    () => shouldFallbackToServer(debouncedFilters),
    [debouncedFilters]
  );
  const serverFilters = useMemo(
    () => buildServerSideFilters(debouncedFilters, primaryFilter, useServerFallback),
    [debouncedFilters, primaryFilter, useServerFallback]
  );
  const initialCatalogSnapshot = useMemo(
    () => getInitialCatalogSnapshot({
      page,
      pageSize: CATALOG_PAGE_SIZE,
      search: debouncedSearch,
      category,
      rarities: serverFilters.rarities,
      cardTypes: serverFilters.cardTypes,
      conditions: serverFilters.conditions,
      sets: serverFilters.sets,
      priceRange: serverFilters.priceRange ? { min: serverFilters.priceRange.min, max: serverFilters.priceRange.max ?? undefined } : undefined,
    }),
    [page, debouncedSearch, category, serverFilters]
  );
  const [catalogVersion, setCatalogVersion] = useState(initialCatalogSnapshot?.version ?? null);
  const clientRefinesResults = useMemo(
    () => hasClientSideRefinements(debouncedFilters, primaryFilter, useServerFallback),
    [debouncedFilters, primaryFilter, useServerFallback]
  );
  const cardsQueryKey = useMemo(
    () => buildCardsQueryKey({
      page,
      pageSize: CATALOG_PAGE_SIZE,
      search: debouncedSearch,
      category,
      mainFilter: primaryFilter,
      version: catalogVersion ?? undefined,
    }),
    [page, debouncedSearch, category, primaryFilter, catalogVersion]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, filters]);

  useEffect(() => {
    if (!useServerFallback) {
      return;
    }

    void refreshCards();
  }, [cardsQueryKey, serverFilters, useServerFallback]);

  const queryResult = useQuery({
    queryKey: cardsQueryKey,
    initialData: () => initialCatalogSnapshot,
    placeholderData: keepPreviousData,
    staleTime: CATALOG_QUERY_STALE_TIME,
    /** @returns {Promise<{ cards: CardVersion[], totalPages: number, totalRows: number, filters: { rarities: string[], sets: string[] }, version: string | null }>} */
    queryFn: async () => {
      return fetchCatalogCards({
        page,
        pageSize: CATALOG_PAGE_SIZE,
        search: debouncedSearch,
        category,
        rarities: serverFilters.rarities,
        cardTypes: serverFilters.cardTypes,
        conditions: serverFilters.conditions,
        sets: serverFilters.sets,
        priceRange: serverFilters.priceRange ? { min: serverFilters.priceRange.min, max: serverFilters.priceRange.max ?? undefined } : undefined,
      });
    },
  });

  const {
    data: catalogData,
    isLoading,
    isFetching,
  } = /** @type {{ data: { cards: CardVersion[], totalPages: number, totalRows: number, filters: { rarities: string[], sets: string[] }, version: string | null } | undefined, isLoading: boolean, isFetching: boolean }} */ (queryResult);

  useEffect(() => {
    const nextVersion = catalogData?.version;
    if (!nextVersion || nextVersion === catalogVersion) {
      return;
    }

    queryClient.setQueryData(
      buildCardsQueryKey({
        page,
        pageSize: CATALOG_PAGE_SIZE,
        search: debouncedSearch,
        category,
        mainFilter: primaryFilter,
        version: nextVersion,
      }),
      catalogData
    );

    setCatalogVersion(nextVersion);
  }, [catalogData, catalogVersion, queryClient, page, debouncedSearch, category, primaryFilter]);

  const serverCards = useMemo(() => catalogData?.cards ?? [], [catalogData]);
  const cards = useMemo(
    () => applyClientSideFilters(serverCards, debouncedFilters, primaryFilter, useServerFallback),
    [serverCards, debouncedFilters, primaryFilter, useServerFallback]
  );
  const totalPages = catalogData?.totalPages ?? 0;
  const totalRows = catalogData?.totalRows ?? 0;
  const resultsLabel = clientRefinesResults
    ? `${cards.length} resultados refinados en esta página`
    : `${totalRows} resultados disponibles`;

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const firstVisibleCard = cards[0];
    const href = extractPreloadImage(firstVisibleCard);

    if (!href) {
      return undefined;
    }

    const preloadImage = new Image();
    preloadImage.decoding = "sync";
    preloadImage.loading = "eager";
    preloadImage.fetchPriority = "high";
    preloadImage.src = href;

    return undefined;
  }, [cards]);

  const setsQuery = useQuery({
    queryKey: ["ygopro-card-sets"],
    staleTime: 1000 * 60 * 60,
    queryFn: fetchCardSets,
  });

  const availableSets = useMemo(
    () => setsQuery.data ?? [],
    [setsQuery.data]
  );

  const handleFilterChange = useCallback(
    /** @param {Filters} nextFilters */
    (nextFilters) => {
    setFilters(nextFilters);
    setPage(1);
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-6" data-critical="singles-page">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 min-[420px]:mb-6 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {category || "Cartas"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {debouncedSearch
              ? `Resultados para "${debouncedSearch}" · ${resultsLabel}`
              : resultsLabel}
          </p>
          {isFetching && !isLoading ? <p className="mt-1 text-xs font-medium text-emerald-300">Actualizando resultados...</p> : null}
        </div>

        <MobileFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          sets={availableSets}
        />
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="hidden lg:block w-64 shrink-0">
          <FiltersSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            sets={availableSets}
          />
        </div>

        {/* Grid */}
        <div className="flex-1">
          <CardGrid
            cards={cards}
            isLoading={isLoading}
            isLoadingMore={isFetching && !isLoading}
          />

          {/* Paginacion API */}
          <div className="mt-6 flex items-center justify-center gap-2 sm:mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary transition hover:bg-secondary/80 disabled:opacity-40 disabled:hover:bg-secondary"
              aria-label="Página anterior"
            >
              ←
            </button>

            <span className="min-w-[88px] rounded-xl border border-border bg-card px-4 py-2 text-center text-sm">
              {page}{totalPages > 0 ? ` / ${totalPages}` : ""}
            </span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={totalPages > 0 ? page >= totalPages : cards.length === 0}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary transition hover:bg-secondary/80 disabled:opacity-40 disabled:hover:bg-secondary"
              aria-label="Página siguiente"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}