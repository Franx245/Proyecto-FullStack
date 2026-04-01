"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Suspense, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Mail, MapPin, Menu, Phone, Search, ShoppingCart, Sparkles, X } from "lucide-react";

import { fetchStorefrontConfig } from "@/api/store";
import UserAvatar from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { readLastCatalogHref } from "@/lib/catalog-url-state";
import { useCart } from "@/lib/cartStore";
import { retainPreviousData } from "@/lib/query-client";
import NextCartDrawer from "@/next/components/NextCartDrawer.jsx";
import useCatalogPrefetch from "@/next/hooks/useCatalogPrefetch";
import { isExternalHref } from "@/next/storefront-links";

/**
 * @param {string | null | undefined} value
 */
function formatPhoneDisplay(value) {
  if (typeof value !== "string") {
    return "Sin configurar";
  }

  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "Sin configurar";
  }

  if (digits.length === 13 && digits.startsWith("549")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return value;
}

/**
 * @param {{
 *   href: string,
 *   children: import("react").ReactNode,
 *   className: string,
 *   onClick?: import("react").MouseEventHandler<HTMLAnchorElement>,
 *   onMouseEnter?: import("react").MouseEventHandler<HTMLAnchorElement>,
 *   onFocus?: import("react").FocusEventHandler<HTMLAnchorElement>
 * }} props
 */
function NavAnchor({ href, children, className, onClick, onMouseEnter, onFocus }) {
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter} onFocus={onFocus}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter} onFocus={onFocus}>
      {children}
    </Link>
  );
}

/**
 * @param {{
 *   pathname: string,
 *   onResolve: (state: { currentSearch: string, catalogHref: string }) => void,
 * }} props
 */
