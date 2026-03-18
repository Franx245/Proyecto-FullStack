import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";

export default function HeroSection() {
  const trustBadges = [
    { icon: ShieldCheck, label: "Cartas verificadas" },
    { icon: Zap, label: "Entrega rápida" },
    { icon: Star, label: "Near Mint+" },
  ];

  const stats = [
    { value: "+10,000", label: "cartas" },
    { value: "+500", label: "nuevas por semana" },
    { value: "98%", label: "satisfacción" },
  ];

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_32%),radial-gradient(circle_at_78%_36%,rgba(74,222,128,0.22),transparent_18%),linear-gradient(135deg,#04070c_0%,#07110f_38%,#040608_100%)]">
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-400/8 to-transparent" />
      <div className="absolute right-[-8rem] top-16 h-[28rem] w-[28rem] rounded-full bg-emerald-400/15 blur-[120px]" />
      <div className="absolute left-[-6rem] bottom-[-6rem] h-72 w-72 rounded-full bg-lime-300/10 blur-[120px]" />

      <div className="relative mx-auto grid max-w-[1400px] gap-14 px-4 pb-16 pt-16 md:px-6 md:pb-20 md:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-2xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300 shadow-[0_0_24px_rgba(74,222,128,0.16)]">
            <Sparkles className="h-3.5 w-3.5" />
            Trading cards verificadas
          </div>

          <h1 className="mt-7 font-display text-5xl font-bold leading-[0.92] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Elevá tu deck con
            <span className="block bg-gradient-to-r from-emerald-300 via-lime-300 to-emerald-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(74,222,128,0.28)]">
              staples, rarezas y brillo premium.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
            Explorá una vitrina curada de cartas Yu-Gi-Oh! con stock real, condición verificada y una experiencia diseñada para duelistas que buscan piezas serias para competir o coleccionar.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              to="/singles"
              className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500 px-7 py-4 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(74,222,128,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_42px_rgba(74,222,128,0.42)]"
            >
              Ver catálogo
              <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-0.5" />
            </Link>

            <Link
              to="/contact"
              className="rounded-2xl border border-white/12 bg-white/[0.04] px-7 py-4 text-sm font-semibold text-white backdrop-blur transition duration-300 hover:border-emerald-400/25 hover:bg-white/[0.08]"
            >
              Contacto
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            {trustBadges.map(({ icon: Icon, label }) => (
              <div key={label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-slate-200 backdrop-blur">
                <Icon className="h-4 w-4 text-emerald-300" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 hidden gap-4 sm:grid-cols-3 md:grid">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 32, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          className="relative hidden min-h-[430px] items-center justify-center lg:flex lg:min-h-[580px]"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="hero-radial-glow h-[320px] w-[320px] rounded-full bg-emerald-400/18 blur-[90px] md:h-[420px] md:w-[420px]" />
          </div>
          <div className="hero-particles pointer-events-none absolute inset-0 opacity-70" />

          <div className="hero-card-float relative">
            <div className="absolute inset-[-18px] rounded-[2.3rem] bg-gradient-to-br from-emerald-300/35 via-emerald-400/10 to-transparent blur-2xl" />
            <div className="hero-card-tilt relative overflow-hidden rounded-[2rem] border border-emerald-300/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-3 shadow-[0_40px_90px_rgba(0,0,0,0.55),0_0_40px_rgba(74,222,128,0.22)] backdrop-blur-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_30%),linear-gradient(160deg,rgba(74,222,128,0.14),transparent_36%,rgba(255,255,255,0.02)_70%)]" />
              <div className="relative rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-3">
                <img
                  src="https://images.ygoprodeck.com/images/cards/89631139.jpg"
                  alt="Blue-Eyes White Dragon"
                  className="h-[360px] w-[255px] rounded-[1.15rem] object-cover md:h-[470px] md:w-[332px]"
                />
                <div className="mt-3 flex items-center justify-between gap-4 px-1 pb-1 pt-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Signature card</p>
                    <p className="mt-1 font-display text-lg font-bold text-white">Blue-Eyes White Dragon</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/16 bg-emerald-400/8 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">Near Mint+</p>
                    <p className="mt-1 text-sm font-bold text-emerald-300">Collector</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}