import { memo, useState } from "react";
import { Sparkles } from "lucide-react";
import { buildRemoteCardImageUrl, extractCardIdFromImageUrl, getCardImage } from "@/lib/cardImage";

/**
 * @param {{
 *  id?: string | number | null,
 *  name?: string | null,
 *  priority?: boolean,
 *  className?: string,
 *  fallbackSrc?: string | null,
 *  sizes?: string,
 *  variant?: "thumb" | "detail",
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
  variant = "thumb",
  alt,
}) {
  const resolvedId = id ?? extractCardIdFromImageUrl(fallbackSrc);
  const sources = getCardImage(resolvedId, variant);
  const resolvedAlt = alt || name || "Carta de Yu-Gi-Oh!";
  const remoteFallback = sources?.rawSrc || buildRemoteCardImageUrl(resolvedId, variant);
  const preferredSrc = sources?.src || fallbackSrc || "";
  const [currentSrc, setCurrentSrc] = useState(preferredSrc);

  if (!sources && !fallbackSrc) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Sparkles className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      srcSet={sources?.srcset || undefined}
      sizes={sizes}
      width={sources?.width}
      height={sources?.height}
      alt={resolvedAlt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
      onError={() => {
        if (currentSrc !== remoteFallback && remoteFallback) {
          setCurrentSrc(remoteFallback);
          return;
        }

        if (currentSrc !== (fallbackSrc || "") && fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        }
      }}
      className={className}
      data-critical="catalog-image"
    />
  );
}

const CardImage = memo(CardImageBase);

CardImage.displayName = "CardImage";

export default CardImage;