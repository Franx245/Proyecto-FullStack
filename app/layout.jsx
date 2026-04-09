import { Rajdhani, Space_Grotesk } from "next/font/google";

import "../src/index.css";
import "../src/critical.css";

import Providers from "./providers";
import StorefrontShell from "@/next/components/StorefrontShell.jsx";
import { resolveSiteUrl } from "@/lib/site";

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Rajdhani({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "700"],
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: {
    default: "RareHunter — Cartas Yu-Gi-Oh! al mejor precio",
    template: "%s | RareHunter",
  },
  description:
    "Marketplace premium de cartas Yu-Gi-Oh! con stock real, condición verificada y envío rápido. Explorá singles, staples y rarezas.",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "RareHunter",
  },
  twitter: {
    card: "summary_large_image",
    title: "RareHunter — Cartas Yu-Gi-Oh! al mejor precio",
    description:
      "Marketplace premium de cartas Yu-Gi-Oh! con stock real, condición verificada y envío rápido.",
  },
  robots: { index: true, follow: true },
};

/** @param {{ children: import('react').ReactNode }} props */
export default function RootLayout(/** @type {{ children: import('react').ReactNode }} */ { children }) {
  return (
    <html lang="es">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <Providers>
          <StorefrontShell>{children}</StorefrontShell>
        </Providers>
      </body>
    </html>
  );
}