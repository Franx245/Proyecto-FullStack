import { Suspense, lazy, useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "sonner";
import {
  buildCardsQueryKey,
  queryClientInstance,
  queryPersistOptions,
} from "@/lib/query-client";
import {
  BrowserRouter as Router,
  Route,
  Routes,
} from "react-router-dom";
import {
  CATALOG_PAGE_SIZE,
  CATALOG_QUERY_STALE_TIME,
  fetchCatalogCards,
  fetchCardSets,
} from "@/api/store";

import { CartProvider } from "@/lib/cartStore";
import { AuthProvider } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCardsRealtime } from "@/hooks/useCardsRealtime";

import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import PageNotFound from "@/lib/PageNotFound";
import Singles from "@/pages/Singles";

const loadHome = () => import("@/pages/Home");
const loadCardDetail = () => import("@/pages/CardDetail");
const loadCartPage = () => import("@/pages/Cart");
const loadContact = () => import("@/pages/Contact");
const loadCustomCatalog = () => import("@/pages/CustomCatalog");
const loadCustomProductDetail = () => import("@/pages/CustomProductDetail");
const loadPrivacy = () => import("@/pages/Privacy");
const loadOrders = () => import("@/pages/Orders");
const loadAuthPage = () => import("@/pages/Auth");
const loadAccount = () => import("@/pages/Account");

const Home = lazy(loadHome);
const CardDetail = lazy(loadCardDetail);
const CartPage = lazy(loadCartPage);
const Contact = lazy(loadContact);
const CustomCatalog = lazy(loadCustomCatalog);
const CustomProductDetail = lazy(loadCustomProductDetail);
const Privacy = lazy(loadPrivacy);
const Orders = lazy(loadOrders);
const AuthPage = lazy(loadAuthPage);
const Account = lazy(loadAccount);

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

const INITIAL_CATALOG_SERVER_FILTERS = Object.freeze({
  rarities: [],
  cardTypes: [],
  conditions: [],
  sets: [],
  priceRange: null,
});

function DataLayerEffects() {
  useCardsRealtime();

  useEffect(() => {
    const cancelIdlePreload = scheduleIdleTask(() => {
      void Promise.allSettled([
        loadHome(),
        loadCardDetail(),
        loadCartPage(),
        loadOrders(),
        loadAuthPage(),
        loadAccount(),
      ]);
    });

    return cancelIdlePreload;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const path = window.location.pathname;
    if (!path.startsWith("/singles")) {
      return;
    }

    const category = decodeURIComponent(path.split("/")[2] || "").trim() || undefined;

    queryClientInstance.prefetchQuery({
      queryKey: buildCardsQueryKey({
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
        search: "",
        category,
        mainFilter: null,
      }),
      queryFn: () =>
        fetchCatalogCards({
          page: 1,
          pageSize: CATALOG_PAGE_SIZE,
          category,
          rarities: INITIAL_CATALOG_SERVER_FILTERS.rarities,
          cardTypes: INITIAL_CATALOG_SERVER_FILTERS.cardTypes,
          conditions: INITIAL_CATALOG_SERVER_FILTERS.conditions,
          sets: INITIAL_CATALOG_SERVER_FILTERS.sets,
          priceRange: INITIAL_CATALOG_SERVER_FILTERS.priceRange,
        }),
      staleTime: CATALOG_QUERY_STALE_TIME,
    });

    queryClientInstance.prefetchQuery({
      queryKey: ["ygopro-card-sets"],
      queryFn: fetchCardSets,
      staleTime: CATALOG_QUERY_STALE_TIME,
    });
  }, []);

  return null;
}

function RouteLoadingFallback() {
  return (
    <div className="mx-auto flex min-h-[36vh] w-full max-w-[1400px] items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      Preparando vista...
    </div>
  );
}

function App() {
  useIsMobile();

  return (
      <PersistQueryClientProvider client={queryClientInstance} persistOptions={queryPersistOptions}>
        <DataLayerEffects />
        <AuthProvider>
          <CartProvider>
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
            <Router>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                  <Route element={<MarketplaceLayout />}>
                  
                  {/* Home */}
                  <Route path="/" element={<Home />} />

                  {/* Catalog */}
                  <Route path="/singles" element={<Singles />} />
                  <Route path="/singles/:category" element={<Singles />} />
                  <Route path="/custom" element={<CustomCatalog />} />
                  <Route path="/custom/product/:slug" element={<CustomProductDetail />} />
                  <Route path="/custom/*" element={<CustomCatalog />} />

                  {/* Card detail */}
                  <Route path="/card/:id" element={<CardDetail />} />

                  {/* Cart & Orders */}
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/account" element={<Account />} />

                  {/* Static pages */}
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/contact" element={<Contact />} />

                </Route>

                {/* 404 */}
                <Route path="*" element={<PageNotFound />} />
                </Routes>
              </Suspense>
            </Router>
          </CartProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
  
  );
}

export default App;