import { useMemo } from "react";
import { SearchX, Sparkles } from "lucide-react";
import CardItem from "./CardItem";

function GridSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] animate-pulse">
      <div className="aspect-[3/4] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(15,23,42,0.4))]" />

      <div className="space-y-3 p-4">
        <div className="h-4 w-4/5 rounded bg-secondary" />
        <div className="h-4 w-3/5 rounded bg-secondary" />
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="h-10 w-24 rounded-2xl bg-secondary" />
          <div className="h-10 w-20 rounded-2xl bg-secondary" />
        </div>
        <div className="h-9 rounded-2xl bg-secondary" />
      </div>
    </div>
  );
}

/**
 * @param {{
 *  cards: any[],
 *  isLoading?: boolean,
 *  hasMore?: boolean,
 *  onLoadMore?: () => void,
 *  isLoadingMore?: boolean
 * }} props
 */
export default function CardGrid({
  cards = [],
  isLoading = false,
  hasMore = false,
  onLoadMore = () => {},
  isLoadingMore = false,
}) {
  const skeletons = useMemo(() => {
    const count = isLoading ? 8 : 4;

    return Array.from({ length: count }, (_, i) => (
      <GridSkeletonCard key={`skel-${i}`} />
    ));
  }, [isLoading]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:rounded-[2rem] sm:p-4 md:p-5" data-critical="catalog-shell">
        <div className="mb-4 flex flex-col gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-3 py-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:rounded-[1.4rem] sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Singles catalog</p>
            <p className="mt-1 font-display text-lg font-bold text-white sm:text-xl">Colección activa</p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300 sm:px-4 sm:text-xs sm:tracking-[0.2em]">
            <Sparkles className="h-3.5 w-3.5" />
            {cards.length} resultados
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4" data-critical="catalog-grid">
          {cards.map((card, index) => (
            <CardItem key={card?.version_id ?? Math.random()} card={card} priorityImage={index < 4} />
          ))}

        {(isLoading || isLoadingMore) && skeletons}
        </div>
      </div>

      {!isLoading && hasMore && (
        <div className="mt-6 flex justify-center sm:mt-8">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full max-w-sm rounded-2xl border border-emerald-400/15 bg-gradient-to-r from-emerald-400/12 via-emerald-400/8 to-transparent px-6 py-3 text-sm font-semibold text-emerald-300 transition duration-300 hover:border-emerald-400/30 hover:bg-emerald-400/12 disabled:opacity-50"
          >
            {isLoadingMore ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-5 py-16 text-center backdrop-blur-xl sm:rounded-[2rem] sm:px-6 sm:py-20">
          <div className="mb-4 rounded-2xl bg-white/[0.05] p-4 text-muted-foreground">
            <SearchX className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold text-white">No hay resultados para esta búsqueda</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Probá con otro nombre, una rareza distinta o limpiá los filtros para ver más cartas disponibles.
          </p>
        </div>
      )}
    </div>
  );
}