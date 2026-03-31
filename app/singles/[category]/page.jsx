import { Suspense } from "react";

import { CATALOG_PAGE_SIZE, fetchCatalogCards } from "@/api/store";
import { parseCatalogSearchParams } from "@/lib/catalog-url-state";
import SinglesPage from "@/next/pages/SinglesPage.jsx";

export const revalidate = 45;

const CATEGORY_LABELS = {
  monster: "Monstruos",
  spell: "Magias",
  trap: "Trampas",
};

/** @param {{ params: { category: string } }} props */
export async function generateMetadata(/** @type {{ params: { category: string } }} */ { params }) {
  const slug = params.category;
  const label = /** @type {Record<string, string>} */ (CATEGORY_LABELS)[slug?.toLowerCase()] || slug || "Singles";
  return {
    title: `${label} — Catálogo`,
    description: `Cartas Yu-Gi-Oh! de tipo ${label}. Encontrá singles con stock real y condición verificada.`,
    alternates: { canonical: `/singles/${slug}` },
  };
}

/** @param {{ params: { category: string }, searchParams: Record<string, string> }} props */
export default async function SinglesCategoryRoute(/** @type {{ params: { category: string }, searchParams: Record<string, string> }} */ { params, searchParams }) {
  const catalogUrlState = parseCatalogSearchParams(searchParams);
  const initialData = await fetchCatalogCards({
    page: catalogUrlState.page,
    pageSize: CATALOG_PAGE_SIZE,
    search: catalogUrlState.search,
    category: params.category,
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
      <SinglesPage category={params.category} initialData={initialData} />
    </Suspense>
  );
}