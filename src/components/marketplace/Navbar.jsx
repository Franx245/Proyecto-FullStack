import { useState, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShoppingCart, Search, Menu, X, LogOut, Sparkles } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/auth";
import UserAvatar from "@/components/ui/UserAvatar";

/**
 * @param {{ searchQuery?: string, onSearchChange?: (value: string) => void }} props
 */
export default function Navbar({ searchQuery, onSearchChange }) {
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const cartButtonLabel = totalItems > 0
    ? `Abrir carrito con ${totalItems} producto${totalItems === 1 ? "" : "s"}`
    : "Abrir carrito";
  const mobileMenuLabel = mobileOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación";

  const navLinks = [
    { label: "Inicio", to: "/" },
    { label: "Cartas", to: "/singles" },
    { label: "Lotes", to: "/lotes" },
    { label: "Decks", to: "/decks" },
    { label: "Pedidos", to: "/orders" },
  ];

  const isActive = useCallback(
    /** @param {string} path */
    (path) => {
      if (path === "/") return location.pathname === "/";
      return location.pathname.startsWith(path);
    },
    [location.pathname]
  );

  const handleSearch = useCallback(
    /** @param {React.ChangeEvent<HTMLInputElement>} e */
    (e) => {
      const value = e.target.value;
      onSearchChange?.(value);

      if (location.pathname === "/") {
        navigate("/singles");
      }
    },
    [onSearchChange, navigate, location.pathname]
  );

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-400/10 bg-slate-950/65 backdrop-blur-2xl supports-[backdrop-filter]:bg-slate-950/45" data-critical="navbar">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent" />
      <div className="mx-auto max-w-[1400px] px-4 py-3 md:px-6" data-critical="navbar-inner">
        <div className="flex min-w-0 items-center gap-3 lg:gap-5">
          <Link to="/" className="group flex shrink-0 items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/30 via-emerald-300/10 to-transparent shadow-[0_0_24px_rgba(74,222,128,0.22)] transition duration-300 group-hover:scale-105 group-hover:shadow-[0_0_34px_rgba(74,222,128,0.35)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_38%)]" />
              <span className="relative text-sm font-black tracking-[0.24em] text-emerald-100">YG</span>
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="font-display text-xl font-bold leading-none text-white">DuelVault</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">
                <Sparkles className="h-3 w-3" />
                Marketplace premium
              </p>
            </div>
          </Link>

          <nav className="ml-2 hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2 py-2 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-full px-4 py-2 text-sm font-medium transition duration-300 ${
                  isActive(link.to)
                    ? "bg-emerald-400/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.22)]"
                    : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden max-w-xl flex-1 md:block">
            <div className="group relative">
              <div className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/0 blur-xl transition duration-300 group-focus-within:bg-emerald-400/15" />
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition group-focus-within:text-emerald-300" />

              <input
                type="text"
                placeholder="Buscar cartas..."
                value={searchQuery || ""}
                onChange={handleSearch}
                aria-label="Buscar cartas por nombre, tipo o rareza"
                className="h-12 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition placeholder:text-slate-500 focus:border-emerald-400/35 focus:outline-none focus:ring-4 focus:ring-emerald-400/10"
              />
            </div>
          </div>

          <button
            onClick={() => navigate("/cart")}
            aria-label={cartButtonLabel}
            title={cartButtonLabel}
            className="relative shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.06] hover:text-white"
          >
            <ShoppingCart className="h-5 w-5" />

            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-slate-950 shadow-[0_0_18px_rgba(74,222,128,0.6)]">
                {totalItems}
              </span>
            )}
          </button>

          {isAuthenticated ? (
            <div className="hidden items-center gap-2 md:flex">
              <button
                onClick={() => navigate("/account")}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.06] hover:text-white"
              >
                <UserAvatar
                  src={user?.avatar_url}
                  alt={user?.full_name || user?.username || "Usuario"}
                  name={user?.full_name || user?.username || "Usuario"}
                  className="h-7 w-7 rounded-full object-cover"
                  iconClassName="h-4 w-4"
                />
                <span className="max-w-[140px] truncate">{user?.full_name || user?.username}</span>
              </button>
              <button
                onClick={() => logout()}
                className="rounded-full border border-white/10 bg-white/[0.03] p-3 text-slate-400 transition duration-300 hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link to="/auth?redirect=/cart" className="hidden rounded-full border border-emerald-400/20 bg-gradient-to-r from-emerald-400/90 via-lime-400/80 to-emerald-300/90 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(74,222,128,0.25)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(74,222,128,0.35)] md:inline-flex">
              Ingresar
            </Link>
          )}

          <button
            onClick={() => setMobileOpen((p) => !p)}
            aria-label={mobileMenuLabel}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            title={mobileMenuLabel}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-300 hover:bg-white/[0.06] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div className="mt-3 md:hidden">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar cartas..."
              value={searchQuery || ""}
              onChange={handleSearch}
              aria-label="Buscar cartas por nombre, tipo o rareza"
              className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm text-slate-100 transition placeholder:text-slate-500 focus:border-emerald-400/35 focus:outline-none focus:ring-4 focus:ring-emerald-400/10"
            />
          </div>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-navigation" className="space-y-2 border-t border-white/10 bg-slate-950/95 px-4 py-4 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block rounded-2xl px-4 py-3 text-sm transition ${
                isActive(link.to)
                  ? "bg-emerald-400/15 font-medium text-emerald-300"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              <Link to="/account" onClick={() => setMobileOpen(false)} className="block rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
                Mi cuenta
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  setMobileOpen(false);
                }}
                className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link to="/auth?redirect=/cart" onClick={() => setMobileOpen(false)} className="block rounded-2xl bg-gradient-to-r from-emerald-400/90 to-lime-400/80 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95">
              Ingresar / registrarme
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}