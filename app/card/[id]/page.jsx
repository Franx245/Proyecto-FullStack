import { cache } from "react";

import { fetchCardDetail } from "@/api/store";
import { buildCardJsonLd, buildCardPath, extractCardIdFromRouteSegment } from "@/lib/seo";
import CardNotFoundState from "@/next/components/CardNotFoundState.jsx";
import CardDetailPage from "@/next/pages/CardDetailPage.jsx";

export const revalidate = 60;

const getCardDetail = cache(async (/** @type {string} */ id) => fetchCardDetail(id));

/** @param {string} rawId */
function normalizeCardId(rawId) {
  return extractCardIdFromRouteSegment(rawId);
}

/** @param {{ params: { id: string } }} props */
export async function generateMetadata({ params }) {
  const id = normalizeCardId(params.id);
  if (!id) {
    return {
      title: "Carta no encontrada",
      robots: { index: false, follow: false },
    };
  }

  try {
    const detail = await getCardDetail(id);
    const card = detail?.card;
    if (!card) {
      return {
        title: "Carta no encontrada",
        robots: { index: false, follow: false },
      };
    }

    const price = typeof card.price === "number" ? ` · $${card.price.toFixed(2)}` : "";
    const canonicalPath = buildCardPath(card);
    return {
      title: `${card.name}${price}`,
      description: `Comprar ${card.name} — ${card.rarity ?? "Yu-Gi-Oh!"} · ${card.set_name ?? "Singles"}. Stock real y condición verificada en DuelVault.`,
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: `${card.name} — DuelVault`,
        description: `${card.name} · ${card.rarity ?? "Yu-Gi-Oh!"}${price}`,
        url: canonicalPath,
        images: card.image ? [{ url: card.image, width: 421, height: 614, alt: card.name }] : [],
      },
      twitter: {
        card: "summary_large_image",
        title: `${card.name} — DuelVault`,
        description: `${card.name} · ${card.rarity ?? "Yu-Gi-Oh!"}${price}`,
        images: card.image ? [card.image] : [],
      },
    };
  } catch {
    return {};
  }
}

/** @param {{ params: { id: string } }} props */
export default async function CardRoute({ params }) {
  const id = normalizeCardId(params.id);

  if (!id) {
    return <CardNotFoundState />;
  }

  try {
    const detail = await getCardDetail(id);

    if (!detail?.card) {
      return <CardNotFoundState />;
    }

    const structuredData = buildCardJsonLd(detail.card);

    return (
      <>
        {structuredData ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          />
        ) : null}
        <CardDetailPage id={id} initialData={detail} />
      </>
    );
  } catch (/** @type {*} */ error) {
    const status = Number(error?.status || 0);
    if (status === 400 || status === 404) {
      return <CardNotFoundState />;
    }

    throw error;
  }
}