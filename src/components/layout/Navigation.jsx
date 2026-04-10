"use client";

import Link from "next/link";

import { isExternalHref } from "@/next/storefront-links";

/**
 * @param {string} pathname
 * @param {string} href
 */
export function isLayoutLinkActive(pathname, href) {
  if (isExternalHref(href)) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

/**
 * @param {{
 *   href: string,
 *   children: import("react").ReactNode,
 *   className: string,
 *   onClick?: import("react").MouseEventHandler<HTMLAnchorElement>,
 * }} props
 */
export function LayoutLink({ href, children, className, onClick }) {
  // 🔹 Unifica links internos de Next y anchors externos normales.
  // 🔸 Así Header, Footer y menú mobile comparten la misma regla de navegación.
  // ⚠️ No reemplazar por Link para todo: los href externos dejarían de comportarse bien.
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

/**
 * @param {{
 *   links: Array<{ label: string, href: string }>,
 *   pathname: string,
 * }} props
 */
export default function Navigation({ links, pathname }) {
  // 🔹 Este bloque renderiza solo la navegación principal desktop.
  // 🔸 Se separa para que Header se concentre en orquestar estado y acciones.
  // ⚠️ Mantener clases y estructura para no alterar el diseño visual.
  return (
    <nav className="ml-2 hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2 py-2 md:flex">
      {links.map((link) => {
        const isActive = isLayoutLinkActive(pathname, link.href);

        return (
          <LayoutLink
            key={link.href}
            href={link.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition duration-300 ${
              isActive
                ? "bg-emerald-400/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.22)]"
                : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {link.label}
          </LayoutLink>
        );
      })}
    </nav>
  );
}