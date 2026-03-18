import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import CartDrawer from "./CartDrawer";

export default function MarketplaceLayout() {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = useCallback(
    /** @param {string} value */
    (value) => {
      setSearchQuery(value);
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* 🔝 NAVBAR */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />

      {/* 🛒 CART DRAWER */}
      <CartDrawer />

      {/* 📄 MAIN */}
      <main className="flex-1">
        <Outlet context={{ searchQuery }} />
      </main>

      {/* ⚡ FOOTER GLOBAL (opcional pero pro) */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-[10px] font-black">
                YG
              </span>
            </div>
            <span className="text-sm font-semibold">DuelVault</span>
          </div>

          <p className="text-xs text-muted-foreground text-center md:text-right">
            © {new Date().getFullYear()} DuelVault · No afiliado a Konami
          </p>
        </div>
      </footer>
    </div>
  );
}