"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
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
  const skipNextScrollRestoreRef = useRef(false);
  const paginationPulseTimeoutRef = useRef(0);
  const [hasMounted, setHasMounted] = useState(false);
  const [pendingCatalogState, setPendingCatalogState] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(null);
  const [paginationPulse, setPaginationPulse] = useState(null);
  const [isCatalogNavigationPending, startCatalogNavigation] = useTransition();
  const catalogUrlState = useMemo(() => parseCatalogSearchParams(searchParams), [searchParams]);
  const hasUrlState = useMemo(() => hasActiveCatalogState(catalogUrlState), [catalogUrlState]);
  const uiCatalogState = pendingCatalogState ?? catalogUrlState;
  const routeSearchQuery = catalogUrlState.search;
  const routeFilters = catalogUrlState.filters;
  const routePage = catalogUrlState.page;
  const searchQuery = uiCatalogState.search;
  const filters = uiCatalogState.filters;
  const page = uiCatalogState.page;
  const currentCatalogHref = useMemo(() => buildCatalogHref(pathname, catalogUrlState), [pathname, catalogUrlState]);
  const activeCatalogHref = useMemo(() => buildCatalogHref(pathname, uiCatalogState), [pathname, uiCatalogState]);

  const debouncedSearch = useDebounce(routeSearchQuery, CATALOG_DEBOUNCE_MS);
  const debouncedFilters = useDebounce(routeFilters, CATALOG_DEBOUNCE_MS);
  const queryPlan = useMemo(() => buildCatalogQueryPlan({
    page: routePage,
    pageSize: CATALOG_PAGE_SIZE,
    search: debouncedSearch,
    category,
    filters: debouncedFilters,
  }), [routePage, debouncedSearch, category, debouncedFilters]);
  const { primaryFilter, useServerFallback, serverFilters, serverFiltersKey, cardsQueryKey } = queryPlan;
  const initialCatalogSnapshot = useMemo(() => getInitialCatalogSnapshot({
    page: routePage,
    pageSize: CATALOG_PAGE_SIZE,
    search: debouncedSearch,
    category,
    rarities: serverFilters.rarities,
    cardTypes: serverFilters.cardTypes,
    conditions: serverFilters.conditions,
    sets: serverFilters.sets,
    priceRange: serverFilters.priceRange ? { min: serverFilters.priceRange.min, max: serverFilters.priceRange.max ?? undefined } : undefined,
  }), [routePage, debouncedSearch, category, serverFilters]);
  const clientRefinesResults = useMemo(() => hasClientSideRefinements(debouncedFilters, primaryFilter, useServerFallback), [debouncedFilters, primaryFilter, useServerFallback]);
  const serverInitialCatalogData = useMemo(() => (initialData && typeof initialData === "object" ? initialData : null), [initialData]);

  const isInitialView = routePage === 1 && !debouncedSearch && !serverFiltersKey && primaryFilter.kind === "none";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!pendingCatalogState) {
      return;
    }

    if (buildCatalogHref(pathname, pendingCatalogState) === currentCatalogHref) {
      setPendingCatalogState(null);
    }
  }, [pendingCatalogState, pathname, currentCatalogHref]);

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
      page: routePage,
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

    setPendingCatalogState(storedState);
    startCatalogNavigation(() => {
      router.replace(storedHref, { scroll: false });
    });
  }, [hasUrlState, pathname, currentCatalogHref, router, startCatalogNavigation]);

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

    if (skipNextScrollRestoreRef.current) {
      skipNextScrollRestoreRef.current = false;
      return;
    }

    const storedScroll = readCatalogScroll(currentCatalogHref);

    if (storedScroll == null) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: storedScroll, behavior: "auto" });
    });
  }, [currentCatalogHref, isLoading, cards.length]);

  useEffect(() => {
    if (!catalogData || routePage >= totalPages) {
      return;
    }

    const nextPage = routePage + 1;
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
  }, [queryClient, catalogData, routePage, totalPages, debouncedSearch, category, debouncedFilters]);

  const navigateCatalog = useCallback((/** @type {*} */ nextState, /** @type {{ replace?: boolean, intent?: "filters" | "pagination" }} */ options = {}) => {
    const nextHref = buildCatalogHref(pathname, nextState);

    if (nextHref === activeCatalogHref) {
      return;
    }

    skipNextScrollRestoreRef.current = true;
    setPendingCatalogState(nextState);
    setPendingIntent(options.intent ? { kind: options.intent } : null);
    startCatalogNavigation(() => {
      router[options.replace ? "replace" : "push"](nextHref, { scroll: false });
    });
  }, [activeCatalogHref, pathname, router, startCatalogNavigation]);

  const isResultsPending = isCatalogNavigationPending || (isFetching && !isLoading);
  const pendingStatusLabel = isResultsPending
    ? (pendingIntent?.kind === "pagination" ? `Cargando página ${page}...` : pendingIntent?.kind === "filters" ? "Refinando resultados..." : "Actualizando resultados...")
    : "";

  useEffect(() => {
    if (!isResultsPending) {
      setPendingIntent(null);
    }
  }, [isResultsPending]);

  useEffect(() => () => {
    if (paginationPulseTimeoutRef.current && typeof window !== "undefined") {
      window.clearTimeout(paginationPulseTimeoutRef.current);
    }
  }, []);

  const triggerPaginationPulse = useCallback((direction) => {
    if (paginationPulseTimeoutRef.current && typeof window !== "undefined") {
      window.clearTimeout(paginationPulseTimeoutRef.current);
    }

    setPaginationPulse({ direction });

    if (typeof window !== "undefined") {
      paginationPulseTimeoutRef.current = window.setTimeout(() => {
        paginationPulseTimeoutRef.current = 0;
        setPaginationPulse(null);
      }, 480);
    }
  }, []);

  const handleFilterChange = useCallback((/** @type {*} */ nextFilters) => {
    navigateCatalog({
      search: searchQuery,
      page: 1,
      filters: nextFilters,
    }, { replace: true, intent: "filters" });
  }, [navigateCatalog, searchQuery]);

  const handleClearFilters = useCallback(() => {
    navigateCatalog({
      search: searchQuery,
      page: 1,
      filters: DEFAULT_FILTERS,
    }, { replace: true, intent: "filters" });
  }, [navigateCatalog, searchQuery]);

  const handlePreviousPage = useCallback(() => {
    flushSync(() => {
      triggerPaginationPulse("previous");
    });
    navigateCatalog({
      search: searchQuery,
      page: Math.max(1, page - 1),
      filters,
    }, { intent: "pagination" });
  }, [filters, navigateCatalog, page, searchQuery, triggerPaginationPulse]);

  const handleNextPage = useCallback(() => {
    flushSync(() => {
      triggerPaginationPulse("next");
    });
    navigateCatalog({
      search: searchQuery,
      page: Math.min(Math.max(totalPages, 1), page + 1),
      filters,
    }, { intent: "pagination" });
  }, [filters, navigateCatalog, page, searchQuery, totalPages, triggerPaginationPulse]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-6" data-critical="singles-page" data-nav-pending={isCatalogNavigationPending ? "true" : "false"}>
        <div className="mb-5 flex flex-col gap-3 min-[420px]:mb-6 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{category || "Cartas"}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {debouncedSearch ? `Resultados para "${debouncedSearch}" · ${resultsLabel}` : resultsLabel}
            </p>
            <div className="mt-2 h-9">
              <div className={`catalog-feedback-pill inline-flex h-full w-fit items-center gap-2 rounded-full border border-emerald-300/18 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 transition-opacity duration-150 ${isResultsPending ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!isResultsPending}>
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.65)]" />
                {pendingStatusLabel || "Actualizando resultados..."}
              </div>
            </div>
          </div>

          <MobileFilters filters={filters} onFilterChange={handleFilterChange} onClearFilters={handleClearFilters} sets={availableSets} isPending={isResultsPending} />
        </div>

        <div className="flex gap-6">
          <div className="hidden w-64 shrink-0 lg:block">
            <FiltersSidebar filters={filters} onFilterChange={handleFilterChange} onClearFilters={handleClearFilters} sets={availableSets} isPending={isResultsPending} />
          </div>

          <div className="flex-1">
            <NextCardGrid cards={cards} isLoading={isLoading} isLoadingMore={isFetching && !isLoading} isPending={isResultsPending} pendingIntent={pendingIntent?.kind ?? null} pendingLabel={pendingStatusLabel} />

            <div className="mt-6 flex items-center justify-center gap-2 sm:mt-8">
              <button onClick={handlePreviousPage} disabled={page === 1} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-40 ${pendingIntent?.kind === "pagination" || paginationPulse?.direction === "previous" ? "catalog-feedback-pill border-amber-300/20 bg-amber-300/10 text-amber-100 shadow-[0_12px_28px_rgba(251,191,36,0.08)]" : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_12px_28px_rgba(16,185,129,0.08)]"}`} data-critical="catalog-previous-page" data-feedback-active={paginationPulse?.direction === "previous" ? "true" : "false"}>
                Anterior
              </button>
              <div className={`rounded-xl border px-4 py-2 text-sm transition-all duration-200 ease-out ${pendingIntent?.kind === "pagination" && isResultsPending ? "catalog-feedback-pill border-amber-300/18 bg-amber-300/10 font-semibold text-amber-100" : paginationPulse ? "catalog-feedback-pill border-emerald-300/16 bg-emerald-300/10 font-semibold text-emerald-100" : "border-border bg-card text-muted-foreground"}`} data-critical="catalog-page-label" data-feedback-active={paginationPulse ? "true" : "false"}>
                Página {page} de {Math.max(totalPages, 1)}
              </div>
              <button onClick={handleNextPage} disabled={page >= totalPages} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-40 ${pendingIntent?.kind === "pagination" || paginationPulse?.direction === "next" ? "catalog-feedback-pill border-amber-300/20 bg-amber-300/10 text-amber-100 shadow-[0_12px_28px_rgba(251,191,36,0.08)]" : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_12px_28px_rgba(16,185,129,0.08)]"}`} data-critical="catalog-next-page" data-feedback-active={paginationPulse?.direction === "next" ? "true" : "false"}>
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}