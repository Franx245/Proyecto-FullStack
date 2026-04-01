"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Gift, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import Link from "next/link";

import { formatPrice } from "@/utils/currency";

const LOTES = [
  {
    id: "lote-dragon-legendario",
    name: "Lote Dragones Legendarios",
    description: "5 cartas con al menos 1 Ultra Rare garantizada del arquetipo dragón.",
    price: 4500,
    cardCount: 5,
    guaranteedRarity: "Ultra Rare",
    probabilities: [
      { rarity: "Secret Rare", chance: 15 },
      { rarity: "Ultra Rare", chance: 30 },
      { rarity: "Super Rare", chance: 35 },
      { rarity: "Rare", chance: 20 },
    ],
    gradient: "from-amber-500/20 via-orange-500/10 to-red-500/20",
    glowColor: "rgba(245,158,11,0.25)",
    accentClass: "text-amber-400",
    borderClass: "border-amber-400/20",
    badgeClass: "bg-amber-400/15 text-amber-300 border-amber-400/25",
    image: "🐉",
  },
  {
    id: "lote-staples-meta",
    name: "Lote Staples Meta",
    description: "4 cartas competitivas del meta actual. Ideal para armar tu side deck.",
    price: 3200,
    cardCount: 4,
    guaranteedRarity: "Super Rare",
    probabilities: [
      { rarity: "Secret Rare", chance: 10 },
      { rarity: "Ultra Rare", chance: 25 },
      { rarity: "Super Rare", chance: 40 },
      { rarity: "Rare", chance: 25 },
    ],
    gradient: "from-emerald-500/20 via-teal-500/10 to-cyan-500/20",
    glowColor: "rgba(74,222,128,0.25)",
    accentClass: "text-emerald-400",
    borderClass: "border-emerald-400/20",
    badgeClass: "bg-emerald-400/15 text-emerald-300 border-emerald-400/25",
    image: "⚔️",
  },
  {
    id: "lote-misterio-premium",
    name: "Lote Misterio Premium",
    description: "8 cartas completamente aleatorias. Puede venir cualquier carta del inventario.",
    price: 6000,
    cardCount: 8,
    guaranteedRarity: "Rare+",
    probabilities: [
      { rarity: "Starlight Rare", chance: 2 },
      { rarity: "Secret Rare", chance: 12 },
      { rarity: "Ultra Rare", chance: 22 },
      { rarity: "Super Rare", chance: 30 },
      { rarity: "Rare", chance: 34 },
    ],
    gradient: "from-violet-500/20 via-purple-500/10 to-fuchsia-500/20",
    glowColor: "rgba(139,92,246,0.25)",
    accentClass: "text-violet-400",
    borderClass: "border-violet-400/20",
    badgeClass: "bg-violet-400/15 text-violet-300 border-violet-400/25",
    image: "✨",
  },
  {
    id: "lote-coleccionista",
    name: "Lote Coleccionista",
    description: "3 cartas de alta rareza. Para el duelista que busca lo exclusivo.",
    price: 8500,
    cardCount: 3,
    guaranteedRarity: "Secret Rare",
    probabilities: [
      { rarity: "Starlight Rare", chance: 8 },
      { rarity: "Secret Rare", chance: 45 },
      { rarity: "Ultra Rare", chance: 47 },
    ],
    gradient: "from-rose-500/20 via-pink-500/10 to-red-500/20",
    glowColor: "rgba(244,63,94,0.25)",
    accentClass: "text-rose-400",
    borderClass: "border-rose-400/20",
    badgeClass: "bg-rose-400/15 text-rose-300 border-rose-400/25",
    image: "💎",
  },
];

