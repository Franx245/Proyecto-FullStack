import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import QuantitySelector from "./QuantitySelector";

/**
 * @typedef {{
 *  version_id: string | number,
 *  name?: string,
 *  image?: string,
 *  price?: number,
 *  rarity?: string,
 *  stock?: number
 * }} Card
 */

/**
 * @param {{ card: Card }} props
 */
export default function CardItem({ card }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // 🔥 FIX REAL DEL "never"
  const { addItem } =
    /** @type {{ addItem: (card: Card, qty: number) => void }} */ (useCart());

  const rarityColors = {
    Common: "text-muted-foreground",
    Rare: "text-blue-400",
    "Super Rare": "text-sky-400",
    "Ultra Rare": "text-yellow-400",
    "Secret Rare": "text-purple-400",
    "Starlight Rare": "text-pink-400",
  };

  const handleAddToCart = (qty = 1) => {
    addItem(card, qty);

    toast.success(`${card?.name ?? "Carta"} agregada`, {
      description: `${qty}x · $${card?.price?.toFixed?.(2) ?? "0.00"}`,
    });
  };

  // 🔥 type-safe key
  const rarityKey =
    /** @type {keyof typeof rarityColors | undefined} */ (card?.rarity);

  const rarityClass =
    (rarityKey && rarityColors[rarityKey]) ||
    "text-muted-foreground";

  const stock = Number(card?.stock || 0);
  const stockLabel = stock > 0 ? `${stock} disponibles` : "Sin stock";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={isMobile ? undefined : { y: -7, rotateX: 1.5, rotateY: -1.5 }}
      transition={{ duration: 0.22 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_14px_40px_rgba(0,0,0,0.24)] transition duration-300 hover:border-emerald-400/25 hover:shadow-[0_25px_65px_rgba(0,0,0,0.35),0_0_28px_rgba(74,222,128,0.14)] sm:rounded-[1.35rem]"
      onClick={() => navigate(`/card/${card?.version_id}`)}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
        <div className="absolute inset-x-10 top-4 h-20 rounded-full bg-emerald-400/20 blur-3xl" />
      </div>

      <div className="relative aspect-[3/4] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.16),rgba(2,6,23,0.58))]">
        {card?.image ? (
          <img
            src={card.image}
            alt={card.name ?? "card"}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06] group-hover:saturate-[1.08]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        <div className="absolute right-2 top-2 flex items-start justify-end sm:right-3 sm:top-3">
          <div className={`max-w-[9.25rem] rounded-[1.4rem] border border-white/10 bg-slate-950/78 px-3 py-1.5 text-center text-[0.68rem] font-semibold uppercase leading-[1.15] tracking-[0.14em] backdrop-blur-xl sm:max-w-[10.5rem] sm:px-3.5 sm:py-1.5 sm:text-[0.72rem] sm:tracking-[0.17em] ${rarityClass}`}>
            {card?.rarity ?? "Common"}
          </div>
        </div>

        {!isMobile ? (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 hidden translate-y-4 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 lg:block">
            <div className="rounded-[1.15rem] border border-white/12 bg-slate-950/72 p-2.5 backdrop-blur-md">
              <div
                className="pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <QuantitySelector
                  onConfirm={handleAddToCart}
                  maxStock={card?.stock ?? 99}
                  disabled={!card?.stock}
                />
              </div>
            </div>
          </div>
        ) : null}

      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4 lg:gap-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_84px] xl:items-start xl:gap-2">
          <div className="min-w-0 min-h-[3.2rem] sm:min-h-[3.6rem] xl:min-h-[3.2rem]">
            <h3 className="line-clamp-2 break-words text-[0.95rem] font-semibold leading-5 text-white transition duration-300 group-hover:text-emerald-50 sm:text-base xl:text-[1rem] xl:leading-6">
              {card?.name ?? "Sin nombre"}
            </h3>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/10 px-3 py-2.5 sm:block sm:min-w-[112px] sm:px-3 sm:py-2 sm:text-right xl:min-w-[84px] xl:px-2 xl:py-1.5">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-emerald-200/70 sm:tracking-[0.18em]">
              Precio
            </span>
            <span className="block text-lg font-bold leading-none text-emerald-300 sm:mt-1 sm:text-xl xl:text-[1.34rem]">
              ${card?.price?.toFixed?.(2) ?? "0.00"}
            </span>
          </div>
        </div>

        <div className="mt-auto grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400 sm:text-xs">
          <span className={`min-w-0 truncate font-medium ${rarityClass}`}>
            {card?.rarity ?? "Common"}
          </span>
          <span className="text-right leading-4 text-slate-400/90">{stockLabel}</span>
        </div>
      </div>

    </motion.article>
  );
}