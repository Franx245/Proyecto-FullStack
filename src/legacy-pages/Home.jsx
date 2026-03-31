import { motion } from "framer-motion";
import HeroSection from "@/components/marketplace/HeroSection";
import FeaturedCards from "@/components/marketplace/FeaturedCards";
import { fetchFeaturedCards, fetchLatestArrivalCards } from "@/api/store";
import { Link } from "react-router-dom";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-16 pb-8">
      <HeroSection />

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-auto max-w-[1100px] px-4"
      >
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

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: ShieldCheck, label: "Stock verificado" },
              { icon: Zap, label: "Actualización continua" },
              { icon: Sparkles, label: "Selección premium" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200">
                <Icon className="h-4 w-4 text-emerald-300" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      <FeaturedCards
        title="Cartas destacadas"
        queryKey={["featured-cards"]}
        queryFn={() => fetchFeaturedCards(5)}
      />

      <section className="mx-auto max-w-[1400px] px-4">
        <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] px-6 py-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Fresh inventory</p>
            <h3 className="mt-1 font-display text-2xl font-bold tracking-[-0.02em] text-white">
            Últimos ingresos
            </h3>
          </div>

          <Link
            to="/singles"
            className="inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition duration-300 hover:border-emerald-400/25 hover:bg-emerald-400/15"
          >
            Ver todo →
          </Link>
        </div>

        <FeaturedCards
          title="Últimos ingresos"
          queryKey={["latest-arrivals"]}
          queryFn={() => fetchLatestArrivalCards(5)}
          showHeader={false}
        />

        <div className="mt-8 flex justify-center">
          <Link
            to="/singles"
            className="rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500 px-7 py-4 text-sm font-bold text-slate-950 shadow-[0_0_30px_rgba(74,222,128,0.22)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_42px_rgba(74,222,128,0.35)]"
          >
            Ver catálogo completo
          </Link>
        </div>
      </section>
    </div>
  );
}
