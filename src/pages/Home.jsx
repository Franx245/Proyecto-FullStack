import { motion } from "framer-motion";
import HeroSection from "@/components/marketplace/HeroSection";
import FeaturedCards from "@/components/marketplace/FeaturedCards";
import { fetchFeaturedCards, fetchLatestArrivalCards } from "@/api/store";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="space-y-16">
      <HeroSection />

      {/* 👋 BIENVENIDA */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-[900px] mx-auto text-center px-4"
      >
        <h2 className="text-3xl font-black tracking-tight mb-3">
          Bienvenido a DuelVault
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Explorá miles de cartas de Yu-Gi-Oh!, encontrá las mejores rarezas
          y armá tu colección al mejor precio.
        </p>
      </motion.section>

      <FeaturedCards
        title="Cartas destacadas"
        queryKey={["featured-cards"]}
        queryFn={() => fetchFeaturedCards(5)}
      />

      <section className="max-w-[1400px] mx-auto px-4">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xl font-bold tracking-tight">
            Últimos ingresos
          </h3>

          <Link
            to="/singles"
            className="text-sm text-primary hover:underline"
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

        <div className="flex justify-center mt-8">
          <Link
            to="/singles"
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/85 active:scale-[0.98] transition"
          >
            Ver catálogo completo
          </Link>
        </div>
      </section>
    </div>
  );
}
