import { ENV } from "@/config/env";

/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let supabaseClient = null;
/** @type {Promise<import("@supabase/supabase-js").SupabaseClient | null> | null} */
let pendingInit = null;

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

/** @returns {Promise<import("@supabase/supabase-js").SupabaseClient | null>} */
export async function getSupabaseBrowserClient() {
  if (!ENV.ENABLE_SUPABASE_REALTIME || !hasValidSupabaseUrl() || !ENV.SUPABASE_ANON_KEY) {
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  if (!pendingInit) {
    pendingInit = import("@supabase/supabase-js").then(({ createClient }) => {
      supabaseClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      return supabaseClient;
    });
  }

  return pendingInit;
}
