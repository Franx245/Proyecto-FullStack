"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDebounce } from "@/lib/useDebounce";
import {
  buildCatalogQueryPlan,
  hasClientSideRefinements,
} from "@/lib/catalog-query-plan";
import {
  buildCatalogHref,
  DEFAULT_FILTERS,
  hasActiveCatalogState,
  parseCatalogSearchParams,
  persistCatalogScroll,
  persistCatalogState,
  persistLastCatalogHref,
  readCatalogScroll,
  readCatalogState,
} from "@/lib/catalog-url-state";
import { retainPreviousData } from "@/lib/query-client";
import {
  CATALOG_QUERY_GC_TIME,
  CATALOG_PAGE_SIZE,
  CATALOG_QUERY_STALE_TIME,
  fetchCatalogCards,
  fetchCardSets,
  getInitialCatalogSnapshot,
} from "@/api/store";
import FiltersSidebar from "@/components/marketplace/FiltersSidebar";
import MobileFilters from "@/components/marketplace/MobileFilters";
import NextCardGrid from "@/next/components/NextCardGrid.jsx";

const CATALOG_DEBOUNCE_MS = 200;

/**
 * @param {*[]} cards
 * @param {*} filters
 * @param {*} primaryFilter
 * @param {boolean} useServerFallback
 */
