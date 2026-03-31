import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildAdminEventStreamUrl, getStoredSession, refreshAdminSession } from "../lib/api";

/**
 * Admin realtime hook — listens for SSE events and
 * auto-invalidates React Query caches for the admin panel.
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
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        if (data?.isLowStock) {
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }
      });

      es.addEventListener("price-change", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
      });

      es.addEventListener("catalog-synced", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
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
