"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import CardImage from "@/components/marketplace/CardImage";
import QuantitySelector from "@/components/marketplace/QuantitySelector";
import { recordCatalogCardRender } from "@/lib/catalog-render-metrics.js";
import { formatPrice } from "@/utils/currency";

/** @param {{ card: *, priorityImage?: boolean, sizes?: string, isMobile?: boolean, isCatalogPending?: boolean, isDetailNavigationPending?: boolean, pendingIntent?: "filters" | "pagination" | null, showQuickAdd?: boolean, onWarmDetail?: (card: *) => void, onOpenDetail?: (card: *) => void, onAddToCart?: (card: *, qty?: number) => void }} props */
function NextCardItemInner({ card, priorityImage = false, sizes, isMobile = false, isCatalogPending = false, isDetailNavigationPending = false, pendingIntent: _pendingIntent = null, showQuickAdd = true, onWarmDetail, onOpenDetail, onAddToCart }) {
  recordCatalogCardRender(card?.version_id ?? card?.id ?? card?.ygopro_id ?? null);

  const [shouldLoadQuickAdd, setShouldLoadQuickAdd] = useState(false);
  const hoverIntentRef = useRef(0);
  const stock = Number(card?.stock || 0);
  const stockLabel = stock > 0 ? `${stock} disponibles` : "Sin stock";
  const isCardPending = isCatalogPending || isDetailNavigationPending;

  const rarityColors = {
    Common: "text-muted-foreground",
    Rare: "text-blue-400",
    "Super Rare": "text-sky-400",
    "Ultra Rare": "text-yellow-400",
    "Secret Rare": "text-purple-400",
    "Starlight Rare": "text-pink-400",
  };

  const rarityKey = card?.rarity;
  const rarityClass = /** @type {Record<string,string>} */ (rarityColors)[rarityKey] || "text-muted-foreground";

  const clearHoverIntent = useCallback(() => {
    if (hoverIntentRef.current && typeof window !== "undefined") {
      window.clearTimeout(hoverIntentRef.current);
      hoverIntentRef.current = 0;
    }
  }, []);

  useEffect(() => () => {
    clearHoverIntent();
  }, [clearHoverIntent]);

  const handleAddToCart = useCallback((qty = 1) => {
    if (typeof onAddToCart === "function") {
      onAddToCart(card, qty);
    }
  }, [card, onAddToCart]);

  const prepareQuickAdd = useCallback(() => {
    clearHoverIntent();

    if (isMobile || !showQuickAdd) {
      return;
    }

    if (typeof window === "undefined") {
      setShouldLoadQuickAdd(true);
      if (typeof onWarmDetail === "function") {
        onWarmDetail(card);
      }
      return;
    }

    hoverIntentRef.current = window.setTimeout(() => {
      hoverIntentRef.current = 0;
      setShouldLoadQuickAdd(true);

      if (typeof onWarmDetail === "function") {
        onWarmDetail(card);
      }
    }, 60);
  }, [card, clearHoverIntent, isMobile, onWarmDetail, showQuickAdd]);

  const prepareQuickAddFromFocus = useCallback(() => {
    clearHoverIntent();

    if (!isMobile && showQuickAdd) {
      setShouldLoadQuickAdd(true);
    }

    if (typeof onWarmDetail === "function") {
      onWarmDetail(card);
    }
  }, [card, clearHoverIntent, isMobile, onWarmDetail, showQuickAdd]);

  const openDetail = useCallback(() => {
    if (isDetailNavigationPending) {
      return;
    }

    if (typeof onOpenDetail === "function") {
      onOpenDetail(card);
    }
  }, [card, isDetailNavigationPending, onOpenDetail]);

  const handleQuickAddClick = useCallback((/** @type {*} */ event) => {
    event.stopPropagation();
    handleAddToCart(1);
  }, [handleAddToCart]);

  return (
    <article
      className={`catalog-card-surface group relative flex h-full flex-col overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_14px_40px_rgba(0,0,0,0.24)] transition-all duration-200 ease-out hover:-translate-y-[3px] hover:border-emerald-400/25 hover:shadow-[0_25px_65px_rgba(0,0,0,0.35),0_0_28px_rgba(74,222,128,0.14)] active:scale-[0.985] sm:rounded-[1.35rem] ${isDetailNavigationPending ? "pointer-events-none border-emerald-400/35 opacity-80" : ""} ${isCatalogPending ? "catalog-card-pending" : ""}`}
      style={isMobile ? undefined : { transformOrigin: "center top" }}
      onMouseEnter={prepareQuickAdd}
      onMouseLeave={clearHoverIntent}
      onFocusCapture={prepareQuickAddFromFocus}
      onClick={openDetail}
      data-critical="catalog-card"
      aria-busy={isCardPending}
      data-nav-pending={isDetailNavigationPending ? "true" : "false"}
      data-grid-pending={isCatalogPending ? "true" : "false"}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
        <div className="absolute inset-x-10 top-4 h-20 rounded-full bg-emerald-400/20 blur-3xl" />
      </div>

      <div className="relative aspect-[3/4] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.16),rgba(2,6,23,0.58))]" data-critical="catalog-media">
        {card?.image ? (
          <CardImage
            id={card.ygopro_id}
            name={card.name}
            priority={priorityImage}
            fallbackSrc={card.image}
            sizes={sizes || "(max-width: 1023px) calc(50vw - 1.5rem), (max-width: 1279px) calc(33.3vw - 2rem), calc(25vw - 2rem)"}
            className={`h-full w-full object-cover transition duration-500 ease-out ${isCardPending ? "scale-[1.03] blur-[1.5px] saturate-75" : "group-hover:scale-[1.06] group-hover:saturate-[1.08]"}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        {isCardPending ? (
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(2,6,23,0.06),rgba(2,6,23,0.52))]">
            <div className="absolute bottom-3 left-3 h-2.5 w-16 overflow-hidden rounded-full border border-white/12 bg-white/10 sm:bottom-4 sm:left-4">
              <div className={`h-full w-full origin-left ${isDetailNavigationPending ? "bg-emerald-300/85" : "bg-amber-300/75"}`} />
            </div>
          </div>
        ) : null}

        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5 sm:right-3 sm:top-3">
          <div className={`max-w-[9.25rem] rounded-[1.4rem] border border-white/10 bg-slate-950/78 px-3 py-1.5 text-center text-[0.68rem] font-semibold uppercase leading-[1.15] tracking-[0.14em] backdrop-blur-xl sm:max-w-[10.5rem] sm:px-3.5 sm:py-1.5 sm:text-[0.72rem] sm:tracking-[0.17em] ${rarityClass}`}>
            {card?.rarity ?? "Common"}
          </div>
          {Number(card?.version_count || 0) > 1 ? (
            <div className="rounded-full border border-emerald-400/20 bg-emerald-950/80 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-emerald-300 backdrop-blur-xl">
              {card.version_count} versiones
            </div>
          ) : null}
        </div>

        {!isMobile && showQuickAdd ? (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 hidden translate-y-4 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 lg:block">
            <div className="rounded-[1.15rem] border border-white/12 bg-slate-950/72 p-2.5 backdrop-blur-md">
              <div className="pointer-events-auto" onClick={(event) => event.stopPropagation()}>
                {shouldLoadQuickAdd ? (
                  <QuantitySelector
                    onConfirm={handleAddToCart}
                    maxStock={card?.stock ?? 99}
                    disabled={!card?.stock}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleQuickAddClick}
                    disabled={!card?.stock}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500 px-4 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(74,222,128,0.22)] transition-all hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {card?.stock ? "Agregar" : "Sin stock"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4 lg:gap-2.5" data-critical="catalog-body">
        <div className="grid grid-cols-1 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_84px] xl:items-start xl:gap-2">
          <div className="min-w-0 min-h-[3.2rem] sm:min-h-[3.6rem] xl:min-h-[3.2rem]">
            <p className={`line-clamp-2 break-words text-[0.95rem] font-semibold leading-5 text-white transition duration-300 group-hover:text-emerald-50 sm:text-base xl:text-[1rem] xl:leading-6 ${isCardPending ? "opacity-75" : ""}`} data-critical="catalog-title">
              {card?.name ?? "Sin nombre"}
            </p>
          </div>

          <div className={`flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/10 px-3 py-2.5 sm:block sm:min-w-[112px] sm:px-3 sm:py-2 sm:text-right xl:min-w-[84px] xl:px-2 xl:py-1.5 ${isCardPending ? "catalog-pending-sheen" : ""}`}>
            <span className="block text-[10px] uppercase tracking-[0.16em] text-emerald-200/70 sm:tracking-[0.18em]">
              Precio
            </span>
            <span className="block text-lg font-bold leading-none text-emerald-300 sm:mt-1 sm:text-xl xl:text-[1.34rem]" data-critical="catalog-price">
              {formatPrice(card?.price)}
            </span>
          </div>
        </div>

        <div className={`mt-auto grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400 sm:text-xs ${isCardPending ? "border-amber-300/10 bg-amber-300/[0.06]" : ""}`}>
          <span className={`min-w-0 truncate font-medium ${rarityClass}`}>
            {card?.rarity ?? "Common"}
          </span>
          <span className="text-right leading-4 text-slate-400/90">{stockLabel}</span>
        </div>
      </div>
    </article>
  );
}

export default memo(NextCardItemInner);