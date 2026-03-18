import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { SearchX } from "lucide-react";
import CardItem from "./CardItem";
import CardSkeleton from "./CardSkeleton";

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
    const count = isLoading ? 20 : 6;

    return Array.from({ length: count }, (_, i) => (
      <CardSkeleton key={`skel-${i}`} />
    ));
  }, [isLoading]);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        <AnimatePresence mode="popLayout">
          {cards.map((card) => (
            <CardItem key={card?.version_id ?? Math.random()} card={card} />
          ))}
        </AnimatePresence>

        {(isLoading || isLoadingMore) && skeletons}
      </div>

      {!isLoading && hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-8 py-2.5 rounded-lg bg-secondary text-sm font-medium border border-border hover:bg-secondary/80 transition disabled:opacity-50"
          >
            {isLoadingMore ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-20 text-center">
          <div className="mb-4 rounded-2xl bg-secondary p-4 text-muted-foreground">
            <SearchX className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold">No hay resultados para esta búsqueda</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Probá con otro nombre, una rareza distinta o limpiá los filtros para ver más cartas disponibles.
          </p>
        </div>
      )}
    </div>
  );
}