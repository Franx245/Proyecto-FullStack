import { memo } from "react";
import { Sparkles } from "lucide-react";

function buildCardImageSources(id) {
  if (id == null || id === "") {
    return null;
  }

  const normalizedId = String(id).trim();
  if (!normalizedId) {
    return null;
  }

  return {
    src: `https://images.ygoprodeck.com/images/cards_small/${normalizedId}.jpg`,
    srcSet: [
      `https://images.ygoprodeck.com/images/cards_small/${normalizedId}.jpg 1x`,
      `https://images.ygoprodeck.com/images/cards/${normalizedId}.jpg 2x`,
    ].join(", "),
  };
}

function extractCardIdFromImageUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const match = url.match(/\/cards(?:_small)?\/(\d+)\.(?:jpg|png|webp)/i);
  return match?.[1] ?? null;
}

/**
 * @param {{
 *  id?: string | number | null,
 *  name?: string | null,
 *  priority?: boolean,
 *  className?: string,
 *  fallbackSrc?: string | null,
 *  sizes?: string,
 *  alt?: string,
 * }} props
 */
function CardImageBase({
  id,
  name,
  priority = false,
  className = "h-full w-full object-cover",
  fallbackSrc = null,
  sizes,
  alt,
}) {
  const resolvedId = id ?? extractCardIdFromImageUrl(fallbackSrc);
  const sources = buildCardImageSources(resolvedId);
  const resolvedAlt = alt || name || "Carta de Yu-Gi-Oh!";

  if (!sources && !fallbackSrc) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Sparkles className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <img
      src={sources?.src || fallbackSrc || ""}
      srcSet={sources?.srcSet}
      sizes={sizes}
      alt={resolvedAlt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={className}
    />
  );
}

const CardImage = memo(CardImageBase);

CardImage.displayName = "CardImage";

export default CardImage;