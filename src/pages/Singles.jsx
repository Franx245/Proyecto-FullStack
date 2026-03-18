import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/lib/useDebounce";
import { useParams, useOutletContext } from "react-router-dom";
import { fetchCatalogCards, fetchCardSets } from "@/api/store";

import CardGrid from "@/components/marketplace/CardGrid";
import FiltersSidebar from "@/components/marketplace/FiltersSidebar";
import MobileFilters from "@/components/marketplace/MobileFilters";

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

const PAGE_SIZE = 20;

/** @type {Filters} */
const DEFAULT_FILTERS = {
  rarities: [],
  cardTypes: [],
  conditions: [],
  sets: [],
  priceRange: null,
};

export default function Singles() {
  const outletContext = /** @type {{ searchQuery?: string } | null} */ (useOutletContext());
  const { searchQuery = "" } = outletContext ?? {};
  const { category } = useParams();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, filters]);

  const queryResult = useQuery({
    queryKey: ["cards", page, debouncedSearch, category, filters],
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 30,
    /** @returns {Promise<{ cards: CardVersion[], totalPages: number, totalRows: number, filters: { rarities: string[], sets: string[] } }>} */
    queryFn: async () => {
      return fetchCatalogCards({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        category,
        rarities: filters.rarities,
        cardTypes: filters.cardTypes,
        conditions: filters.conditions,
        sets: filters.sets,
        priceRange: filters.priceRange,
      });
    },
  });

  const {
    data: catalogData,
    isLoading,
    isFetching,
  } = /** @type {{ data: { cards: CardVersion[], totalPages: number, totalRows: number, filters: { rarities: string[], sets: string[] } } | undefined, isLoading: boolean, isFetching: boolean }} */ (queryResult);

  const cards = useMemo(() => catalogData?.cards ?? [], [catalogData]);
  const totalPages = catalogData?.totalPages ?? 0;
  const totalRows = catalogData?.totalRows ?? 0;

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
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 min-[420px]:mb-6 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {category || "Cartas"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {debouncedSearch
              ? `Resultados para "${debouncedSearch}" · ${totalRows}`
              : `${totalRows} resultados disponibles`}
          </p>
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