function SearchParamsBridge({ pathname, onResolve }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const currentSearch = pathname.startsWith("/singles") ? searchParams.get("q") || "" : "";
    const catalogHref = pathname.startsWith("/singles")
      ? `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
      : readLastCatalogHref("/singles");

    onResolve({ currentSearch, catalogHref });
  }, [onResolve, pathname, searchParams]);

  return null;
}

/**
 * @param {{ children: import("react").ReactNode }} props
 */
export default function StorefrontShell({ children }) {
  const router = useRouter();
  const prefetchCatalog = useCatalogPrefetch();
  const pathname = usePathname();
  const { user, isAuthenticated, isBootstrapping, logout } = useAuth();
  const { totalItems } = useCart();
  const storefrontConfigQuery = useQuery({
    queryKey: ["storefront-config"],
    queryFn: fetchStorefrontConfig,
    staleTime: 1000 * 60 * 5,
    placeholderData: retainPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const fallbackCatalogHref = pathname.startsWith("/singles") ? pathname : readLastCatalogHref("/singles");
  const [catalogLocationState, setCatalogLocationState] = useState({
    currentSearch: "",
    catalogHref: fallbackCatalogHref,
  });
  const currentSearch = catalogLocationState.currentSearch;
  const [searchQuery, setSearchQuery] = useState(currentSearch);
  const catalogHref = catalogLocationState.catalogHref;
  const displayName = user?.full_name || user?.username || "Usuario";
  const cartButtonLabel = totalItems > 0
    ? `Abrir carrito con ${totalItems} producto${totalItems === 1 ? "" : "s"}`
    : "Abrir carrito";

  const handleResolveCatalogLocation = useCallback(
    /** @type {(nextState: { currentSearch: string, catalogHref: string }) => void} */
    ((nextState) => {
      setCatalogLocationState((currentState) => {
        if (
          currentState.currentSearch === nextState.currentSearch
          && currentState.catalogHref === nextState.catalogHref
        ) {
          return currentState;
        }

        return nextState;
      });
    }),
    []
  );

  useEffect(() => {
    setCatalogLocationState((currentState) => {
      const nextCatalogHref = pathname.startsWith("/singles") ? pathname : readLastCatalogHref("/singles");
      if (currentState.catalogHref === nextCatalogHref && (!pathname.startsWith("/singles") || currentState.currentSearch === "")) {
        return currentState;
      }

      return {
        currentSearch: pathname.startsWith("/singles") ? currentState.currentSearch : "",
        catalogHref: nextCatalogHref,
      };
    });
  }, [pathname]);

  useEffect(() => {
    setSearchQuery(currentSearch);
  }, [currentSearch]);

  const navLinks = useMemo(() => ([
    { label: "Inicio", href: "/" },
    { label: "Cartas", href: catalogHref },
    { label: "Lotes", href: "/lotes" },
    { label: "Decks", href: "/decks" },
    { label: "Pedidos", href: "/orders" },
  ]), [catalogHref]);

  const footerGroups = useMemo(() => ([
    {
      title: "Explorar",
      links: [
        { label: "Inicio", href: "/" },
        { label: "Cartas sueltas", href: catalogHref },
        { label: "Lotes", href: "/lotes" },
        { label: "Decks", href: "/decks" },
        { label: "Pedidos", href: "/orders" },
      ],
    },
    {
      title: "Soporte",
      links: [
        { label: "Contacto", href: "/contact" },
        { label: "Política de privacidad", href: "/privacy" },
        { label: "Términos y condiciones", href: "/terms" },
      ],
    },
  ]), [catalogHref]);

  const contactItems = useMemo(() => {
    const supportPhone = storefrontConfigQuery.data?.storefront?.support_whatsapp_number || "";
    const supportEmail = storefrontConfigQuery.data?.storefront?.support_email || "";

    return [
      {
        icon: MapPin,
        label: "Buenos Aires, Argentina",
        href: null,
      },
      {
        icon: Mail,
        label: supportEmail || "Sin email configurado",
        href: supportEmail ? `mailto:${supportEmail}` : null,
      },
      {
        icon: Phone,
        label: formatPhoneDisplay(supportPhone),
        href: supportPhone ? `https://wa.me/${String(supportPhone).replace(/[^\d]/g, "")}` : null,
      },
    ];
  }, [storefrontConfigQuery.data?.storefront?.support_email, storefrontConfigQuery.data?.storefront?.support_whatsapp_number]);

  /**
   * @param {import("react").ChangeEvent<HTMLInputElement>} event
   */
  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchQuery(value);

    startTransition(() => {
      const targetPath = pathname.startsWith("/singles") ? pathname : "/singles";
      const currentQuery = pathname.startsWith("/singles") ? (catalogHref.split("?")[1] || "") : "";
      const nextParams = new URLSearchParams(currentQuery);

      if (!value.trim()) {
        nextParams.delete("q");
      } else {
        nextParams.set("q", value.trim());
      }

      nextParams.delete("page");

      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${targetPath}?${nextQuery}` : targetPath, { scroll: false });
    });
  };

  /**
   * @param {string} href
   */
  const isActive = (href) => {
    if (isExternalHref(href)) {
      return false;
    }

    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
  };

  /**
   * @param {string} href
   */
  const handleCatalogHover = (href) => {
    if (!href.startsWith("/singles")) {
      if (!isExternalHref(href)) {
        router.prefetch(href);
      }
      return;
    }

    void prefetchCatalog(href);
  };

  const accountHref = isAuthenticated ? "/account" : "/auth?redirect=/cart";

  return (
    <div className="min-h-screen flex flex-col bg-background" data-critical="page-shell">
      {pathname.startsWith("/singles") ? (
        <Suspense fallback={null}>
          <SearchParamsBridge pathname={pathname} onResolve={handleResolveCatalogLocation} />
        </Suspense>
      ) : null}

      <NextCartDrawer />

      <header className="sticky top-0 z-50 border-b border-emerald-400/10 bg-slate-950/65 backdrop-blur-2xl supports-[backdrop-filter]:bg-slate-950/45" data-critical="navbar">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent" />
        <div className="mx-auto max-w-[1400px] px-4 py-3 md:px-6" data-critical="navbar-inner">
          <div className="flex min-w-0 items-center gap-3 lg:gap-5">
            <Link href="/" className="group flex shrink-0 items-center gap-3">
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
                <NavAnchor
                  key={link.href}
                  href={link.href}
                  onMouseEnter={() => handleCatalogHover(link.href)}
                  onFocus={() => handleCatalogHover(link.href)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition duration-300 ${
                    isActive(link.href)
                      ? "bg-emerald-400/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.22)]"
                      : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {link.label}
                </NavAnchor>
              ))}
            </nav>

            <div className="ml-auto hidden max-w-xl flex-1 md:block">
              <div className="group relative">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/0 blur-xl transition duration-300 group-focus-within:bg-emerald-400/15" />
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition group-focus-within:text-emerald-300" />
                <input
                  type="text"
                  placeholder="Buscar cartas..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  aria-label="Buscar cartas por nombre, tipo o rareza"
                  className="h-12 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition placeholder:text-slate-500 focus:border-emerald-400/35 focus:outline-none focus:ring-4 focus:ring-emerald-400/10"
                />
              </div>
            </div>

            <Link
              href="/cart"
              onMouseEnter={() => router.prefetch("/cart")}
              onFocus={() => router.prefetch("/cart")}
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
                <Link href="/account" onMouseEnter={() => router.prefetch("/account")} onFocus={() => router.prefetch("/account")} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.06] hover:text-white">
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
              <Link href="/auth?redirect=/cart" onMouseEnter={() => router.prefetch(accountHref)} onFocus={() => router.prefetch(accountHref)} className="hidden rounded-full border border-emerald-400/20 bg-gradient-to-r from-emerald-400/90 via-lime-400/80 to-emerald-300/90 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(74,222,128,0.25)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(74,222,128,0.35)] md:inline-flex">
                Ingresar
              </Link>
            ) : null}

            <button onClick={() => setMobileOpen((value) => !value)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-300 hover:bg-white/[0.06] md:hidden" aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-3 md:hidden">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cartas..."
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label="Buscar cartas por nombre, tipo o rareza"
                className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm text-slate-100 transition placeholder:text-slate-500 focus:border-emerald-400/35 focus:outline-none focus:ring-4 focus:ring-emerald-400/10"
              />
            </div>
          </div>
        </div>

        {mobileOpen && (
          <nav className="space-y-2 border-t border-white/10 bg-slate-950/95 px-4 py-4 md:hidden">
            {navLinks.map((link) => (
              <NavAnchor
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                onMouseEnter={() => handleCatalogHover(link.href)}
                onFocus={() => handleCatalogHover(link.href)}
                className={`block rounded-2xl px-4 py-3 text-sm transition ${
                  isActive(link.href)
                    ? "bg-emerald-400/15 font-medium text-emerald-300"
                    : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {link.label}
              </NavAnchor>
            ))}
            {isAuthenticated ? (
              <>
                <Link href="/account" onMouseEnter={() => router.prefetch("/account")} onFocus={() => router.prefetch("/account")} onClick={() => setMobileOpen(false)} className="block rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
                  Mi cuenta
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Cerrar sesión
                </button>
              </>
            ) : !isBootstrapping ? (
              <Link href="/auth?redirect=/cart" onMouseEnter={() => router.prefetch(accountHref)} onFocus={() => router.prefetch(accountHref)} className="block rounded-2xl bg-gradient-to-r from-emerald-400/90 to-lime-400/80 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95">
                Ingresar / registrarme
              </Link>
            ) : null}
          </nav>
        )}
      </header>

      <main className="flex-1 min-h-[calc(100svh-4.5rem)] md:min-h-[calc(100svh-5rem)]" data-critical="page-main">
        {children}
      </main>

      <footer className="mt-20 border-t border-emerald-400/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(2,6,23,1))] sm:mt-24">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:py-10 md:px-6 md:py-12">
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.7fr_0.7fr_1fr] xl:gap-10">
            <div className="sm:col-span-2 xl:col-span-1">
              <Link href="/" className="group inline-flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/30 via-emerald-300/10 to-transparent shadow-[0_0_28px_rgba(74,222,128,0.22)] transition duration-300 group-hover:scale-105 sm:h-14 sm:w-14">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_38%)]" />
                  <span className="relative font-display text-lg font-black tracking-[0.2em] text-emerald-100">YG</span>
                </div>
                <div>
                  <p className="font-display text-xl font-bold text-white sm:text-2xl">DuelVault</p>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/75 sm:text-xs sm:tracking-[0.3em]">Marketplace premium</p>
                </div>
              </Link>

              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-400 sm:mt-6 sm:leading-7">
                Tu destino para cartas, accesorios y productos sellados. Catálogo curado, stock real y una experiencia pensada para compradores competitivos.
              </p>
            </div>

            {footerGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-base font-bold text-white sm:text-lg">{group.title}</h2>
                <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-400 sm:mt-5 sm:gap-3">
                  {group.links.map((link) => (
                    <NavAnchor
                      key={link.href + link.label}
                      href={link.href}
                      onMouseEnter={() => handleCatalogHover(link.href)}
                      onFocus={() => handleCatalogHover(link.href)}
                      className="transition hover:text-emerald-300"
                    >
                      {link.label}
                    </NavAnchor>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h2 className="text-base font-bold text-white sm:text-lg">Contáctanos</h2>
              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400 sm:mt-5 sm:gap-4">
                {contactItems.map((item) => {
                  const Icon = item.icon;

                  if (item.href) {
                    return (
                      <a
                        key={item.label}
                        href={item.href}
                        target={item.href.startsWith("http") ? "_blank" : undefined}
                        rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                        className="inline-flex items-center gap-3 transition hover:text-emerald-300"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-amber-300" />
                        <span className="break-all">{item.label}</span>
                      </a>
                    );
                  }

                  return (
                    <div key={item.label} className="inline-flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-amber-300" />
                      <span className="break-words">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-4 text-[11px] text-slate-500 sm:gap-3 sm:py-5 sm:text-xs md:flex-row md:items-center md:justify-between md:px-6">
            <p>© {new Date().getFullYear()} DuelVault. Todos los derechos reservados.</p>
            <p>No afiliado a Konami. Diseño optimizado para la tienda.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}