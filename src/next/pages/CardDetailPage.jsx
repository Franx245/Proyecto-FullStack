"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { startTransition, useMemo } from "react";
import { ArrowLeft } from "lucide-react";

import { fetchCardDetail } from "@/api/store";
import CardInfo from "@/components/marketplace/CardInfo";
import CardVersionsTable from "@/components/marketplace/CardVersionsTable";
import { readLastCatalogHref } from "@/lib/catalog-url-state";
import { retainPreviousData } from "@/lib/query-client";
import { buildCardPath } from "@/lib/seo";

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

/** @param {{ id: string, initialData: * }} props */
export default function CardDetailPage({ id, initialData }) {
  const router = useRouter();
  const backHref = useMemo(() => readLastCatalogHref("/singles"), []);
  const { data, isLoading } = useQuery({
    queryKey: ["card-detail", id],
    queryFn: () => fetchCardDetail(id || ""),
    enabled: Boolean(id),
    staleTime: 1000 * 60 * 2,
    initialData,
    initialDataUpdatedAt: Date.now(),
    placeholderData: retainPreviousData,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const card = data?.card ?? null;
  const versions = data?.versions ?? [];
  const ygoproData = data?.ygoproData ?? null;
  const shouldShowInitialSkeleton = isLoading && !card;

  return (
    shouldShowInitialSkeleton ? (
        <DetailSkeleton />
      ) : !card ? (
        <div className="max-w-[1200px] mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground">Carta no encontrada.</p>
          <Link href={backHref} className="text-primary hover:underline mt-4 inline-block">
            ← Volver al catálogo
          </Link>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="max-w-[1200px] mx-auto px-4 py-6"
        >
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Volver
          </Link>

          <CardInfo card={card} ygoproData={ygoproData} />

          <CardVersionsTable
            versions={versions}
            isLoading={false}
            onOpenDetail={(version) => {
              const detailId = version?.version_id ?? version?.card_id;
              if (!detailId) {
                return;
              }

              startTransition(() => {
                router.push(buildCardPath(version, version?.name));
              });
            }}
          />
        </motion.div>
      )
  );
}