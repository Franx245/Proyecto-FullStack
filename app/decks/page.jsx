import DecksPage from "@/next/pages/DecksPage";

export const metadata = {
  title: "Decks Armados",
  description:
    "Mazos Yu-Gi-Oh! completos, testeados y listos para jugar. Elegí tu estrategia y dominá el campo de duelo.",
  alternates: { canonical: "/decks" },
};

export default function DecksRoute() {
  return <DecksPage />;
}
