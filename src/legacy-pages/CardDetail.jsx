import { useParams, Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchCardDetail } from "@/api/store";

import CardInfo from "@/components/marketplace/CardInfo";
import CardVersionsTable from "@/components/marketplace/CardVersionsTable";

function DetailSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
      <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
      <div className="bg-card border border-border rounded-2xl p-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-[3/4] max-w-[320px] bg-secondary rounded-xl animate-pulse" />
          <div className="space-y-4">
            <div className="h-10 bg-secondary rounded animate-pulse w-3/4" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-7 w-20 bg-secondary rounded-full animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="h-32 bg-secondary rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    data,
    isLoading,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["card-detail", id],
    queryFn: () => fetchCardDetail(id || ""),
    enabled: Boolean(id),
    staleTime: 1000 * 60 * 10,
    placeholderData: keepPreviousData,
  });

  const card = data?.card ?? null;
  const versions = data?.versions ?? [];
  const ygoproData = data?.ygoproData ?? null;

  if (isLoading && !isPlaceholderData) return <DetailSkeleton />;

  if (!card) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">Carta no encontrada.</p>
        <Link
          to="/singles"
          className="text-primary hover:underline mt-4 inline-block"
        >
          ← Volver al catálogo
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="max-w-[1200px] mx-auto px-4 py-6"
    >
      {/* Back */}
      <Link
        to="/singles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver
      </Link>

      {/* Info principal */}
      <CardInfo card={card} ygoproData={ygoproData} />

      {/* Versiones */}
      <CardVersionsTable
        versions={versions}
        isLoading={false}
        onOpenDetail={(version) => {
          const detailId = version?.version_id ?? version?.card_id;
          if (!detailId) {
            return;
          }

          navigate(`/card/${detailId}`);
        }}
      />
    </motion.div>
  );
}