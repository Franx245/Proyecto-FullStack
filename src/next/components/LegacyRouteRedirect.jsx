"use client";

import { useEffect } from "react";

import { getLegacyStorefrontUrl } from "@/next/storefront-links";

export default function LegacyRouteRedirect({ path, label = "ruta legacy" }) {
  useEffect(() => {
    window.location.replace(getLegacyStorefrontUrl(path));
  }, [path]);

  const href = getLegacyStorefrontUrl(path);

  return (
    <div className="mx-auto flex min-h-screen max-w-[880px] flex-col items-center justify-center px-4 py-10 text-center">
      <div className="rounded-[32px] border border-white/10 bg-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <h1 className="text-2xl font-black text-foreground">Redirigiendo al storefront actual</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Esta sección todavía se abre en la versión principal de DuelVault. Te llevamos automáticamente para que continúes sin fricción.
        </p>
        <a href={href} className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Abrir {label}
        </a>
      </div>
    </div>
  );
}