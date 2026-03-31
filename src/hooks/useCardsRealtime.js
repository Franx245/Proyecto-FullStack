import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ENV } from "@/config/env";
import { buildCardsInvalidationFilters } from "@/lib/query-client";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function useCardsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
    let supabase = null;
    /** @type {ReturnType<import("@supabase/supabase-js").SupabaseClient["channel"]> | null} */
    let channel = null;

    getSupabaseBrowserClient().then((client) => {
      if (cancelled || !client) {
        return;
      }

      supabase = client;
      channel = supabase
        .channel("cards-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: ENV.SUPABASE_SCHEMA,
            table: ENV.SUPABASE_CARDS_TABLE,
          },
          /** @param {{ new?: { id?: number | string }, old?: { id?: number | string } }} payload */
          (payload) => {
            const changedCardId = Number(payload.new?.id ?? payload.old?.id);
            void queryClient.invalidateQueries(buildCardsInvalidationFilters({
              cardId: Number.isFinite(changedCardId) ? changedCardId : null,
            }));
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queryClient]);
}