function applyClientSideFilters(cards, filters, primaryFilter, useServerFallback) {
  return cards.filter((/** @type {*} */ card) => {
    if (!useServerFallback && primaryFilter.kind !== "rarities" && filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
    if (!useServerFallback && primaryFilter.kind !== "cardTypes" && filters.cardTypes.length > 0 && !filters.cardTypes.includes(card.card_type)) return false;
    if (!useServerFallback && primaryFilter.kind !== "conditions" && filters.conditions.length > 0 && !filters.conditions.includes(card.condition)) return false;
    if (!useServerFallback && primaryFilter.kind !== "sets" && filters.sets.length > 0 && !filters.sets.includes(card.set_name)) return false;
    if (!useServerFallback && primaryFilter.kind !== "priceRange" && filters.priceRange) {
      const minPrice = filters.priceRange.min;
      const maxPrice = filters.priceRange.max;
      if (typeof minPrice === "number" && card.price < minPrice) return false;
      if (typeof maxPrice === "number" && card.price > maxPrice) return false;
    }
    return true;
  });
}

/** @param {{ category?: string, initialData?: * }} props */
export default function SinglesPage({ category, initialData }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restoredScrollRef = useRef("");
  const [hasMounted, setHasMounted] = useState(false);
  const catalogUrlState = useMemo(() => parseCatalogSearchParams(searchParams), [searchParams]);
  const hasUrlState = useMemo(() => hasActiveCatalogState(catalogUrlState), [catalogUrlState]);
  const searchQuery = catalogUrlState.search;
  const filters = catalogUrlState.filters;
  const page = catalogUrlState.page;
  const currentCatalogHref = useMemo(() => buildCatalogHref(pathname, catalogUrlState), [pathname, catalogUrlState]);

  const debouncedSearch = useDebounce(searchQuery, CATALOG_DEBOUNCE_MS);
  const debouncedFilters = useDebounce(filters, CATALOG_DEBOUNCE_MS);
  const queryPlan = useMemo(() => buildCatalogQueryPlan({
    page,
    pageSize: CATALOG_PAGE_SIZE,
    search: debouncedSearch,
    category,
    filters: debouncedFilters,
  }), [page, debouncedSearch, category, debouncedFilters]);
  const { primaryFilter, useServerFallback, serverFilters, serverFiltersKey, cardsQueryKey } = queryPlan;
  const initialCatalogSnapshot = useMemo(() => getInitialCatalogSnapshot({
    page,
    pageSize: CATALOG_PAGE_SIZE,
    search: debouncedSearch,
    category,
    rarities: serverFilters.rarities,
    cardTypes: serverFilters.cardTypes,
    conditions: serverFilters.conditions,
    sets: serverFilters.sets,
    priceRange: serverFilters.priceRange ? { min: serverFilters.priceRange.min, max: serverFilters.priceRange.max ?? undefined } : undefined,
  }), [page, debouncedSearch, category, serverFilters]);
  const clientRefinesResults = useMemo(() => hasClientSideRefinements(debouncedFilters, primaryFilter, useServerFallback), [debouncedFilters, primaryFilter, useServerFallback]);
  const serverInitialCatalogData = useMemo(() => (initialData && typeof initialData === "object" ? initialData : null), [initialData]);

  const isInitialView = page === 1 && !debouncedSearch && !serverFiltersKey && primaryFilter.kind === "none";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const queryResult = useQuery({
    queryKey: cardsQueryKey,
    initialData: () => (isInitialView ? serverInitialCatalogData : undefined) ?? initialCatalogSnapshot ?? undefined,
    placeholderData: retainPreviousData,
    staleTime: CATALOG_QUERY_STALE_TIME,
    gcTime: CATALOG_QUERY_GC_TIME,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => fetchCatalogCards({
      page,
      pageSize: CATALOG_PAGE_SIZE,
      search: debouncedSearch,
      category,
      rarities: serverFilters.rarities,
      cardTypes: serverFilters.cardTypes,
      conditions: serverFilters.conditions,
      sets: serverFilters.sets,
      priceRange: serverFilters.priceRange ? { min: serverFilters.priceRange.min, max: serverFilters.priceRange.max ?? undefined } : undefined,
      signal,
    }),
  });

  const { data: catalogData, isLoading, isFetching } = queryResult;
  const visibleCatalogData = !hasMounted && isInitialView
    ? (serverInitialCatalogData ?? catalogData)
    : (catalogData ?? serverInitialCatalogData);

  const serverCards = useMemo(() => visibleCatalogData?.cards ?? [], [visibleCatalogData]);
  const cards = useMemo(() => applyClientSideFilters(serverCards, debouncedFilters, primaryFilter, useServerFallback), [serverCards, debouncedFilters, primaryFilter, useServerFallback]);
  const totalPages = visibleCatalogData?.totalPages ?? 0;
  const totalRows = visibleCatalogData?.totalRows ?? 0;
  const resultsLabel = clientRefinesResults ? `${cards.length} resultados refinados en esta página` : `${totalRows} resultados disponibles`;

  const setsQuery = useQuery({
    queryKey: ["ygopro-card-sets"],
    initialData: () => serverInitialCatalogData?.filters?.sets ?? initialCatalogSnapshot?.filters?.sets ?? undefined,
    placeholderData: retainPreviousData,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryFn: fetchCardSets,
  });

  const availableSets = useMemo(() => setsQuery.data ?? [], [setsQuery.data]);

  useEffect(() => {
    persistCatalogState(pathname, catalogUrlState);
    persistLastCatalogHref(currentCatalogHref);
  }, [pathname, catalogUrlState, currentCatalogHref]);

  useEffect(() => {
    if (hasUrlState) {
      return;
    }

    const storedState = readCatalogState(pathname);
    if (!hasActiveCatalogState(storedState)) {
      return;
    }

    const storedHref = buildCatalogHref(pathname, storedState);
    if (storedHref === currentCatalogHref) {
      return;
    }

    startTransition(() => {
      router.replace(storedHref, { scroll: false });
    });
  }, [hasUrlState, pathname, currentCatalogHref, router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const saveScrollPosition = () => persistCatalogScroll(currentCatalogHref, window.scrollY);
    let frameId = 0;

    const handleScroll = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        saveScrollPosition();
      });
    };

    saveScrollPosition();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", saveScrollPosition);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      saveScrollPosition();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveScrollPosition);
    };
  }, [currentCatalogHref]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) {
      return;
    }

    if (restoredScrollRef.current === currentCatalogHref) {
      return;
    }

    restoredScrollRef.current = currentCatalogHref;
    const storedScroll = readCatalogScroll(currentCatalogHref);

    if (storedScroll == null) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: storedScroll, behavior: "auto" });
    });
  }, [currentCatalogHref, isLoading, cards.length]);

  useEffect(() => {
    if (!catalogData || page >= totalPages) {
      return;
    }

    const nextPage = page + 1;
    const nextPageQueryPlan = buildCatalogQueryPlan({
      page: nextPage,
      pageSize: CATALOG_PAGE_SIZE,
      search: debouncedSearch,
      category,
      filters: debouncedFilters,
    });

    void queryClient.prefetchQuery({
      queryKey: nextPageQueryPlan.cardsQueryKey,
      staleTime: CATALOG_QUERY_STALE_TIME,
      gcTime: CATALOG_QUERY_GC_TIME,
      queryFn: ({ signal }) => fetchCatalogCards({
        page: nextPage,
        pageSize: CATALOG_PAGE_SIZE,
        search: debouncedSearch,
        category,
        rarities: nextPageQueryPlan.serverFilters.rarities,
        cardTypes: nextPageQueryPlan.serverFilters.cardTypes,
        conditions: nextPageQueryPlan.serverFilters.conditions,
        sets: nextPageQueryPlan.serverFilters.sets,
        priceRange: nextPageQueryPlan.serverFilters.priceRange
          ? { min: nextPageQueryPlan.serverFilters.priceRange.min, max: nextPageQueryPlan.serverFilters.priceRange.max ?? undefined }
          : undefined,
        signal,
      }),
    });
  }, [queryClient, catalogData, page, totalPages, debouncedSearch, category, debouncedFilters]);

  const navigateCatalog = useCallback((/** @type {*} */ nextState, /** @type {{ replace?: boolean }} */ options = {}) => {
    const nextHref = buildCatalogHref(pathname, nextState);
    const currentHref = buildCatalogHref(pathname, {
      search: searchQuery,
      page,
      filters,
    });

    if (nextHref === currentHref) {
      return;
    }

    startTransition(() => {
      router[options.replace ? "replace" : "push"](nextHref, { scroll: false });
    });
  }, [router, pathname, searchQuery, page, filters]);

  const handleFilterChange = useCallback((/** @type {*} */ nextFilters) => {
    navigateCatalog({
      search: searchQuery,
      page: 1,
      filters: nextFilters,
    }, { replace: true });
  }, [navigateCatalog, searchQuery]);

  const handleClearFilters = useCallback(() => {
    navigateCatalog({
      search: searchQuery,
      page: 1,
      filters: DEFAULT_FILTERS,
    }, { replace: true });
  }, [navigateCatalog, searchQuery]);

  const handlePreviousPage = useCallback(() => {
    navigateCatalog({
      search: searchQuery,
      page: Math.max(1, page - 1),
      filters,
    });
  }, [navigateCatalog, searchQuery, page, filters]);

  const handleNextPage = useCallback(() => {
    navigateCatalog({
      search: searchQuery,
      page: Math.min(Math.max(totalPages, 1), page + 1),
      filters,
    });
  }, [navigateCatalog, searchQuery, page, filters, totalPages]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-6" data-critical="singles-page">
        <div className="mb-5 flex flex-col gap-3 min-[420px]:mb-6 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{category || "Cartas"}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {debouncedSearch ? `Resultados para "${debouncedSearch}" · ${resultsLabel}` : resultsLabel}
            </p>
            {isFetching && !isLoading ? <p className="mt-1 text-xs font-medium text-emerald-300">Actualizando resultados...</p> : null}
          </div>

          <MobileFilters filters={filters} onFilterChange={handleFilterChange} onClearFilters={handleClearFilters} sets={availableSets} />
        </div>

        <div className="flex gap-6">
          <div className="hidden w-64 shrink-0 lg:block">
            <FiltersSidebar filters={filters} onFilterChange={handleFilterChange} onClearFilters={handleClearFilters} sets={availableSets} />
          </div>

          <div className="flex-1">
            <NextCardGrid cards={cards} isLoading={isLoading} isLoadingMore={isFetching && !isLoading} />

            <div className="mt-6 flex items-center justify-center gap-2 sm:mt-8">
              <button onClick={handlePreviousPage} disabled={page === 1} className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:border-primary/35 disabled:opacity-40">
                Anterior
              </button>
              <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                Página {page} de {Math.max(totalPages, 1)}
              </div>
              <button onClick={handleNextPage} disabled={page >= totalPages} className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:border-primary/35 disabled:opacity-40">
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}