import { useState, useCallback } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import FiltersSidebar from "./FiltersSidebar";

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
 * @param {{
 *  filters: Filters,
 *  onFilterChange: (filters: Filters) => void,
 *  onClearFilters: () => void,
 *  sets?: string[]
 * }} props
 */
export default function MobileFilters({
  filters,
  onFilterChange,
  onClearFilters,
  sets,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const hasFilters =
    filters.rarities?.length ||
    filters.cardTypes?.length ||
    filters.conditions?.length ||
    filters.sets?.length ||
    filters.priceRange;

  const close = useCallback(() => setIsOpen(false), []);

  const handleChange = useCallback(
    /** @param {Filters} newFilters */
    (newFilters) => {
      onFilterChange(newFilters);
    },
    [onFilterChange]
  );

  const handleClear = useCallback(() => {
    onClearFilters();
  }, [onClearFilters]);

  return (
    <>
      {/* 🔘 BUTTON */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm transition hover:bg-secondary/80 min-[420px]:w-auto lg:hidden"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filtros
        {hasFilters ? (
          <span className="w-2 h-2 rounded-full bg-primary" />
        ) : null}
      </button>

      {/* 📱 DRAWER */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 top-0 z-50 flex w-[min(88vw,320px)] flex-col border-r border-border bg-background"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-bold text-lg">Filtros</h2>
                <button
                  onClick={close}
                  className="p-1 rounded-lg hover:bg-secondary transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <FiltersSidebar
                  filters={filters}
                  onFilterChange={handleChange}
                  onClearFilters={handleClear}
                  sets={sets}
                />
              </div>

              {/* Footer (pro UX) */}
              <div className="p-4 border-t border-border">
                <button
                  onClick={close}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
                >
                  Aplicar filtros
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}