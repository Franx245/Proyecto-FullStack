import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import StoreFooter from "./StoreFooter";

/** @param {() => void} callback */
function scheduleIdleTask(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const callbackId = window.requestIdleCallback(callback, { timeout: 1600 });
    return () => window.cancelIdleCallback?.(callbackId);
  }

  const timeoutId = globalThis.setTimeout(callback, 220);
  return () => globalThis.clearTimeout(timeoutId);
}

const loadCartDrawer = () => import("./CartDrawer");
const CartDrawer = lazy(loadCartDrawer);

export default function MarketplaceLayout() {
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    return scheduleIdleTask(() => {
      void loadCartDrawer();
    });
  }, []);

  const handleSearchChange = useCallback(
    /** @param {string} value */
    (value) => {
      setSearchQuery(value);
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-background" data-critical="page-shell">
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />

      <Suspense fallback={null}>
        <CartDrawer />
      </Suspense>

      <main className="flex-1 min-h-[calc(100svh-4.5rem)] md:min-h-[calc(100svh-5rem)]" data-critical="page-main">
        <Outlet context={{ searchQuery }} />
      </main>

      <StoreFooter />
    </div>
  );
}