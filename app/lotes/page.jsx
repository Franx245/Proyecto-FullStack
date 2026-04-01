import LotesPage from "@/next/pages/LotesPage";

export const metadata = {
  title: "Lotes Mystery Pack",
  description:
    "Lotes de cartas Yu-Gi-Oh! con rareza garantizada. Descubrí tu próxima carta épica con nuestros mystery packs.",
  alternates: { canonical: "/lotes" },
};

export default function LotesRoute() {
  return <LotesPage />;
}
