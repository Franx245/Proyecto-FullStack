"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";

import { buildRemoteCardImageUrl, extractCardIdFromImageUrl, getCardImage } from "@/lib/cardImage";

/** @param {{ id?: string|number|null, name?: string, priority?: boolean, className?: string, fallbackSrc?: string|null, sizes?: string, variant?: "thumb"|"detail", alt?: string, fill?: boolean, width?: number, height?: number }} props */
function NextCardImageBase({
  id,
  name,
  priority = false,
  className = "h-full w-full object-cover",
  fallbackSrc = null,
  sizes,
  variant = "thumb",
  alt,
  fill = true,
  width,
  height,
}) {
  const resolvedId = id ?? extractCardIdFromImageUrl(fallbackSrc);
  const sources = getCardImage(resolvedId, variant);
  const resolvedAlt = alt || name || "Carta de Yu-Gi-Oh!";
  const remoteFallback = sources?.rawSrc || buildRemoteCardImageUrl(resolvedId, variant);
  const preferredSrc = sources?.src || fallbackSrc || "";
  const [currentSrc, setCurrentSrc] = useState(preferredSrc);

  useEffect(() => {
    setCurrentSrc(preferredSrc);
  }, [preferredSrc]);

  if (!sources && !fallbackSrc) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Sparkles className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }

  const imageProps = fill
    ? { fill: true }
    : {
        width: width || sources?.width || 421,
        height: height || sources?.height || 614,
      };

  return (
    <Image
      {...imageProps}
      src={currentSrc}
      sizes={sizes}
      alt={resolvedAlt}
      priority={priority}
      className={className}
      onError={() => {
        if (currentSrc !== remoteFallback && remoteFallback) {
          setCurrentSrc(remoteFallback);
          return;
        }

        if (currentSrc !== (fallbackSrc || "") && fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        }
      }}
      data-critical="catalog-image"
    />
  );
}

const NextCardImage = memo(NextCardImageBase);

NextCardImage.displayName = "NextCardImage";

export default NextCardImage;