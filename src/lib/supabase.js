import { createClient } from "@supabase/supabase-js";

import { ENV } from "@/config/env";

let supabaseClient = null;

function hasValidSupabaseUrl() {
  if (!ENV.SUPABASE_URL) {
    return false;
  }

  try {
    const parsed = new URL(ENV.SUPABASE_URL);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function getSupabaseBrowserClient() {
  if (!ENV.ENABLE_SUPABASE_REALTIME || !hasValidSupabaseUrl() || !ENV.SUPABASE_ANON_KEY) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseClient;
}
