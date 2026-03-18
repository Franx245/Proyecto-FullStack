import { useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

import RarityBadge from "./RarityBadge";
import QuantitySelector from "./QuantitySelector";

/**
 * @typedef {{
 *  version_id: string | number,
 *  name?: string,
 *  image?: string,
 *  set_name?: string,
 *  set_code?: string,
 *  rarity?: string,
 *  price?: number,
 *  stock?: number,
 *  condition?: string
 * }} CardVersion
 */

/**
 * @param {{ stock?: number | null }} props
 */
function StockBadge({ stock }) {
  if (stock == null) return null;

  if (stock === 0) {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive/20 text-destructive border border-destructive/30">
        Sin stock
      </span>
    );
  }

  if (stock <= 3) {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-900/40 text-yellow-300 border border-yellow-700/40">
        {stock} restantes
      </span>
    );
  }

  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/25">
      Disponible
    </span>
  );
}

/**
 * @param {{ versions?: CardVersion[], isLoading?: boolean }} props
 */
export default function CardVersionsTable({ versions = [], isLoading }) {
  const { addItem } = useCart();
  const isMobile = useIsMobile();

  const handleAdd = useCallback(
    /** @param {CardVersion} version @param {number} qty */
    (version, qty) => {
      addItem(
        {
          version_id: String(version.version_id),
          name: version.name ?? "Carta",
          price: version.price ?? 0,
          rarity: version.rarity,
          image: version.image,
          set_name: version.set_name,
          stock: version.stock,
        },
        qty
      );

      toast.success(`${version.name ?? "Carta"} agregado`, {
        description: `${qty}x · ${version.rarity ?? "Sin rareza"}`,
      });
    },
    [addItem]
  );

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-tight">
          Versiones disponibles
        </h2>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">

        {/* Desktop header */}
        <div className="hidden md:grid grid-cols-[80px_1fr_140px_120px_120px_140px] gap-4 px-5 py-3 border-b border-border bg-secondary/30">
          {["Imagen", "Set", "Rareza", "Precio", "Stock", "Acción"].map((h) => (
            <span
              key={h}
              className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground"
            >
              {h}
            </span>
          ))}
        </div>

        {/* Loading */}
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 px-5 py-4 border-b border-border animate-pulse"
            >
              <div className="w-14 h-20 bg-secondary rounded" />
              <div className="flex-1 space-y-2 py-2">
                <div className="h-4 bg-secondary rounded w-48" />
                <div className="h-3 bg-secondary rounded w-24" />
              </div>
            </div>
          ))
        ) : versions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No hay versiones disponibles.
          </div>
        ) : (
          versions.map((version, idx) => (
            <motion.div
              key={version.version_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="group grid grid-cols-1 gap-4 border-b border-border px-4 py-4 transition-colors last:border-0 hover:bg-secondary/30 md:grid-cols-[80px_1fr_140px_120px_120px_140px] md:items-center md:px-5"
            >
              {/* Image */}
              <div className="flex items-start gap-4 md:block">
              <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary md:h-20 md:w-14">
                {version.image ? (
                  <img
                    src={version.image}
                    alt={version.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    N/A
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 md:hidden">
                <p className="text-sm font-semibold leading-5 text-white">
                  {version.set_name || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {version.set_code || "—"}
                </p>
                {version.condition && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {version.condition}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <RarityBadge rarity={version.rarity} />
                  <StockBadge stock={version.stock} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-lg font-bold text-primary">
                    ${version.price?.toFixed(2) ?? "—"}
                  </span>
                </div>
              </div>
              </div>

              <div className="hidden md:block">
                <p className="font-semibold text-sm">
                  {version.set_name || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {version.set_code || "—"}
                </p>
                {version.condition && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {version.condition}
                  </p>
                )}
              </div>

              {/* Rarity */}
              <div className="hidden md:block">
                <RarityBadge rarity={version.rarity} />
              </div>

              {/* Price */}
              <div className="hidden md:block">
                <span className="text-lg font-bold text-primary">
                  ${version.price?.toFixed(2) ?? "—"}
                </span>
              </div>

              {/* Stock */}
              <div className="hidden md:block">
                <StockBadge stock={version.stock} />
              </div>

              {/* Action */}
              <div className={isMobile ? "md:col-auto" : ""}>
                <QuantitySelector
                  onConfirm={(qty) => handleAdd(version, qty)}
                  maxStock={version.stock ?? 0}
                  disabled={version.stock === 0}
                />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}