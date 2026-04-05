"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { fetchFeaturedCards } from "@/api/store";
import CardSkeleton from "@/components/marketplace/CardSkeleton";
import { retainPreviousData } from "@/lib/query-client";
import NextCardItem from "@/next/components/NextCardItem.jsx";

/** @param {{ title?: string, queryKey?: string[], queryFn?: () => Promise<*>, showHeader?: boolean, initialData?: *[] }} props */
export default function NextFeaturedCards({
  title = "Cartas destacadas",
  queryKey = ["featured-cards"],
  queryFn = () => fetchFeaturedCards(5),
  showHeader = true,
  initialData = undefined,
}) {
  const stableInitialCards = useMemo(
    () => (Array.isArray(initialData) ? initialData : []),
    [initialData],
  );
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const queryResult = useQuery({
    queryKey,
    staleTime: 1000 * 60 * 2,
    ...(stableInitialCards.length > 0 ? { initialData: stableInitialCards } : {}),
    placeholderData: retainPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn,
  });

  const { data, isLoading, isFetching } = queryResult;
  const queryCards = Array.isArray(data) ? data : [];
  const cards = hasMounted
    ? (queryCards.length > 0 ? queryCards : stableInitialCards)
    : stableInitialCards;
  const shouldShowSkeleton = hasMounted && isLoading && cards.length === 0;
  const isBackgroundRefresh = hasMounted && isFetching && !isLoading && cards.length > 0;
  const hasCards = cards.length > 0;

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-12">
      {showHeader ? (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold">
            {title}
            {isBackgroundRefresh ? <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" /> : null}
          </h2>
          <Link href="/singles" className="text-sm text-primary hover:underline">
            Ver todo →
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shouldShowSkeleton
          ? Array.from({ length: 5 }).map((_, index) => <CardSkeleton key={index} />)
          : hasCards
            ? cards.map((/** @type {*} */ card, /** @type {number} */ index) => (
                <NextCardItem key={card.version_id} card={card} priorityImage={index === 0} sizes="(max-width: 639px) calc(50vw - 1.5rem), (max-width: 1023px) calc(33.3vw - 1.5rem), (max-width: 1279px) calc(25vw - 1.5rem), calc(20vw - 1.5rem)" />
              ))
            : (
                <div className="col-span-full rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-6 py-12 text-center backdrop-blur-xl">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-white">No hay cartas para mostrar ahora mismo</p>
                  <p className="mt-2 text-sm text-slate-400">La página mantiene estructura estable y el catálogo completo sigue disponible sin pantallas vacías.</p>
                </div>
              )}
      </div>
    </section>
  );
}