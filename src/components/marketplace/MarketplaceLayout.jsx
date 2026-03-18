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
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />

      <CartDrawer />

      <main className="flex-1">
        <Outlet context={{ searchQuery }} />
      </main>

      <footer className="mt-16 border-t border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/25 via-emerald-300/10 to-transparent shadow-[0_0_24px_rgba(74,222,128,0.18)]">
              <span className="font-display text-xs font-bold tracking-[0.24em] text-emerald-100">YG</span>
            </div>
            <div>
              <p className="font-display text-lg font-bold text-white">DuelVault</p>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Marketplace premium</p>
            </div>
          </div>

          <p className="max-w-xl text-center text-xs leading-6 text-slate-500 md:text-right">
            © {new Date().getFullYear()} DuelVault · No afiliado a Konami
          </p>
        </div>
      </footer>
    </div>
  );
}