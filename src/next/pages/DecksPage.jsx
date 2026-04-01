"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Layers, Shield, Sparkles, Star, Swords, Trophy, Zap } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/utils/currency";

const DECKS = [
  {
    id: "blue-eyes-domination",
    name: "Blue-Eyes Domination",
    archetype: "Blue-Eyes",
    description: "Power deck centrado en Blue-Eyes White Dragon y sus fusiones. Agresivo, consistente y devastador.",
    playstyle: "Agresivo / OTK",
    difficulty: "Intermedio",
    cardCount: 40,
    price: 18500,
    category: "meta",
    keyCards: ["Blue-Eyes White Dragon", "Blue-Eyes Twin Burst Dragon", "Blue-Eyes Alternative"],
    gradient: "from-blue-500/20 via-cyan-500/10 to-indigo-500/20",
    glowColor: "rgba(59,130,246,0.25)",
    accentClass: "text-blue-400",
    borderClass: "border-blue-400/20",
    badgeClass: "bg-blue-400/15 text-blue-300 border-blue-400/25",
    image: "🐲",
    tier: "Tier 2",
  },
  {
    id: "dark-magician-control",
    name: "Dark Magician Control",
    archetype: "Dark Magician",
    description: "Control deck con trampa y efecto. Usá el poder de la magia oscura para dominar el campo.",
    playstyle: "Control / Grind",
    difficulty: "Avanzado",
    cardCount: 40,
    price: 22000,
    category: "meta",
    keyCards: ["Dark Magician", "Eternal Soul", "Dark Magical Circle"],
    gradient: "from-purple-500/20 via-violet-500/10 to-fuchsia-500/20",
    glowColor: "rgba(139,92,246,0.25)",
    accentClass: "text-violet-400",
    borderClass: "border-violet-400/20",
    badgeClass: "bg-violet-400/15 text-violet-300 border-violet-400/25",
    image: "🧙",
    tier: "Tier 2",
  },
  {
    id: "hero-beat",
    name: "HERO Beat",
    archetype: "Elemental HERO",
    description: "Deck agresivo de fusiones HERO. Combiná héroes elementales para hacer jugadas explosivas.",
    playstyle: "Agresivo / Combo",
    difficulty: "Principiante",
    cardCount: 40,
    price: 12000,
    category: "casual",
    keyCards: ["Elemental HERO Neos", "Miracle Fusion", "Mask Change"],
    gradient: "from-red-500/20 via-orange-500/10 to-amber-500/20",
    glowColor: "rgba(239,68,68,0.25)",
    accentClass: "text-red-400",
    borderClass: "border-red-400/20",
    badgeClass: "bg-red-400/15 text-red-300 border-red-400/25",
    image: "🦸",
    tier: "Casual",
  },
  {
    id: "starter-warriors",
    name: "Guerreros Iniciales",
    archetype: "Warrior",
    description: "Deck ideal para empezar. Cartas simples, combos claros y precio accesible.",
    playstyle: "Beatdown",
    difficulty: "Principiante",
    cardCount: 40,
    price: 5500,
    category: "casual",
    keyCards: ["Marauding Captain", "Reinforcement of the Army", "Warrior Dai Grepher"],
    gradient: "from-emerald-500/20 via-teal-500/10 to-green-500/20",
    glowColor: "rgba(74,222,128,0.25)",
    accentClass: "text-emerald-400",
    borderClass: "border-emerald-400/20",
    badgeClass: "bg-emerald-400/15 text-emerald-300 border-emerald-400/25",
    image: "⚔️",
    tier: "Casual",
  },
  {
    id: "dragonmaid-combo",
    name: "Dragonmaid Combo",
    archetype: "Dragonmaid",
    description: "Deck flexible que combina transformaciones de dragón con recuperación de recursos.",
    playstyle: "Combo / Recurso",
    difficulty: "Intermedio",
    cardCount: 40,
    price: 15000,
    category: "competitive",
    keyCards: ["Dragonmaid Chamber", "House Dragonmaid", "Dragonmaid Changeover"],
    gradient: "from-pink-500/20 via-rose-500/10 to-red-500/20",
    glowColor: "rgba(236,72,153,0.25)",
    accentClass: "text-pink-400",
    borderClass: "border-pink-400/20",
    badgeClass: "bg-pink-400/15 text-pink-300 border-pink-400/25",
    image: "🐉",
    tier: "Tier 3",
  },
  {
    id: "zombie-horde",
    name: "Zombie Horde",
    archetype: "Zombie",
    description: "Deck de control con recursión infinita. Los zombies siempre vuelven del cementerio.",
    playstyle: "Control / Recursión",
    difficulty: "Intermedio",
    cardCount: 40,
    price: 9800,
    category: "competitive",
    keyCards: ["Doomking Balerdroch", "Zombie World", "Glow-Up Bloom"],
    gradient: "from-slate-500/20 via-gray-500/10 to-zinc-500/20",
    glowColor: "rgba(148,163,184,0.25)",
    accentClass: "text-slate-300",
    borderClass: "border-slate-400/20",
    badgeClass: "bg-slate-400/15 text-slate-300 border-slate-400/25",
    image: "💀",
    tier: "Tier 3",
  },
];