/** @param {{ lote: typeof LOTES[0] }} props */
function LoteCard({ lote }) {
  const [showProbs, setShowProbs] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, rotateY: 2 }}
      transition={{ duration: 0.3 }}
      className="group relative"
      onMouseEnter={() => setShowProbs(true)}
      onMouseLeave={() => setShowProbs(false)}
    >
      <div className={`absolute -inset-1 rounded-[36px] bg-gradient-to-br ${lote.gradient} opacity-0 blur-2xl transition duration-500 group-hover:opacity-100`} />
      <div className={`relative overflow-hidden rounded-[32px] border ${lote.borderClass} bg-slate-900/80 backdrop-blur-sm transition duration-300`}>
        {/* Holographic shimmer */}
        <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.03)_45%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0.03)_55%,transparent_60%)] bg-[length:200%_100%] transition-[background-position] duration-700 group-hover:bg-[position:100%_0]" />

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${lote.borderClass} bg-gradient-to-br ${lote.gradient} text-3xl shadow-lg`}>
              {lote.image}
            </div>
            <div className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${lote.badgeClass}`}>
              {lote.cardCount} cartas
            </div>
          </div>

          {/* Info */}
          <h3 className="mt-5 text-xl font-black text-white">{lote.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{lote.description}</p>

          {/* Guaranteed rarity */}
          <div className="mt-4 flex items-center gap-2">
            <ShieldCheck className={`h-4 w-4 ${lote.accentClass}`} />
            <span className="text-xs font-semibold text-slate-300">
              Garantizada: <span className={lote.accentClass}>{lote.guaranteedRarity}</span>
            </span>
          </div>

          {/* Probabilities (reveal on hover) */}
          <motion.div
            initial={false}
            animate={{ height: showProbs ? "auto" : 0, opacity: showProbs ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Probabilidades</p>
              {lote.probabilities.map((prob) => (
                <div key={prob.rarity} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{prob.rarity}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${lote.gradient}`}
                        style={{ width: `${prob.chance}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${lote.accentClass}`}>{prob.chance}%</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Price + CTA */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Precio</p>
              <p className={`text-2xl font-black ${lote.accentClass}`}>{formatPrice(lote.price)}</p>
            </div>
            <Link
              href={`/contact`}
              className={`inline-flex items-center gap-2 rounded-2xl border ${lote.borderClass} bg-gradient-to-r ${lote.gradient} px-5 py-3 text-sm font-bold text-white shadow-lg transition duration-300 hover:scale-105 hover:shadow-[0_0_30px_${lote.glowColor}]`}
            >
              <Zap className="h-4 w-4" />
              Consultar
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function LotesPage() {
  return (
    <div className="relative min-h-screen">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-[600px] w-[600px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute right-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-violet-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-amber-500/[0.03] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">
            <Gift className="h-4 w-4" />
            Mystery Packs
          </div>
          <h1 className="mt-6 font-display text-4xl font-black text-white md:text-5xl lg:text-6xl">
            Descubrí tu próxima{" "}
            <span className="bg-gradient-to-r from-amber-300 via-emerald-300 to-violet-300 bg-clip-text text-transparent">
              carta épica
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
            Cada lote es una experiencia única. Cartas reales de nuestro inventario, rareza garantizada y la emoción de la sorpresa.
          </p>
        </motion.div>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Stock real verificado</span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            <span>Rareza garantizada</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span>Cartas Near Mint</span>
          </div>
        </div>

        {/* Lotes grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {LOTES.map((lote, index) => (
            <motion.div
              key={lote.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <LoteCard lote={lote} />
            </motion.div>
          ))}
        </div>

        {/* FAQ / Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-20 rounded-[32px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-sm"
        >
          <h2 className="text-center text-2xl font-black text-white">¿Cómo funcionan los lotes?</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-2xl">
                🎯
              </div>
              <h3 className="mt-4 font-bold text-white">Elegí tu lote</h3>
              <p className="mt-2 text-sm text-slate-400">Cada lote tiene un tema, cantidad de cartas y rareza mínima garantizada.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-2xl">
                📦
              </div>
              <h3 className="mt-4 font-bold text-white">Armamos tu pack</h3>
              <p className="mt-2 text-sm text-slate-400">Seleccionamos cartas reales de nuestro inventario respetando las probabilidades.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-2xl">
                🎉
              </div>
              <h3 className="mt-4 font-bold text-white">Recibí y descubrí</h3>
              <p className="mt-2 text-sm text-slate-400">Te enviamos las cartas. ¡Descubrí qué te tocó!</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
