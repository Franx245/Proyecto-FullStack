"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX, Sparkles } from "lucide-react";
import { toast } from "sonner";

import NextCardItem from "@/next/components/NextCardItem.jsx";
import { useIsMobile } from "@/hooks/use-mobile";
import { persistCatalogScroll, persistLastCatalogHref } from "@/lib/catalog-url-state";
import { useCart } from "@/lib/cartStore";
import { markCatalogVisibleCardCount, recordCatalogGridCommit } from "@/lib/catalog-render-metrics.js";
import { buildCardPath } from "@/lib/seo";
import { formatPrice } from "@/utils/currency";

const CARD_SIZES = "(max-width: 1023px) calc(50vw - 1.5rem), (max-width: 1279px) calc(33.3vw - 2rem), calc(25vw - 2rem)";

function GridSkeletonCard() {
  return (
    <div className="catalog-pending-sheen overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] animate-pulse">
      <div className="aspect-[3/4] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(15,23,42,0.4))]" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-4/5 rounded bg-secondary" />
        <div className="h-4 w-3/5 rounded bg-secondary" />
        <div className="h-10 rounded-2xl bg-secondary" />
      </div>
    </div>
  );
}

/** @param {{ cards?: *[], isLoading?: boolean, isLoadingMore?: boolean, isPending?: boolean, pendingIntent?: "filters" | "pagination" | null, pendingLabel?: string }} props */
export default function NextCardGrid({ cards = [], isLoading = false, isLoadingMore = false, isPending = false, pendingIntent = null, pendingLabel = "" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const { addItem } = useCart();
  const [pendingDetailId, setPendingDetailId] = useState(null);
  const [isDetailNavigationPending, startDetailNavigation] = useTransition();
  const renderStartedAtRef = useRef(0);

  renderStartedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();

  const skeletons = useMemo(() => {
    const count = isLoading ? 8 : 4;
    return Array.from({ length: count }, (_, index) => <GridSkeletonCard key={`skel-${index}`} />);
  }, [isLoading]);
  const showInitialSkeletons = isLoading && cards.length === 0;
  const showInlinePending = (isPending || isLoadingMore) && cards.length > 0;
  const statusLabel = showInlinePending
    ? (pendingLabel || (pendingIntent === "pagination" ? "Cargando nueva página..." : "Refinando catálogo..."))
    : `${cards.length} resultados`;

  const catalogHref = useMemo(() => {
    const query = searchParams?.toString?.() || "";
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    markCatalogVisibleCardCount(cards.length);
  }, [cards.length]);

  useEffect(() => {
    if (!isDetailNavigationPending) {
      setPendingDetailId(null);
    }
  }, [isDetailNavigationPending]);

  useLayoutEffect(() => {
    const commitTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordCatalogGridCommit({
      phase: "commit",
      commitDurationMs: commitTime - renderStartedAtRef.current,
      startTime: renderStartedAtRef.current,
      commitTime,
      visibleCardCount: cards.length,
    });
  });

  const persistCatalogContext = useCallback(() => {
    if (!pathname.startsWith("/singles")) {
      return;
    }

    persistLastCatalogHref(catalogHref);

    if (typeof window !== "undefined") {
      persistCatalogScroll(catalogHref, window.scrollY);
    }
  }, [pathname, catalogHref]);

  const warmDetailData = useCallback(async (card) => {
    const detailId = card?.version_id ?? card?.id ?? card?.ygopro_id;
    const detailPath = buildCardPath(card, card?.name);

    if (detailId && detailPath) {
      await Promise.resolve(router.prefetch(detailPath));
    }
  }, [router]);

  const handleOpenDetail = useCallback((card) => {
    const detailId = card?.version_id ?? card?.id ?? card?.ygopro_id;
    const detailPath = buildCardPath(card, card?.name);

    if (!detailId || !detailPath || isDetailNavigationPending) {
      return;
    }

    setPendingDetailId(String(detailId));
    persistCatalogContext();
    void warmDetailData(card);
    startDetailNavigation(() => {
      router.push(detailPath);
    });
  }, [isDetailNavigationPending, persistCatalogContext, router, startDetailNavigation, warmDetailData]);

  const handleWarmDetail = useCallback((card) => {
    void warmDetailData(card);
  }, [warmDetailData]);

  const handleAddToCart = useCallback((card, qty = 1) => {
    addItem(card, qty);

    toast.success(`${card?.name ?? "Carta"} agregada`, {
      description: `${qty}x · ${formatPrice(card?.price)}`,
    });
  }, [addItem]);

  const renderedCards = useMemo(() => cards.map((card, index) => {
    const detailId = card?.version_id ?? card?.id ?? card?.ygopro_id;
    return (
      <NextCardItem
        key={card?.version_id ?? card?.id ?? card?.ygoproId ?? `card-${index}`}
        card={card}
        priorityImage={index < 4}
        sizes={CARD_SIZES}
        isMobile={isMobile}
        isCatalogPending={showInlinePending}
        isDetailNavigationPending={pendingDetailId != null && String(detailId) === String(pendingDetailId)}
        pendingIntent={pendingIntent}
        onWarmDetail={handleWarmDetail}
        onOpenDetail={handleOpenDetail}
        onAddToCart={handleAddToCart}
      />
    );
  }), [cards, handleAddToCart, handleOpenDetail, handleWarmDetail, isMobile, pendingDetailId, pendingIntent, showInlinePending]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:rounded-[2rem] sm:p-4 md:p-5" data-critical="catalog-shell">
        <div className="mb-4 flex flex-col gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-3 py-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:rounded-[1.4rem] sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Singles catalog</p>
            <p className="mt-1 font-display text-lg font-bold text-white sm:text-xl">Colección activa</p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] sm:px-4 sm:text-xs sm:tracking-[0.2em] ${showInlinePending ? "catalog-feedback-pill border-amber-300/20 bg-amber-300/12 text-amber-100" : "border-emerald-400/15 bg-emerald-400/10 text-emerald-300"}`}>
            <Sparkles className={`h-3.5 w-3.5 ${showInlinePending ? "animate-pulse" : ""}`} />
            {statusLabel}
          </div>
        </div>

        <div className={`relative grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 ${showInlinePending ? "catalog-grid-mask" : ""}`} data-critical="catalog-grid" aria-busy={showInlinePending ? "true" : undefined}>
          {showInitialSkeletons ? skeletons : renderedCards}
          {showInlinePending ? <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" /> : null}
        </div>
      </div>

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