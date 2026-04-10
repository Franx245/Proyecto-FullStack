"use client";

import Link from "next/link";
import { useState } from "react";
import { LogOut, Menu, ShoppingCart, X } from "lucide-react";

import MobileMenu from "@/components/layout/MobileMenu.jsx";
import Navigation from "@/components/layout/Navigation.jsx";
import SearchBar from "@/components/layout/SearchBar.jsx";
import UserAvatar from "@/components/ui/UserAvatar";

/**
 * @param {{
 *   pathname: string,
 *   catalogHref: string,
 *   searchQuery: string,
 *   onSearchChange: import("react").ChangeEventHandler<HTMLInputElement>,
 *   totalItems: number,
 *   user: { full_name?: string | null, username?: string | null, avatar_url?: string | null } | null,
 *   isAuthenticated: boolean,
 *   isBootstrapping: boolean,
 *   onLogout: () => Promise<void>,
 * }} props
 */
export default function Header({ pathname, catalogHref, searchQuery, onSearchChange, totalItems, user, isAuthenticated, isBootstrapping, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks = [
    { label: "Inicio", href: "/" },
    { label: "Cartas", href: catalogHref },
    { label: "Lotes", href: "/lotes" },
    { label: "Pedidos", href: "/orders" },
  ];
  const displayName = user?.full_name || user?.username || "Usuario";
  const cartButtonLabel = totalItems > 0
    ? `Abrir carrito con ${totalItems} producto${totalItems === 1 ? "" : "s"}`
    : "Abrir carrito";
  const accountHref = isAuthenticated ? "/account" : "/auth?redirect=/cart";

  const handleLogout = async () => {
    // 🔹 El header cierra el menú mobile cuando el usuario sale de sesión.
    // 🔸 Este estado vive acá porque pertenece solo a la UI del header.
    // ⚠️ No mover esto al shell salvo que el menú vuelva a depender del layout completo.
    await onLogout();
    setMobileOpen(false);
  };

  // 🔹 El header reúne navegación, búsqueda, carrito y acceso de usuario.
  // 🔸 StorefrontShell queda liviano y este componente concentra solo UI de cabecera.
  // ⚠️ Mantener el markup intacto para no tocar spacing, sticky header ni responsive.
  return (
    <header className="sticky top-0 z-50 border-b border-emerald-400/10 bg-slate-950/65 backdrop-blur-2xl supports-[backdrop-filter]:bg-slate-950/45" data-critical="navbar">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent" />
      <div className="mx-auto max-w-[1400px] px-4 py-3 md:px-6" data-critical="navbar-inner">
        <div className="flex min-w-0 items-center gap-2.5 lg:gap-5">
          <Link href="/" className="group relative flex shrink-0 items-center pr-1">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-full bg-emerald-400/18 blur-3xl opacity-90 transition duration-300 group-hover:bg-emerald-400/22" />
            <div className="relative flex h-[42px] w-[124px] items-center overflow-visible sm:h-[46px] sm:w-[142px] lg:h-[58px] lg:w-[190px]">
              <img src="/logo.jpg" alt="RareHunter" draggable={false} className="h-full w-full scale-[1.38] object-contain object-center brightness-110 saturate-[1.12] drop-shadow-[0_0_30px_rgba(74,222,128,0.26)] transition duration-300 group-hover:scale-[1.42]" />
            </div>
          </Link>

          <Navigation links={navLinks} pathname={pathname} />

          <div className="ml-auto hidden max-w-xl flex-1 md:block">
            <SearchBar value={searchQuery} onChange={onSearchChange} />
          </div>

          <Link
            href="/cart"
            className="relative shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.06] hover:text-white"
            aria-label={cartButtonLabel}
            title={cartButtonLabel}
          >
            <ShoppingCart className="h-5 w-5" />

            {totalItems > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-slate-950 shadow-[0_0_18px_rgba(74,222,128,0.6)]">
                {totalItems}
              </span>
            ) : null}
          </Link>

          {isAuthenticated ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/account" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.06] hover:text-white">
                <UserAvatar
                  src={user?.avatar_url || undefined}
                  alt={displayName}
                  name={displayName}
                  className="h-7 w-7 rounded-full object-cover"
                  iconClassName="h-4 w-4"
                />
                <span className="max-w-[140px] truncate">{displayName}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/[0.03] p-3 text-slate-400 transition duration-300 hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : !isBootstrapping ? (
            <Link href={accountHref} className="hidden rounded-full border border-emerald-400/20 bg-gradient-to-r from-emerald-400/90 via-lime-400/80 to-emerald-300/90 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(74,222,128,0.25)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(74,222,128,0.35)] md:inline-flex">
              Ingresar
            </Link>
          ) : null}

          <button onClick={() => setMobileOpen((value) => !value)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-300 hover:bg-white/[0.06] md:hidden" aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div className="mt-3 md:hidden">
          <SearchBar mobile value={searchQuery} onChange={onSearchChange} />
        </div>
      </div>

      <MobileMenu
        open={mobileOpen}
        links={navLinks}
        pathname={pathname}
        isAuthenticated={isAuthenticated}
        isBootstrapping={isBootstrapping}
        onClose={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />
    </header>
  );
}