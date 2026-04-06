export const dynamic = "force-dynamic";

import { Suspense } from "react";

import { CATALOG_PAGE_SIZE, fetchCatalogCards } from "@/api/store";
import { parseCatalogSearchParams } from "@/lib/catalog-url-state";
import SinglesPage from "@/next/pages/SinglesPage.jsx";

export const metadata = {
  title: "Catálogo de Singles",
  description:
    "Explorá el catálogo completo de cartas Yu-Gi-Oh! singles. Filtrá por rareza, tipo, set y precio.",
  alternates: { canonical: "/singles" },
};

/** @param {{ searchParams: Record<string, string> }} props */
export default async function SinglesRoute(/** @type {{ searchParams: Record<string, string> }} */ { searchParams }) {
  const catalogUrlState = parseCatalogSearchParams(searchParams);
  const initialData = await fetchCatalogCards({
    page: catalogUrlState.page,
    pageSize: CATALOG_PAGE_SIZE,
    search: catalogUrlState.search,
    rarities: catalogUrlState.filters.rarities,
    cardTypes: catalogUrlState.filters.cardTypes,
    conditions: catalogUrlState.filters.conditions,
    sets: catalogUrlState.filters.sets,
    priceRange: catalogUrlState.filters.priceRange
      ? {
          min: catalogUrlState.filters.priceRange.min,
          max: catalogUrlState.filters.priceRange.max ?? undefined,
        }
      : undefined,
  }).catch(() => null);

  return (
    <Suspense fallback={null}>
      <SinglesPage initialData={initialData} />
    </Suspense>
  );
}