import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENV } from "@/config/env";
import { useCart } from "@/lib/cartStore";

/* ── Helpers ── */

/**
 * Surgically patch a card inside a paginated cards query.
 * Returns new object only if something changed (reference equality check).
 */
function patchCardsPage(old, cardId, cardSnapshot) {
  if (!old?.cards?.length) return old;

  let changed = false;
  const nextCards = old.cards.map((c) => {
    if (Number(c.id) !== Number(cardId)) return c;
    // Skip if the SSE snapshot is older
    if (cardSnapshot.updated_at && c.updated_at && new Date(cardSnapshot.updated_at) < new Date(c.updated_at)) return c;
    changed = true;
    return { ...c, ...cardSnapshot };
  });

  return changed ? { ...old, cards: nextCards } : old;
}

/**
 * Surgically patch the card-detail query.
 */
function patchCardDetail(old, cardSnapshot) {
  if (!old?.card) return old;
  if (cardSnapshot.updated_at && old.card.updated_at && new Date(cardSnapshot.updated_at) < new Date(old.card.updated_at)) return old;
  return { ...old, card: { ...old.card, ...cardSnapshot } };
}

/**
 * Hook that listens to SSE events from the backend and
 * performs surgical React Query cache updates — zero refetches
 * for events that carry a full card snapshot.
 *
 * Falls back to selective invalidation for events without card data
 * (checkout, order expiry).
 *
 * Usage:
 *   useRealtimeEvents()           // storefront (public events)
 *   useRealtimeEvents("admin")    // admin panel (all events)
 */
export function useRealtimeEvents(mode = "public") {
  const queryClient = useQueryClient();
  const { patchItemsByCardId } = useCart();
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    const baseUrl = ENV.API_BASE_URL;
    if (!baseUrl) return;

    const path = mode === "admin"
      ? "/api/admin/events/stream"
      : "/api/events/stream";

    const url = `${baseUrl}${path}`;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      /* ── stock-update ── */
      es.addEventListener("stock-update", (e) => {
        const { data } = JSON.parse(e.data);
        const cardId = data?.cardId;
        if (!cardId) return;

        const card = data.card; // Full card snapshot (present on admin edits)

        if (card) {
          // Surgical: patch cards list pages
          queryClient.setQueriesData({ queryKey: ["cards"] }, (old) =>
            patchCardsPage(old, cardId, card),
          );

          // Surgical: patch card detail
          queryClient.setQueriesData({ queryKey: ["card-detail", cardId] }, (old) =>
            patchCardDetail(old, card),
          );
          queryClient.setQueriesData({ queryKey: ["card-detail", String(cardId)] }, (old) =>
            patchCardDetail(old, card),
          );

          // Surgical: patch featured cards
          queryClient.setQueriesData({ queryKey: ["featured-cards"] }, (old) => {
            if (!Array.isArray(old)) return old;
            let changed = false;
            const next = old.map((c) => {
              if (Number(c.id) !== Number(cardId)) return c;
              changed = true;
              return { ...c, ...card };
            });
            return changed ? next : old;
          });

          // Patch cart item stock
          patchItemsByCardId(Number(cardId), { stock: card.stock, price: card.price });
        } else {
          // Fallback: selective invalidation (checkout/expiry — no snapshot)
          queryClient.invalidateQueries({ queryKey: ["card-detail", cardId] });
          queryClient.invalidateQueries({ queryKey: ["card-detail", String(cardId)] });
          queryClient.invalidateQueries({ queryKey: ["cards"] });
        }
      });

      /* ── price-change ── */
      es.addEventListener("price-change", (e) => {
        const { data } = JSON.parse(e.data);
        const cardId = data?.cardId;
        const card = data?.card;

        if (card && cardId) {
          queryClient.setQueriesData({ queryKey: ["cards"] }, (old) =>
            patchCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["card-detail", cardId] }, (old) =>
            patchCardDetail(old, card),
          );
          queryClient.setQueriesData({ queryKey: ["card-detail", String(cardId)] }, (old) =>
            patchCardDetail(old, card),
          );
          queryClient.setQueriesData({ queryKey: ["featured-cards"] }, (old) => {
            if (!Array.isArray(old)) return old;
            let changed = false;
            const next = old.map((c) => {
              if (Number(c.id) !== Number(cardId)) return c;
              changed = true;
              return { ...c, ...card };
            });
            return changed ? next : old;
          });
          patchItemsByCardId(Number(cardId), { price: card.price });
        } else {
          // Bulk price change without per-card snapshot — invalidate
          queryClient.invalidateQueries({ queryKey: ["cards"] });
        }
      });

      /* ── catalog-synced (full sync — invalidate) ── */
      es.addEventListener("catalog-synced", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["filters"] });
      });

      if (mode === "admin") {
        es.addEventListener("new-order", () => {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        });

        es.addEventListener("order-update", () => {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        });
      }

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };
    } catch {
      // SSE not supported or network error — silently degrade
    }
  }, [queryClient, patchItemsByCardId, mode]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);
}
