"use client";

import { Suspense, useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { usePathname, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";

import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cartStore";
import {
  commitRouteNavigation,
  ensureStorefrontPerfBootstrap,
  reportHydrationReady,
  trackComponentLifetime,
} from "@/lib/perf-tracing";
import { queryClientInstance, queryPersistOptions } from "@/lib/query-client";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

function RealtimeSync() {
  useRealtimeEvents();
  return null;
}

function StorefrontPerfSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() || "";

  useEffect(() => {
    ensureStorefrontPerfBootstrap();
    return trackComponentLifetime("StorefrontProviders", { pathname, search });
  }, []);

  useEffect(() => {
    reportHydrationReady({ pathname, search });
    const traceId = commitRouteNavigation({ pathname, search });
    return trackComponentLifetime("RouteView", { traceId, pathname, search });
  }, [pathname, search]);

  return null;
}

/** @param {{ children: import("react").ReactNode }} props */
export default function Providers({ children }) {
  return (
    <PersistQueryClientProvider client={queryClientInstance} persistOptions={queryPersistOptions}>
      <AuthProvider>
        <CartProvider>
          <Suspense fallback={null}>
            <StorefrontPerfSync />
          </Suspense>
          <RealtimeSync />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: "rgb(15 23 42)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgb(226 232 240)",
              },
            }}
          />
          {children}
        </CartProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}