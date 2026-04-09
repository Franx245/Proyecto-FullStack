"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Truck, WalletCards } from "lucide-react";

import { buildRemoteCardImageUrl } from "@/lib/cardImage";
import { fetchFeaturedCards, fetchLatestArrivalCards } from "@/api/store";
import NextFeaturedCards from "@/next/components/NextFeaturedCards.jsx";
import useCatalogPrefetch from "@/next/hooks/useCatalogPrefetch";

const heroCardImage = buildRemoteCardImageUrl(89631139, "detail");
const TRUST_BADGES = [
  { icon: ShieldCheck, label: "Stock real" },
  { icon: Truck, label: "Envíos a todo el país" },
  { icon: WalletCards, label: "Compra segura" },
];
const STATS = [
  { value: "Staples", label: "para tu deck" },
  { value: "Rarezas", label: "con stock real" },
  { value: "Ingresos", label: "cada semana" },
];

/** @param {{ initialFeaturedCards?: *[], initialLatestArrivalCards?: *[] }} props */
export default function HomePage({ initialFeaturedCards = [], initialLatestArrivalCards = [] }) {
  const prefetchCatalog = useCatalogPrefetch();

  const handleCatalogIntent = () => {
    void prefetchCatalog("/singles");
  };

  return (
    <div className="space-y-16 pb-8">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_78%_36%,rgba(74,222,128,0.18),transparent_20%),linear-gradient(135deg,#04070c_0%,#07110f_38%,#040608_100%)]">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-400/6 to-transparent" />
          <div className="absolute right-[-8rem] top-16 h-[30rem] w-[30rem] rounded-full bg-emerald-400/14 blur-[128px]" />
          <div className="absolute left-[-6rem] bottom-[-6rem] h-80 w-80 rounded-full bg-lime-300/10 blur-[128px]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[-4.5rem] h-36 bg-[radial-gradient(circle_at_center,rgba(74,222,128,0.26),transparent_60%)] blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-emerald-400/[0.05] to-background/95" />

          <div className="relative mx-auto grid max-w-[1400px] gap-14 px-4 pb-16 pt-16 md:px-6 md:pb-20 md:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pt-28">
            <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} className="max-w-[42rem]">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100 shadow-[0_0_22px_rgba(74,222,128,0.12)]">
                <Sparkles className="h-3.5 w-3.5" />
                Cartas Yu-Gi-Oh • Argentina
              </div>

              <h1 className="mt-7 font-display text-5xl font-black leading-[0.88] tracking-[-0.055em] text-white drop-shadow-[0_12px_34px_rgba(0,0,0,0.32)] sm:text-6xl lg:text-[5.25rem]">
                Elevá tu deck con
                <span className="block bg-gradient-to-r from-emerald-100 via-lime-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_32px_rgba(110,231,183,0.22)]">
                  cartas que hacen la diferencia.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-100/95 sm:text-lg">
                Comprá cartas Yu-Gi-Oh con stock real, envío rápido y sin vueltas.
              </p>

              <div className="mt-9 flex flex-wrap gap-4">
                <Link href="/singles" onMouseEnter={handleCatalogIntent} onFocus={handleCatalogIntent} className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500 px-7 py-4 text-sm font-bold text-slate-950 shadow-[0_0_30px_rgba(74,222,128,0.24)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_44px_rgba(74,222,128,0.36)]">
                  Ver cartas
                  <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-0.5" />
                </Link>

                <a href="/contact" className="rounded-2xl border border-white/12 bg-white/[0.05] px-7 py-4 text-sm font-semibold text-white shadow-[0_12px_34px_rgba(0,0,0,0.14)] backdrop-blur transition duration-300 hover:border-emerald-400/22 hover:bg-white/[0.08]">
                  Contacto
                </a>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {TRUST_BADGES.map(({ icon: Icon, label }) => (
                  <div key={label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-4 py-2.5 text-sm text-slate-100 shadow-[0_12px_28px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
                    <Icon className="h-4 w-4 text-emerald-300" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 hidden gap-4 sm:grid-cols-3 md:grid">
                {STATS.map((stat) => (
                  <div key={stat.label} className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-4 backdrop-blur-xl shadow-[0_24px_54px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <p className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</p>
                    <p className="mt-1 text-sm text-slate-300">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 32, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }} className="relative hidden min-h-[430px] items-center justify-center lg:flex lg:min-h-[580px]">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="hero-radial-glow h-[360px] w-[360px] rounded-full bg-emerald-400/18 blur-[100px] md:h-[500px] md:w-[500px]" />
              </div>
              <div className="hero-particles pointer-events-none absolute inset-0 opacity-70" />

              <div className="hero-card-float relative">
                <div className="absolute inset-[-26px] rounded-[2.8rem] bg-gradient-to-br from-emerald-300/36 via-emerald-400/12 to-transparent blur-3xl" />
                <div className="absolute inset-[18px] rotate-[-10deg] rounded-[2.35rem] border border-emerald-300/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_34px_90px_rgba(0,0,0,0.26)]" />
                <div className="hero-card-tilt relative overflow-hidden rounded-[2.1rem] border border-emerald-300/22 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-2.5 shadow-[0_44px_96px_rgba(0,0,0,0.55),0_0_42px_rgba(74,222,128,0.2)] backdrop-blur-xl">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_30%),linear-gradient(160deg,rgba(74,222,128,0.14),transparent_36%,rgba(255,255,255,0.02)_70%)]" />
                  <div className="relative rounded-[1.6rem] border border-white/10 bg-slate-950/84 p-2.5">
                    <div className="relative h-[382px] w-[262px] md:h-[502px] md:w-[344px]">
                      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-slate-950/72 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur">
                        RareHunter Pick
                      </div>
                      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border border-emerald-300/16 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur">
                        Stock confirmado
                      </div>
                      <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.15rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_18%,transparent_82%,rgba(2,6,23,0.3)),radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_28%)]" />
                      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 h-20 rounded-full bg-emerald-400/20 blur-2xl" />
                      <Image src={heroCardImage} alt="Blue-Eyes White Dragon" fill={true} priority={true} unoptimized={true} draggable={false} sizes="(min-width: 1280px) 344px, 262px" className="rounded-[1.15rem] object-cover object-center brightness-[1.03] contrast-[1.02] saturate-[1.08]" />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4 px-1 pb-1 pt-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Carta destacada</p>
                        <p className="mt-1 font-display text-lg font-bold text-white">Blue-Eyes White Dragon</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Iconic</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Dragon</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-emerald-400/16 bg-emerald-400/8 px-3 py-2 text-right">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">Stock real</p>
                        <p className="mt-1 text-sm font-bold text-emerald-300">Compra segura</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mx-auto max-w-[1100px] px-4">
          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-6 py-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl md:px-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Curado para duelistas y coleccionistas
            </div>
            <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.03em] text-white md:text-5xl">
              Una vitrina premium para cartas que sí importan.
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              Navegá lanzamientos, staples competitivos y joyas de colección con una experiencia enfocada en stock real, presentación cuidada y confianza de compra.
            </p>
          </div>
        </motion.section>

        <NextFeaturedCards title="Cartas destacadas" queryKey={["featured-cards"]} queryFn={() => fetchFeaturedCards(5)} initialData={/** @type {*} */ (initialFeaturedCards)} />

        <section className="mx-auto max-w-[1400px] px-4">
          <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] px-6 py-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Fresh inventory</p>
              <h3 className="mt-1 font-display text-2xl font-bold tracking-[-0.02em] text-white">Últimos ingresos</h3>
            </div>
            <Link href="/singles" onMouseEnter={handleCatalogIntent} onFocus={handleCatalogIntent} className="inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition duration-300 hover:border-emerald-400/25 hover:bg-emerald-400/15">
              Ver todo →
            </Link>
          </div>

          <NextFeaturedCards title="Últimos ingresos" queryKey={["latest-arrivals"]} queryFn={() => fetchLatestArrivalCards(5)} showHeader={false} initialData={/** @type {*} */ (initialLatestArrivalCards)} />

          <div className="mt-8 flex justify-center">
            <Link href="/singles" onMouseEnter={handleCatalogIntent} onFocus={handleCatalogIntent} className="rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500 px-7 py-4 text-sm font-bold text-slate-950 shadow-[0_0_30px_rgba(74,222,128,0.22)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_42px_rgba(74,222,128,0.35)]">
              Ver catálogo completo
            </Link>
          </div>
        </section>
      </div>
  );
}