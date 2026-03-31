import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENV } from "@/config/env";

/**
 * Hook that listens to SSE events from the backend and
 * automatically invalidates React Query caches.
 *
 * Usage:
 *   useRealtimeEvents()           // storefront (public events)
 *   useRealtimeEvents("admin")    // admin panel (all events)
 */
export function useRealtimeEvents(mode = "public") {
  const queryClient = useQueryClient();
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

      es.addEventListener("stock-update", (e) => {
        const { data } = JSON.parse(e.data);
        // Invalidate the specific card
        if (data.cardId) {
          queryClient.invalidateQueries({ queryKey: ["card", data.cardId] });
          queryClient.invalidateQueries({ queryKey: ["card", String(data.cardId)] });
        }
        // Invalidate catalog lists
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
      });

      es.addEventListener("price-change", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
      });

      es.addEventListener("catalog-synced", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"] });
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
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
        // Reconnect after 5s
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };
    } catch {
      // SSE not supported or network error — silently degrade
    }
  }, [queryClient, mode]);

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
