import { Suspense } from "react";

import { fetchFeaturedCards, fetchLatestArrivalCards } from "@/api/store";
import HomePage from "@/next/pages/HomePage.jsx";

export const revalidate = 120;

export const metadata = {
  title: "RareHunter — Marketplace premium de cartas Yu-Gi-Oh!",
  description:
    "Explorá una vitrina curada de cartas Yu-Gi-Oh! con stock real, condición verificada y envío rápido.",
  alternates: { canonical: "/" },
};

export default async function Page() {
  const [featuredCards, latestArrivalCards] = await Promise.all([
    fetchFeaturedCards(5).catch(() => []),
    fetchLatestArrivalCards(5).catch(() => []),
  ]);

  return (
    <Suspense fallback={null}>
      <HomePage initialFeaturedCards={featuredCards} initialLatestArrivalCards={latestArrivalCards} />
    </Suspense>
  );
}