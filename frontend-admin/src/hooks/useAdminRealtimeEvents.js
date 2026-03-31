import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildAdminEventStreamUrl, getStoredSession, refreshAdminSession } from "../lib/api";

/* ── Helpers ── */

/**
 * Surgically patch a card inside any admin paginated query.
 * Data shape: { cards: Card[], total, page, ... }
 */
function patchAdminCardsPage(old, cardId, cardSnapshot) {
  if (!old?.cards?.length) return old;

  let changed = false;
  const nextCards = old.cards.map((c) => {
    if (Number(c.id) !== Number(cardId)) return c;
    if (cardSnapshot.updated_at && c.updated_at && new Date(cardSnapshot.updated_at) < new Date(c.updated_at)) return c;
    changed = true;
    return { ...c, ...cardSnapshot };
  });

  return changed ? { ...old, cards: nextCards } : old;
}

/**
 * Admin realtime hook — listens for SSE events and performs
 * surgical React Query cache updates. Falls back to invalidation
 * when events don't carry full card snapshots.
 */
export function useAdminRealtimeEvents(session, onSessionChange) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    const currentSession = getStoredSession();
    const url = buildAdminEventStreamUrl(currentSession);

    if (!url) {
      disconnect();
      return;
    }

    try {
      const probe = await fetch(url, { method: "HEAD" }).catch(() => null);
      if (probe && probe.status === 501) {
        disconnect();
        return;
      }

      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("new-order", () => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });

      es.addEventListener("order-update", () => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });

      es.addEventListener("stock-update", (e) => {
        const { data } = JSON.parse(e.data);
        const cardId = data?.cardId;
        const card = data?.card;

        if (card && cardId) {
          // Surgical: patch all admin card list queries
          queryClient.setQueriesData({ queryKey: ["cards"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["home-cards"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["inventory-cards"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["admin-card-search"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );

          if (card.is_low_stock || card.is_out_of_stock) {
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          }
        } else {
          // Fallback: checkout/expiry — no snapshot
          queryClient.invalidateQueries({ queryKey: ["cards"] });
          queryClient.invalidateQueries({ queryKey: ["home-cards"] });
          queryClient.invalidateQueries({ queryKey: ["inventory-cards"] });
          queryClient.invalidateQueries({ queryKey: ["admin-card-search"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }
      });

      es.addEventListener("price-change", (e) => {
        const { data } = JSON.parse(e.data);
        const cardId = data?.cardId;
        const card = data?.card;

        if (card && cardId) {
          queryClient.setQueriesData({ queryKey: ["cards"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["home-cards"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["inventory-cards"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
          queryClient.setQueriesData({ queryKey: ["admin-card-search"] }, (old) =>
            patchAdminCardsPage(old, cardId, card),
          );
        } else {
          queryClient.invalidateQueries({ queryKey: ["cards"] });
          queryClient.invalidateQueries({ queryKey: ["home-cards"] });
          queryClient.invalidateQueries({ queryKey: ["inventory-cards"] });
          queryClient.invalidateQueries({ queryKey: ["admin-card-search"] });
        }
      });

      es.addEventListener("catalog-synced", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["home-cards"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-cards"] });
        queryClient.invalidateQueries({ queryKey: ["admin-card-search"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });

      es.onerror = async () => {
        es.close();
        eventSourceRef.current = null;

        try {
          const nextSession = await refreshAdminSession();
          onSessionChange?.(nextSession);
        } catch {}

        reconnectTimeoutRef.current = setTimeout(() => {
          void connect();
        }, 5000);
      };
    } catch {
      // Silently degrade
    }
  }, [disconnect, onSessionChange, queryClient]);

  useEffect(() => {
    if (!session?.accessToken) {
      disconnect();
      return undefined;
    }

    void connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, session?.accessToken]);
}
