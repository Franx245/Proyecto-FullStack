"use client";

import Link from "next/link";

import { isLayoutLinkActive, LayoutLink } from "@/components/layout/Navigation.jsx";

/**
 * @param {{
 *   open: boolean,
 *   links: Array<{ label: string, href: string }>,
 *   pathname: string,
 *   isAuthenticated: boolean,
 *   isBootstrapping: boolean,
 *   onClose: () => void,
 *   onLogout: () => Promise<void>,
 * }} props
 */
export default function MobileMenu({ open, links, pathname, isAuthenticated, isBootstrapping, onClose, onLogout }) {
  if (!open) {
    return null;
  }

  const accountHref = isAuthenticated ? "/account" : "/auth?redirect=/cart";

  // 🔹 Este menú encapsula solo la variante mobile del header.
  // 🔸 Lo dejamos separado porque tiene reglas visuales distintas a desktop.
  // ⚠️ Mantener el cierre al tocar links o logout para no romper la navegación en mobile.
  return (
    <div className="border-t border-white/10 bg-slate-950/95 px-4 pb-4 pt-3 md:hidden">
      <nav className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <div className="grid grid-cols-2 gap-2.5">
          {links.map((link, index) => {
            const isActive = isLayoutLinkActive(pathname, link.href);

            return (
              <LayoutLink
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`block rounded-[22px] px-4 py-3 text-sm transition ${index === links.length - 1 ? "col-span-2" : ""} ${
                  isActive
                    ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(74,222,128,0.1))] font-medium text-emerald-200 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.16),0_16px_34px_rgba(16,185,129,0.08)]"
                    : "bg-white/[0.025] text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {link.label}
              </LayoutLink>
            );
          })}
        </div>

        <div className="mt-3 border-t border-white/8 pt-3">
          {isAuthenticated ? (
            <div className="grid gap-2">
              <Link href="/account" onClick={onClose} className="block rounded-[20px] bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
                Mi cuenta
              </Link>
              <button
                onClick={onLogout}
                className="block w-full rounded-[20px] bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Cerrar sesión
              </button>
            </div>
          ) : !isBootstrapping ? (
            <Link href={accountHref} onClick={onClose} className="block rounded-[20px] bg-gradient-to-r from-emerald-400/90 to-lime-400/80 px-4 py-3 text-center text-sm font-semibold text-slate-950 shadow-[0_16px_34px_rgba(16,185,129,0.14)] transition hover:opacity-95">
              Ingresar / registrarme
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}