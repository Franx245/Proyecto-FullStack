import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ENV } from "@/config/env";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function useCardsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return undefined;
    }

    const channel = supabase
      .channel("cards-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: ENV.SUPABASE_SCHEMA,
          table: ENV.SUPABASE_CARDS_TABLE,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["cards"] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
