import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import {
  BrowserRouter as Router,
  Route,
  Routes,
} from "react-router-dom";

import { CartProvider } from "@/lib/cartStore";

import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import PageNotFound from "@/lib/PageNotFound";

// Pages
import Home from "@/pages/Home";
import Singles from "@/pages/Singles";
import CardDetail from "@/pages/CardDetail";
import CartPage from "@/pages/Cart";
import CustomCatalog from "@/pages/CustomCatalog";
import CustomProductDetail from "@/pages/CustomProductDetail";
import Orders from "@/pages/Orders";
import Privacy from "@/pages/Privacy";
import Contact from "@/pages/Contact";

function App() {
  return (
      <QueryClientProvider client={queryClientInstance}>
        <CartProvider>
            <Router>
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

                  {/* Static pages */}
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/contact" element={<Contact />} />

                </Route>

                {/* 404 */}
                <Route path="*" element={<PageNotFound />} />
              </Routes>
            </Router>
        </CartProvider>
      </QueryClientProvider>
  
  );
}

export default App;