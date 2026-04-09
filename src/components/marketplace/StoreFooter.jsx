import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";
import { fetchStorefrontConfig } from "@/api/store";

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

export default function StoreFooter() {
  const storefrontConfigQuery = useQuery({
    queryKey: ["storefront-config"],
    queryFn: fetchStorefrontConfig,
    staleTime: 1000 * 60,
  });

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

  const footerGroups = [
    {
      title: "Explorar",
      links: [
        { label: "Inicio", to: "/" },
        { label: "Cartas sueltas", to: "/singles" },
        { label: "Pedidos", to: "/orders" },
      ],
    },
    {
      title: "Soporte",
      links: [
        { label: "Contacto", to: "/contact" },
        { label: "Política de privacidad", to: "/privacy" },
        { label: "Términos y condiciones", to: "/privacy" },
      ],
    },
  ];

  return (
    <footer className="mt-20 border-t border-emerald-400/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(2,6,23,1))] sm:mt-24">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:py-10 md:px-6 md:py-12">
        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.7fr_0.7fr_1fr] xl:gap-10">
        <div className="sm:col-span-2 xl:col-span-1">
          <Link to="/" className="group inline-flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/30 via-emerald-300/10 to-transparent shadow-[0_0_28px_rgba(74,222,128,0.22)] transition duration-300 group-hover:scale-105 sm:h-14 sm:w-14">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_38%)]" />
              <span className="relative font-display text-lg font-black tracking-[0.2em] text-emerald-100">YG</span>
            </div>
            <div>
              <p className="font-display text-xl font-bold text-white sm:text-2xl">RareHunter</p>
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
                <Link key={link.to + link.label} to={link.to} className="transition hover:text-emerald-300">
                  {link.label}
                </Link>
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
          <p>© {new Date().getFullYear()} RareHunter. Todos los derechos reservados.</p>
          <p>No afiliado a Konami. Diseño optimizado para la tienda.</p>
        </div>
      </div>
    </footer>
  );
}