import { Suspense, lazy, useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
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

const loadSingles = () => import("@/legacy-pages/Singles");
const loadHome = () => import("@/legacy-pages/Home");
const loadCardDetail = () => import("@/legacy-pages/CardDetail");
const loadCartPage = () => import("@/legacy-pages/Cart");
const loadContact = () => import("@/legacy-pages/Contact");
const loadCustomCatalog = () => import("@/legacy-pages/CustomCatalog");
const loadCustomProductDetail = () => import("@/legacy-pages/CustomProductDetail");
const loadPrivacy = () => import("@/legacy-pages/Privacy");
const loadOrders = () => import("@/legacy-pages/Orders");
const loadOrderPayment = () => import("@/legacy-pages/OrderPayment");
const loadCheckoutResult = () => import("@/legacy-pages/CheckoutResult");
const loadAuthPage = () => import("@/legacy-pages/Auth");
const loadAccount = () => import("@/legacy-pages/Account");

const Singles = lazy(loadSingles);
const Home = lazy(loadHome);
const CardDetail = lazy(loadCardDetail);
const CartPage = lazy(loadCartPage);
const Contact = lazy(loadContact);
const CustomCatalog = lazy(loadCustomCatalog);
const CustomProductDetail = lazy(loadCustomProductDetail);
const Privacy = lazy(loadPrivacy);
const Orders = lazy(loadOrders);
const OrderPayment = lazy(loadOrderPayment);
const CheckoutResult = lazy(loadCheckoutResult);
const AuthPage = lazy(loadAuthPage);
const Account = lazy(loadAccount);
const LazyToaster = lazy(() => import("sonner").then((m) => ({ default: m.Toaster })));

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
  priceRange: undefined,
});

function DataLayerEffects() {
  useCardsRealtime();

  useEffect(() => {
    const cancelIdlePreload = scheduleIdleTask(() => {
      void Promise.allSettled([
        loadSingles(),
        loadHome(),
        loadCardDetail(),
        loadCartPage(),
        loadOrders(),
        loadOrderPayment(),
        loadCheckoutResult(),
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10 animate-pulse">
      <div className="h-6 w-48 rounded bg-secondary mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
            <div className="aspect-[3/4] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(15,23,42,0.4))]" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-4/5 rounded bg-secondary" />
              <div className="h-4 w-3/5 rounded bg-secondary" />
            </div>
          </div>
        ))}
      </div>
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
            <Suspense fallback={null}>
              <LazyToaster
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
            </Suspense>
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
                  <Route path="/checkout/pay/:orderId" element={<OrderPayment />} />
                  <Route path="/checkout/success" element={<CheckoutResult />} />
                  <Route path="/checkout/failure" element={<CheckoutResult />} />
                  <Route path="/checkout/pending" element={<CheckoutResult />} />
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