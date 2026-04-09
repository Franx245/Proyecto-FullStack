"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Mail, MapPin, Menu, Phone, Search, ShoppingCart, X } from "lucide-react";

import { fetchStorefrontConfig } from "@/api/store";
import UserAvatar from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { readLastCatalogHref } from "@/lib/catalog-url-state";
import { useCart } from "@/lib/cartStore";
import { retainPreviousData } from "@/lib/query-client";
import NextCartDrawer from "@/next/components/NextCartDrawer.jsx";
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
 *   onMouseLeave?: import("react").MouseEventHandler<HTMLAnchorElement>,
 *   onFocus?: import("react").FocusEventHandler<HTMLAnchorElement>,
 *   onBlur?: import("react").FocusEventHandler<HTMLAnchorElement>
 * }} props
 */
function NavAnchor({ href, children, className, onClick, onMouseEnter, onMouseLeave, onFocus, onBlur }) {
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onFocus={onFocus} onBlur={onBlur}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onFocus={onFocus} onBlur={onBlur}>
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
  const fallbackCatalogHref = pathname.startsWith("/singles") ? pathname : "/singles";
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
  const prefetchTimersRef = useRef(new Map());

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

  const clearPrefetch = useCallback((href) => {
    const timeoutId = prefetchTimersRef.current.get(href);
    if (!timeoutId || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(timeoutId);
    prefetchTimersRef.current.delete(href);
  }, []);

  useEffect(() => () => {
    if (typeof window === "undefined") {
      return;
    }

    for (const timeoutId of prefetchTimersRef.current.values()) {
      window.clearTimeout(timeoutId);
    }

    prefetchTimersRef.current.clear();
  }, []);

  const schedulePrefetch = useCallback((href) => {
    if (isExternalHref(href)) {
      return;
    }

    clearPrefetch(href);

    if (typeof window === "undefined") {
      router.prefetch(href);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      prefetchTimersRef.current.delete(href);
      router.prefetch(href);
    }, 60);

    prefetchTimersRef.current.set(href, timeoutId);
  }, [clearPrefetch, router]);

  const prefetchNow = useCallback((href) => {
    if (isExternalHref(href)) {
      return;
    }

    clearPrefetch(href);
    router.prefetch(href);
  }, [clearPrefetch, router]);

  const getPrefetchHandlers = useCallback((href) => ({
    onMouseEnter: () => schedulePrefetch(href),
    onMouseLeave: () => clearPrefetch(href),
    onFocus: () => prefetchNow(href),
    onBlur: () => clearPrefetch(href),
  }), [clearPrefetch, prefetchNow, schedulePrefetch]);

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
          <div className="flex min-w-0 items-center gap-2.5 lg:gap-5">
            <Link href="/" className="group relative flex shrink-0 items-center pr-1">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-full bg-emerald-400/18 blur-3xl opacity-90 transition duration-300 group-hover:bg-emerald-400/22" />
              <div className="relative flex h-[42px] w-[124px] items-center overflow-visible sm:h-[46px] sm:w-[142px] lg:h-[58px] lg:w-[190px]">
                <img src="/logo.jpg" alt="RareHunter" draggable={false} className="h-full w-full scale-[1.38] object-contain object-center brightness-110 saturate-[1.12] drop-shadow-[0_0_30px_rgba(74,222,128,0.26)] transition duration-300 group-hover:scale-[1.42]" />
              </div>
            </Link>

            <nav className="ml-2 hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2 py-2 md:flex">
              {navLinks.map((link) => (
                <NavAnchor
                  key={link.href}
                  href={link.href}
                  {...getPrefetchHandlers(link.href)}
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
              {...getPrefetchHandlers("/cart")}
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
                <Link href="/account" {...getPrefetchHandlers("/account")} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.06] hover:text-white">
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
              <Link href="/auth?redirect=/cart" {...getPrefetchHandlers(accountHref)} className="hidden rounded-full border border-emerald-400/20 bg-gradient-to-r from-emerald-400/90 via-lime-400/80 to-emerald-300/90 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(74,222,128,0.25)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(74,222,128,0.35)] md:inline-flex">
                Ingresar
              </Link>
            ) : null}

            <button onClick={() => setMobileOpen((value) => !value)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-300 hover:bg-white/[0.06] md:hidden" aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileOpen}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-3 md:hidden">
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(74,222,128,0.08),transparent_40%)]" />
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cartas..."
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label="Buscar cartas por nombre, tipo o rareza"
                className="relative h-11 w-full bg-transparent pl-11 pr-4 text-sm text-slate-100 transition placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-slate-950/95 px-4 pb-4 pt-3 md:hidden">
            <nav className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
              <div className="grid grid-cols-2 gap-2.5">
                {navLinks.map((link, index) => (
                  <NavAnchor
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    {...getPrefetchHandlers(link.href)}
                    className={`block rounded-[22px] px-4 py-3 text-sm transition ${index === navLinks.length - 1 ? "col-span-2" : ""} ${
                      isActive(link.href)
                        ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(74,222,128,0.1))] font-medium text-emerald-200 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.16),0_16px_34px_rgba(16,185,129,0.08)]"
                        : "bg-white/[0.025] text-slate-300 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {link.label}
                  </NavAnchor>
                ))}
              </div>

              <div className="mt-3 border-t border-white/8 pt-3">
                {isAuthenticated ? (
                  <div className="grid gap-2">
                    <Link href="/account" {...getPrefetchHandlers("/account")} onClick={() => setMobileOpen(false)} className="block rounded-[20px] bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
                      Mi cuenta
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full rounded-[20px] bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                ) : !isBootstrapping ? (
                  <Link href="/auth?redirect=/cart" {...getPrefetchHandlers(accountHref)} onClick={() => setMobileOpen(false)} className="block rounded-[20px] bg-gradient-to-r from-emerald-400/90 to-lime-400/80 px-4 py-3 text-center text-sm font-semibold text-slate-950 shadow-[0_16px_34px_rgba(16,185,129,0.14)] transition hover:opacity-95">
                    Ingresar / registrarme
                  </Link>
                ) : null}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-[calc(100svh-4.5rem)] md:min-h-[calc(100svh-5rem)]" data-critical="page-main">
        {children}
      </main>

      <footer className="mt-16 border-t border-emerald-400/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(2,6,23,1))] sm:mt-24">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:py-10 md:px-6 md:py-12">
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-[1.15fr_0.7fr_0.7fr_1fr] xl:gap-10">
            <div className="sm:col-span-2 xl:col-span-1">
              <Link href="/" className="group relative inline-flex items-center">
                <div className="pointer-events-none absolute inset-x-4 top-1/2 h-8 -translate-y-1/2 rounded-full bg-emerald-400/12 blur-3xl opacity-80" />
                <div className="relative flex h-[44px] w-[128px] items-center overflow-visible sm:h-[66px] sm:w-[190px]">
                  <img src="/logo.jpg" alt="RareHunter" draggable={false} className="h-full w-full scale-[1.28] object-contain object-center drop-shadow-[0_0_26px_rgba(74,222,128,0.22)] transition duration-300 group-hover:scale-[1.32]" />
                </div>
              </Link>

              <p className="mt-3 text-[10px] uppercase tracking-[0.24em] text-emerald-300/70 sm:mt-4 sm:text-xs">Cartas Yu-Gi-Oh · RareHunter</p>
              <p className="mt-4 max-w-sm text-xs leading-6 text-slate-400 sm:mt-6 sm:text-sm sm:leading-7">
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
                      {...getPrefetchHandlers(link.href)}
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
          <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-3 text-[10px] text-slate-500 sm:gap-3 sm:py-5 sm:text-xs md:flex-row md:items-center md:justify-between md:px-6">
            <p>© {new Date().getFullYear()} RareHunter. Todos los derechos reservados.</p>
            <p>No afiliado a Konami. Diseño optimizado para la tienda.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}