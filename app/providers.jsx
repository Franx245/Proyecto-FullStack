"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "sonner";

import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cartStore";
import { queryClientInstance, queryPersistOptions } from "@/lib/query-client";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";

function RealtimeSync() {
  useRealtimeEvents();
  return null;
}

/** @param {{ children: import("react").ReactNode }} props */
export default function Providers({ children }) {
  return (
    <PersistQueryClientProvider client={queryClientInstance} persistOptions={queryPersistOptions}>
      <AuthProvider>
        <CartProvider>
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