import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { formatPrice } from "@/utils/currency";
import { buildCardPath } from "@/lib/seo";
import CardImage from "./CardImage";
import RarityBadge from "./RarityBadge";

/**
 * @typedef {{
 *   id: number | string,
 *   ygopro_id?: number | string | null,
 *   name?: string,
 *   image?: string,
 *   set_name?: string,
 *   rarity?: string,
 *   price?: number,
 *   stock?: number,
 *   condition?: string,
 *   language?: string,
 * }} RelatedCard
 */

/** @param {{ cards: RelatedCard[], currentCardId?: number | string }} props */
export default function RelatedCards({ cards, currentCardId: _currentCardId }) {
  const [expanded, setExpanded] = useState(false);

  if (!cards || cards.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card/80 p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Cartas relacionadas</h2>
        <span className="ml-1 text-xs text-muted-foreground">({cards.length})</span>
        <span className="ml-auto">
          {expanded
            ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </span>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-5">
          {cards.map((card) => (
            <Link
              key={card.id}
              href={buildCardPath({ id: card.id }, card.name)}
              className="group rounded-xl border border-border bg-background/50 p-3 transition hover:border-primary/30 hover:shadow-md"
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded-lg mb-2">
                <CardImage
                  id={card.ygopro_id}
                  name={card.name}
                  fallbackSrc={card.image}
                  variant="thumb"
                  className="w-full h-full object-contain transition-transform group-hover:scale-105"
                />
              </div>

              <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight min-h-[2.5rem]">
                {card.name}
              </p>

              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {card.rarity && card.rarity !== "Unknown" && (
                  <RarityBadge rarity={card.rarity} />
                )}
                {card.language && card.language !== "EN" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20">
                    {card.language}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-base font-bold text-primary">
                  {formatPrice(card.price)}
                </span>
                <span className={`text-[11px] font-medium ${card.stock > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {card.stock > 0 ? `${card.stock} disp.` : "Sin stock"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
