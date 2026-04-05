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
 * Surgically patch an order inside any admin orders query.
 * Data shape: { orders: Order[], summary, ... }
 */
function patchAdminOrdersPage(old, orderId, orderSnapshot) {
  if (!old?.orders?.length) return old;

  let changed = false;
  const nextOrders = old.orders.map((o) => {
    if (Number(o.id) !== Number(orderId)) return o;
    if (orderSnapshot.updated_at && o.updated_at && new Date(orderSnapshot.updated_at) < new Date(o.updated_at)) return o;
    changed = true;
    return { ...o, ...orderSnapshot };
  });

  return changed ? { ...old, orders: nextOrders } : old;
}

const ADMIN_CARD_KEYS = ["cards", "home-cards", "inventory-cards", "admin-card-search"];

function invalidateAdminCardQueries(queryClient) {
  for (const key of ADMIN_CARD_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
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

      const handleOrderUpdate = (e) => {
        try {
          const { data } = JSON.parse(e.data);
          const orderSnapshot = data?.order;
          const orderId = data?.orderId;

          if (orderSnapshot && orderId) {
            queryClient.setQueriesData({ queryKey: ["orders"] }, (old) =>
              patchAdminOrdersPage(old, orderId, orderSnapshot)
            );

            const entityKey = ["order", Number(orderId)];
            queryClient.setQueriesData({ queryKey: entityKey }, (old) =>
              old ? { ...old, ...orderSnapshot } : old
            );
          } else {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
          }
        } catch {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        }
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      };

      es.addEventListener("order-update", handleOrderUpdate);
      es.addEventListener("order-updated", handleOrderUpdate);

      es.addEventListener("stock-update", (e) => {
        const { data } = JSON.parse(e.data);

        const entries = data?.bulk
          ? (data.cards || [])
          : data?.cardId ? [{ cardId: data.cardId, card: data.card }] : [];

        if (!entries.length) return;

        const hasSnapshots = entries.some((en) => en.card);

        if (hasSnapshots) {
          for (const key of ADMIN_CARD_KEYS) {
            queryClient.setQueriesData({ queryKey: [key] }, (old) => {
              let result = old;
              for (const { cardId, card } of entries) {
                if (card) result = patchAdminCardsPage(result, cardId, card);
              }
              return result;
            });
          }

          if (entries.some((en) => en.card?.is_low_stock || en.card?.is_out_of_stock)) {
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          }
        } else {
          for (const key of ADMIN_CARD_KEYS) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }
      });

      es.addEventListener("price-change", (e) => {
        const { data } = JSON.parse(e.data);

        const entries = data?.bulk
          ? (data.cards || [])
          : data?.cardId ? [{ cardId: data.cardId, card: data.card }] : [];

        if (!entries.length) return;

        const hasSnapshots = entries.some((en) => en.card);

        if (hasSnapshots) {
          for (const key of ADMIN_CARD_KEYS) {
            queryClient.setQueriesData({ queryKey: [key] }, (old) => {
              let result = old;
              for (const { cardId, card } of entries) {
                if (card) result = patchAdminCardsPage(result, cardId, card);
              }
              return result;
            });
          }
        } else {
          for (const key of ADMIN_CARD_KEYS) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        }
      });

      es.addEventListener("visibility-change", () => {
        invalidateAdminCardQueries(queryClient);
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });

      es.addEventListener("catalog-synced", () => {
        invalidateAdminCardQueries(queryClient);
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
