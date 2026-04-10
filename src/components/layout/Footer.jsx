"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";

import { fetchStorefrontConfig } from "@/api/store";
import { LayoutLink } from "@/components/layout/Navigation.jsx";
import { retainPreviousData } from "@/lib/query-client";

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
 *   catalogHref: string,
 * }} props
 */
export default function Footer({ catalogHref }) {
  const footerGroups = [
    {
      title: "Explorar",
      links: [
        { label: "Inicio", href: "/" },
        { label: "Cartas sueltas", href: catalogHref },
        { label: "Lotes", href: "/lotes" },
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
  ];
  const storefrontConfigQuery = useQuery({
    queryKey: ["storefront-config"],
    queryFn: fetchStorefrontConfig,
    staleTime: 1000 * 60 * 5,
    placeholderData: retainPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
  });
  const supportPhone = storefrontConfigQuery.data?.storefront?.support_whatsapp_number || "";
  const supportEmail = storefrontConfigQuery.data?.storefront?.support_email || "";
  const contactItems = [
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

  // 🔹 El footer es dueño de los datos de contacto que solo usa esta sección.
  // 🔸 Así el layout global no depende de una query que no afecta el header ni el main.
  // ⚠️ No subir esta query otra vez al shell: volvería a inflar responsabilidades.
  return (
    <footer className="mt-16 border-t border-emerald-400/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(2,6,23,1))] sm:mt-24">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:py-10 md:px-6 md:py-12">
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-[1.15fr_0.7fr_0.7fr_1fr] xl:gap-10">
          <div className="sm:col-span-2 xl:col-span-1">
            <Link href="/" className="group relative inline-flex items-center">
              <div className="pointer-events-none absolute inset-x-4 top-1/2 h-8 -translate-y-1/2 rounded-full bg-emerald-400/12 blur-3xl opacity-80" />
              <div className="relative hidden h-[44px] w-[128px] items-center overflow-visible sm:flex sm:h-[66px] sm:w-[190px]">
                <img src="/logo.jpg" alt="RareHunter" draggable={false} className="h-full w-full scale-[1.28] object-contain object-center drop-shadow-[0_0_26px_rgba(74,222,128,0.22)] transition duration-300 group-hover:scale-[1.32]" />
              </div>
              <span className="relative font-display text-xl font-bold text-white sm:hidden">RareHunter</span>
            </Link>

            <p className="hidden text-[10px] uppercase tracking-[0.24em] text-emerald-300/70 sm:mt-4 sm:block sm:text-xs">Cartas Yu-Gi-Oh · RareHunter</p>
            <p className="mt-4 max-w-sm text-xs leading-6 text-slate-400 sm:mt-6 sm:text-sm sm:leading-7">
              Tu destino para cartas, accesorios y productos sellados. Catálogo curado, stock real y una experiencia pensada para compradores competitivos.
            </p>
          </div>

          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-base font-bold text-white sm:text-lg">{group.title}</h2>
              <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-400 sm:mt-5 sm:gap-3">
                {group.links.map((link) => (
                  <LayoutLink
                    key={link.href + link.label}
                    href={link.href}
                    className="transition hover:text-emerald-300"
                  >
                    {link.label}
                  </LayoutLink>
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
  );
}