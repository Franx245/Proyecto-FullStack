import { memo, useCallback, useMemo, useState } from "react";
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
 *   language?: string,
 * }} RelatedCard
 */

const MOBILE_INITIAL = 4;
const DESKTOP_INITIAL = 8;

/** @typedef {{ card: RelatedCard, index: number }} RelatedCardItemProps */

/** @param {RelatedCardItemProps} props */
function RelatedCardItemBase({ card, index }) {
  return (
    <Link
      href={buildCardPath({ id: card.id }, card.name)}
      className="group flex-shrink-0 w-[140px] sm:w-auto rounded-xl border border-border bg-background/50 p-2.5 transition hover:border-primary/30 hover:shadow-md snap-start"
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg mb-2">
        <CardImage
          id={card.ygopro_id}
          name={card.name}
          fallbackSrc={card.image}
          variant="thumb"
          loading={index < 2 ? "eager" : "lazy"}
          className="w-full h-full object-contain transition-transform group-hover:scale-105"
        />
      </div>

      <p className="text-xs sm:text-sm font-semibold text-foreground line-clamp-2 leading-tight min-h-[2rem] sm:min-h-[2.5rem]">
        {card.name}
      </p>

      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {card.rarity && card.rarity !== "Unknown" && (
          <RarityBadge rarity={card.rarity} />
        )}
        {card.language && card.language !== "EN" && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20">
            {card.language}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-sm font-bold text-primary">
          {formatPrice(card.price)}
        </span>
        <span className={`text-[10px] font-medium ${card.stock > 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {card.stock > 0 ? `${card.stock} disp.` : "Agotada"}
        </span>
      </div>
    </Link>
  );
}

const RelatedCardItem = memo(RelatedCardItemBase);

/** @param {{ cards: RelatedCard[], currentCardId?: number | string }} props */
export default function RelatedCards({ cards, currentCardId: _currentCardId }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleCards = useMemo(() => {
    if (!cards?.length) return [];
    if (showAll) return cards;
    return cards.slice(0, DESKTOP_INITIAL);
  }, [cards, showAll]);

  const handleShowMore = useCallback(() => setShowAll(true), []);

  if (!cards || cards.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card/80 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="text-base sm:text-lg font-bold text-foreground">Cartas relacionadas</h2>
        <span className="ml-1 text-xs text-muted-foreground">({cards.length})</span>
        <span className="ml-auto">
          {expanded
            ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </span>
      </button>

      {expanded && (
        <>
          {/* Mobile: horizontal scroll */}
          <div className="flex gap-3 mt-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin sm:hidden">
            {cards.slice(0, showAll ? cards.length : MOBILE_INITIAL).map((card, i) => (
              <RelatedCardItem key={card.id} card={card} index={i} />
            ))}
          </div>

          {/* Desktop: grid */}
          <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {visibleCards.map((card, i) => (
              <RelatedCardItem key={card.id} card={card} index={i} />
            ))}
          </div>

          {!showAll && cards.length > MOBILE_INITIAL && (
            <button
              type="button"
              onClick={handleShowMore}
              className="mt-3 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              Mostrar todas ({cards.length})
            </button>
          )}
        </>
      )}
    </section>
  );
}
