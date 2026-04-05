"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  CATALOG_PAGE_SIZE,
  CATALOG_QUERY_STALE_TIME,
  fetchCatalogCards,
  fetchCardSets,
} from "@/api/store";
import { parseCatalogSearchParams } from "@/lib/catalog-url-state";
import { buildCatalogQueryPlan } from "@/lib/catalog-query-plan";

function parseCatalogHref(href = "/singles") {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://duelvault.local";
  const url = new URL(href, baseUrl);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const category = pathSegments[0] === "singles" && pathSegments[1] ? decodeURIComponent(pathSegments[1]) : undefined;

  return {
    href: `${url.pathname}${url.search}`,
    category,
    catalogUrlState: parseCatalogSearchParams(url.searchParams),
  };
}

export default function useCatalogPrefetch() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(async (href = "/singles") => {
    const { href: normalizedHref, category, catalogUrlState } = parseCatalogHref(href);
    const queryPlan = buildCatalogQueryPlan({
      page: catalogUrlState.page,
      pageSize: CATALOG_PAGE_SIZE,
      search: catalogUrlState.search,
      category,
      filters: catalogUrlState.filters,
    });

    router.prefetch(normalizedHref);

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryPlan.cardsQueryKey,
        staleTime: CATALOG_QUERY_STALE_TIME,
        queryFn: ({ signal }) => fetchCatalogCards({
          page: catalogUrlState.page,
          pageSize: CATALOG_PAGE_SIZE,
          search: catalogUrlState.search,
          category,
          rarities: queryPlan.serverFilters.rarities,
          cardTypes: queryPlan.serverFilters.cardTypes,
          conditions: queryPlan.serverFilters.conditions,
          sets: queryPlan.serverFilters.sets,
          priceRange: queryPlan.serverFilters.priceRange
            ? {
                min: queryPlan.serverFilters.priceRange.min,
                max: queryPlan.serverFilters.priceRange.max ?? undefined,
              }
            : undefined,
          signal,
        }),
      }),
      queryClient.prefetchQuery({
        queryKey: ["ygopro-card-sets"],
        staleTime: 1000 * 60 * 60,
        queryFn: fetchCardSets,
      }),
    ]);
  }, [queryClient, router]);
}