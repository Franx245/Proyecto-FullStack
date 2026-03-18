import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, ShieldCheck, Zap } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
      <div className="absolute top-24 right-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-10 left-10 w-56 h-56 bg-primary/5 rounded-full blur-2xl" />

      <div className="relative max-w-[1400px] mx-auto px-4 py-20 md:py-28">

        {/* MAIN */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Sparkles className="w-3 h-3" />
            Cartas Yu-Gi-Oh! verificadas
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95]">
            Encontrá tu próxima
            <br />
            <span className="text-primary">carta ganadora</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-muted-foreground text-lg leading-relaxed max-w-lg">
            Explorá miles de cartas originales. Desde staples competitivos
            hasta rarezas de colección, todas listas para tu deck.
          </p>

          {/* CTA */}
          <div className="flex flex-wrap gap-3 mt-8">
            <Link
              to="/singles"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition"
            >
              Ver catálogo
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/contact"
              className="px-6 py-3 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition"
            >
              Contacto
            </Link>
          </div>
        </motion.div>

        {/* FEATURES */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-6 mt-16"
        >
          {[
            { icon: ShieldCheck, label: "Cartas verificadas" },
            { icon: Zap, label: "Entrega rápida" },
            { icon: Sparkles, label: "Condición Near Mint+" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Icon className="w-4 h-4 text-primary" />
              {label}
            </div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}