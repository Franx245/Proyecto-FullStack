import { ENV } from "@/config/env";

const CARD_IMAGE_VARIANTS = {
  thumb: {
    width: 240,
    intrinsicWidth: 168,
    intrinsicHeight: 244,
    remotePath: "cards_small",
  },
  detail: {
    width: 600,
    intrinsicWidth: 421,
    intrinsicHeight: 614,
    remotePath: "cards",
  },
};

/** @param {string | number | null | undefined} id */
function normalizeCardId(id) {
  if (id == null) {
    return "";
  }

  return String(id).trim();
}

/**
 * @param {string | number | null | undefined} id
 * @param {"thumb" | "detail"} [variant]
 */
export function buildRemoteCardImageUrl(id, variant = "detail") {
  const normalizedId = normalizeCardId(id);
  if (!normalizedId) {
    return "";
  }

  const selectedVariant = CARD_IMAGE_VARIANTS[variant] || CARD_IMAGE_VARIANTS.thumb;
  return `https://images.ygoprodeck.com/images/${selectedVariant.remotePath}/${normalizedId}.jpg`;
}

/**
 * @param {string | number | null | undefined} id
 * @param {"thumb" | "detail"} [variant]
 */
export function getCardImage(id, variant = "thumb") {
  const normalizedId = normalizeCardId(id);
  if (!normalizedId) {
    return null;
  }

  const selectedVariant = CARD_IMAGE_VARIANTS[variant] || CARD_IMAGE_VARIANTS.thumb;
  const remoteUrl = buildRemoteCardImageUrl(normalizedId, variant);
  const cloudName = String(ENV.CLOUDINARY_CLOUD_NAME || "").trim();

  if (!cloudName) {
    return {
      src: remoteUrl,
      width: selectedVariant.intrinsicWidth,
      height: selectedVariant.intrinsicHeight,
      rawSrc: remoteUrl,
    };
  }

  const transformations = [`w_${selectedVariant.width}`, "q_auto", "f_auto", "dpr_auto"].join(",");

  return {
    src: `https://res.cloudinary.com/${cloudName}/image/fetch/${transformations}/${remoteUrl}`,
    width: selectedVariant.intrinsicWidth,
    height: selectedVariant.intrinsicHeight,
    rawSrc: remoteUrl,
  };
}

/** @param {string | null | undefined} url */
export function extractCardIdFromImageUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const match = url.match(/\/cards(?:_small)?\/(\d+)\.(?:jpg|png|webp|avif)/i);
  return match?.[1] ?? null;
}