import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCart } from "@/lib/cartStore";
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

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18 }}
      className="group bg-card rounded-xl border border-border overflow-hidden cursor-pointer hover:border-primary/30 transition"
      onClick={() => navigate(`/card/${card?.version_id}`)}
    >
      {/* IMAGE */}
      <div className="relative aspect-[3/4] bg-secondary overflow-hidden">
        {card?.image ? (
          <img
            src={card.image}
            alt={card.name ?? "card"}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Sparkles className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}

        {/* ADD TO CART */}
        <div
          className="absolute inset-x-0 bottom-0 p-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition"
          onClick={(e) => e.stopPropagation()}
        >
          <QuantitySelector
            onConfirm={handleAddToCart}
            maxStock={card?.stock ?? 99}
            disabled={!card?.stock}
          />
        </div>
      </div>

      {/* INFO */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium line-clamp-2">
          {card?.name ?? "Sin nombre"}
        </h3>

        <span className={`text-xs ${rarityClass}`}>
          {card?.rarity ?? "Common"}
        </span>

        <div className="flex justify-between items-center pt-1">
          <span className="text-base font-bold text-primary">
            ${card?.price?.toFixed?.(2) ?? "0.00"}
          </span>
        </div>
      </div>
    </motion.article>
  );
}