const CATEGORIES = [
  { value: "all", label: "Todos", Icon: Layers },
  { value: "meta", label: "Meta", Icon: Trophy },
  { value: "competitive", label: "Competitivo", Icon: Swords },
  { value: "casual", label: "Casual", Icon: Star },
];

const DIFFICULTY_COLORS = {
  Principiante: "text-emerald-400",
  Intermedio: "text-amber-400",
  Avanzado: "text-rose-400",
};

/** @param {{ deck: typeof DECKS[0] }} props */
function DeckCard({ deck }) {
  const [showCards, setShowCards] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="group relative"
    >
      <div className={`absolute -inset-1 rounded-[36px] bg-gradient-to-br ${deck.gradient} opacity-0 blur-2xl transition duration-500 group-hover:opacity-100`} />
      <div className={`relative overflow-hidden rounded-[32px] border ${deck.borderClass} bg-slate-900/80 backdrop-blur-sm transition duration-300`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${deck.gradient} opacity-[0.03]`} />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.02)_45%,rgba(255,255,255,0.05)_50%,rgba(255,255,255,0.02)_55%,transparent_60%)] bg-[length:200%_100%] transition-[background-position] duration-700 group-hover:bg-[position:100%_0]" />

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${deck.borderClass} bg-gradient-to-br ${deck.gradient} text-2xl shadow-lg`}>
              {deck.image}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${deck.badgeClass}`}>
                {deck.tier}
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-400">
                {deck.cardCount} cartas
              </div>
            </div>
          </div>

          {/* Info */}
          <h3 className="mt-4 text-xl font-black text-white">{deck.name}</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{deck.archetype}</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{deck.description}</p>

          {/* Stats */}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Swords className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-slate-400">{deck.playstyle}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              <span className={DIFFICULTY_COLORS[deck.difficulty] || "text-slate-400"}>{deck.difficulty}</span>
            </div>
          </div>

          {/* Key cards preview */}
          <button
            type="button"
            onClick={() => setShowCards((v) => !v)}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.04]"
          >
            <span>Cartas clave</span>
            <ChevronDown className={`h-3.5 w-3.5 transition duration-300 ${showCards ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {showCards && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  {deck.keyCards.map((card) => (
                    <div key={card} className="flex items-center gap-2 text-sm">
                      <Sparkles className={`h-3 w-3 ${deck.accentClass}`} />
                      <span className="text-slate-300">{card}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Price + CTA */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Deck completo</p>
              <p className={`text-2xl font-black ${deck.accentClass}`}>{formatPrice(deck.price)}</p>
            </div>
            <Link
              href="/contact"
              className={`inline-flex items-center gap-2 rounded-2xl border ${deck.borderClass} bg-gradient-to-r ${deck.gradient} px-5 py-3 text-sm font-bold text-white shadow-lg transition duration-300 hover:scale-105`}
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

export default function DecksPage() {
  const [category, setCategory] = useState("all");

  const filteredDecks = useMemo(() => {
    if (category === "all") return DECKS;
    return DECKS.filter((d) => d.category === category);
  }, [category]);

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-0 h-[600px] w-[600px] rounded-full bg-violet-500/[0.04] blur-[120px]" />
        <div className="absolute right-1/4 top-1/2 h-[500px] w-[500px] rounded-full bg-blue-500/[0.04] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">
            <Swords className="h-4 w-4" />
            Mazos Armados
          </div>
          <h1 className="mt-6 font-display text-4xl font-black text-white md:text-5xl lg:text-6xl">
            Jugá como un pro{" "}
            <span className="bg-gradient-to-r from-blue-300 via-violet-300 to-emerald-300 bg-clip-text text-transparent">
              desde el primer turno
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
            Decks completos, testeados y listos para jugar. Elegí tu estrategia y dominá el campo de duelo.
          </p>
        </motion.div>

        {/* Category filters */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {CATEGORIES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition duration-300 ${
                category === value
                  ? "bg-emerald-400/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.22)]"
                  : "border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Decks grid */}
        <motion.div layout className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filteredDecks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </AnimatePresence>
        </motion.div>

        {filteredDecks.length === 0 && (
          <div className="mt-16 text-center text-slate-500">
            <p className="text-lg">No hay decks en esta categoría por ahora.</p>
          </div>
        )}

        {/* Info section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-20 rounded-[32px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-sm"
        >
          <h2 className="text-center text-2xl font-black text-white">¿Por qué comprar un deck armado?</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-2xl">
                ⚡
              </div>
              <h3 className="mt-4 font-bold text-white">Listo para jugar</h3>
              <p className="mt-2 text-sm text-slate-400">No armés carta por carta. Recibí un deck completo y funcional al instante.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10 text-2xl">
                🧠
              </div>
              <h3 className="mt-4 font-bold text-white">Estrategia probada</h3>
              <p className="mt-2 text-sm text-slate-400">Cada deck viene testeado con sinergias reales y combos verificados.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-2xl">
                💰
              </div>
              <h3 className="mt-4 font-bold text-white">Mejor precio</h3>
              <p className="mt-2 text-sm text-slate-400">Comprá el deck completo y ahorrá vs comprar cada carta por separado.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
