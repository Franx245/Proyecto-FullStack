"use client";

import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";

import Footer from "@/components/layout/Footer.jsx";
import Header from "@/components/layout/Header.jsx";
import { CatalogSearchBridge, useCatalogSearch } from "@/hooks/useCatalogSearch";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cartStore";
import NextCartDrawer from "@/next/components/NextCartDrawer.jsx";

/**
 * @param {{ children: import("react").ReactNode }} props
 */
export default function StorefrontShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isBootstrapping, logout } = useAuth();
  const { totalItems } = useCart();
  const {
    catalogHref,
    handleResolveCatalogLocation,
    handleSearchChange,
    searchQuery,
    shouldRenderSearchBridge,
  } = useCatalogSearch({ pathname, router });

  // 🔹 El shell ahora solo orquesta estado global y ensambla piezas de layout.
  // 🔸 Header, Footer y el hook concentran la lógica específica de cada responsabilidad.
  // ⚠️ No volver a meter UI grande acá: se pierde la claridad que gana este refactor.
  return (
    <div className="min-h-screen flex flex-col bg-background" data-critical="page-shell">
      {shouldRenderSearchBridge ? (
        <Suspense fallback={null}>
          <CatalogSearchBridge pathname={pathname} onResolve={handleResolveCatalogLocation} />
        </Suspense>
      ) : null}

      <NextCartDrawer />

      <Header
        pathname={pathname}
        catalogHref={catalogHref}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        totalItems={totalItems}
        user={user}
        isAuthenticated={isAuthenticated}
        isBootstrapping={isBootstrapping}
        onLogout={logout}
      />

      <main className="flex-1 min-h-[calc(100svh-4.5rem)] md:min-h-[calc(100svh-5rem)]" data-critical="page-main">
        {children}
      </main>

      <Footer catalogHref={catalogHref} />
    </div>
  );
}