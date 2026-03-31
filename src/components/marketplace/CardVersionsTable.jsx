import { useCallback } from "react";
import { motion } from "framer-motion";
import { ShoppingCart, ShieldCheck } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";

import RarityBadge from "./RarityBadge";
import QuantitySelector from "./QuantitySelector";
import CardImage from "./CardImage";

/**
 * @typedef {{
 *  version_id: string | number,
 *  card_id?: string | number,
 *  ygopro_id?: string | number,
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
 * @param {{ versions?: CardVersion[], isLoading?: boolean, onOpenDetail?: (version: CardVersion) => void, onOpenCart?: () => void }} props
 */
export default function CardVersionsTable({ versions = [], isLoading, onOpenDetail, onOpenCart }) {
  const { addItem, setIsOpen } = useCart();
  const isMobile = useIsMobile();

  const handleAdd = useCallback(
    /** @param {CardVersion} version @param {number} qty */
    (version, qty) => {
      addItem(
        {
          version_id: String(version.version_id),
          detail_id: String(version.version_id),
          ygopro_id: version.ygopro_id,
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

  const handleOpenDetail = useCallback(
    /** @param {CardVersion} version */
    (version) => {
      const detailId = version?.version_id ?? version?.card_id;
      if (!detailId) {
        return;
      }

      if (typeof onOpenDetail === "function") {
        onOpenDetail(version);
        return;
      }

      if (typeof window !== "undefined") {
        window.location.assign(`/card/${detailId}`);
      }
    },
    [onOpenDetail]
  );

  const handleOpenCart = useCallback(
    /** @param {React.MouseEvent<HTMLButtonElement>} event */
    (event) => {
      event.stopPropagation();

      if (typeof onOpenCart === "function") {
        onOpenCart();
        return;
      }

      setIsOpen(true);
    },
    [onOpenCart, setIsOpen]
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
        <div className="hidden md:grid grid-cols-[80px_minmax(0,1fr)_minmax(190px,1.15fr)_130px_140px_220px] gap-5 px-5 py-3 border-b border-border bg-secondary/30">
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
              onClick={() => handleOpenDetail(version)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleOpenDetail(version);
                }
              }}
              role="button"
              tabIndex={0}
              className="group grid cursor-pointer grid-cols-1 gap-4 border-b border-border px-4 py-4 transition-colors last:border-0 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:grid-cols-[80px_minmax(0,1fr)_minmax(190px,1.15fr)_130px_140px_220px] md:items-center md:px-5"
            >
              {/* Image */}
              <div className="flex items-start gap-4 md:block">
              <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary md:h-20 md:w-14">
                {version.image ? (
                  <CardImage
                    id={version.ygopro_id}
                    name={version.name}
                    fallbackSrc={version.image}
                    sizes="56px"
                    className="h-full w-full object-cover"
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
                  <RarityBadge rarity={version.rarity} className="max-w-[15rem]" />
                  <StockBadge stock={version.stock} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-lg font-bold text-primary">
                    {formatPrice(version.price)}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenCart}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-primary/30 hover:bg-primary/10 hover:text-white"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Ver carrito
                  </button>
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
              <div className="hidden min-w-0 md:block">
                <RarityBadge rarity={version.rarity} className="max-w-full" />
              </div>

              {/* Price */}
              <div className="hidden md:block">
                <span className="text-lg font-bold text-primary">
                  {formatPrice(version.price)}
                </span>
              </div>

              {/* Stock */}
              <div className="hidden md:block">
                <StockBadge stock={version.stock} />
              </div>

              {/* Action */}
              <div className={isMobile ? "md:col-auto" : "min-w-0 md:justify-self-center"}>
                <div className="flex flex-col gap-2 md:w-[190px]" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={handleOpenCart}
                    className="hidden h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-100 transition hover:border-primary/30 hover:bg-primary/10 hover:text-white md:inline-flex"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Ver carrito
                  </button>
                  <QuantitySelector
                    onConfirm={(qty) => handleAdd(version, qty)}
                    maxStock={version.stock ?? 0}
                    disabled={version.stock === 0}
                  />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}