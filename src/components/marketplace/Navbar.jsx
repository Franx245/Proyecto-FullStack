import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShoppingCart, Search, Menu, X } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { fetchVisibleCustomCategoryTree } from "@/api/store";

/**
 * @typedef {{ id: number, name: string, slug: string }} VisibleCustomCategory
 */

/**
 * @param {{ searchQuery?: string, onSearchChange?: (value: string) => void }} props
 */
export default function Navbar({ searchQuery, onSearchChange }) {
  const { totalItems } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { label: "Inicio", to: "/" },
    { label: "Cartas", to: "/singles" },
    { label: "Contacto", to: "/contact" },
  ];

  const customCategoriesQuery = useQuery({
    queryKey: ["visible-custom-categories"],
    staleTime: 1000 * 60 * 5,
    queryFn: fetchVisibleCustomCategoryTree,
  });

  const customLinks = useMemo(() => {
    return /** @type {VisibleCustomCategory[]} */ (customCategoriesQuery.data ?? []).map((category) => ({
      label: category.name,
      to: `/custom/${category.slug}`,
    }));
  }, [customCategoriesQuery.data]);

  const mergedLinks = [...navLinks.slice(0, 2), ...customLinks, navLinks[2]];

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
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1400px] px-4 py-3 md:h-16 md:py-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:gap-4">

          {/* 🧠 LOGO */}
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-black text-primary-foreground">YG</span>
            </div>
            <span className="hidden text-lg font-bold sm:block">DuelVault</span>
          </Link>

          {/* 🧭 NAV DESKTOP */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {mergedLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  isActive(link.to)
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* 🔍 SEARCH DESKTOP */}
          <div className="ml-auto hidden max-w-md flex-1 md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <input
                type="text"
                placeholder="Buscar cartas..."
                value={searchQuery || ""}
                onChange={handleSearch}
                aria-label="Buscar cartas por nombre, tipo o rareza"
                className="h-10 w-full rounded-xl border border-border bg-secondary/90 pl-9 pr-3 text-sm shadow-inner transition placeholder:text-muted-foreground/70 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* 🛒 CART */}
          <button
            onClick={() => navigate("/cart")}
            className="relative shrink-0 rounded-lg p-2 transition hover:bg-secondary"
          >
            <ShoppingCart className="h-5 w-5" />

            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {totalItems}
              </span>
            )}
          </button>

          {/* 📱 MENU MOBILE */}
          <button
            onClick={() => setMobileOpen((p) => !p)}
            className="rounded-lg p-2 transition hover:bg-secondary md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div className="mt-3 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar cartas..."
              value={searchQuery || ""}
              onChange={handleSearch}
              aria-label="Buscar cartas por nombre, tipo o rareza"
              className="h-10 w-full rounded-xl border border-border bg-secondary/90 pl-9 pr-3 text-sm shadow-inner transition placeholder:text-muted-foreground/70 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* 📱 MOBILE MENU */}
      {mobileOpen && (
        <nav className="space-y-1 border-t border-border bg-background px-4 py-3 md:hidden">
          {mergedLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm transition ${
                isActive(link.to)
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}