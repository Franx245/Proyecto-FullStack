import { useMemo } from "react";

const RARITY_CONFIG = {
  "Common": {
    className: "bg-zinc-700 text-zinc-200 border-zinc-600",
    label: "Common",
  },
  "Rare": {
    className: "bg-blue-900/60 text-blue-200 border-blue-700",
    label: "Rare",
  },
  "Super Rare": {
    className: "bg-violet-900/60 text-violet-200 border-violet-600",
    label: "Super Rare",
  },
  "Ultra Rare": {
    className: "bg-yellow-900/60 text-yellow-200 border-yellow-600",
    label: "Ultra Rare",
  },
  "Secret Rare": {
    className: "bg-pink-900/60 text-pink-200 border-pink-600",
    label: "Secret Rare",
  },
  "Starlight Rare": {
    className:
      "bg-gradient-to-r from-cyan-900/60 to-pink-900/60 text-white border-cyan-500",
    label: "Starlight Rare ✨",
  },
};

const SIZE_VARIANTS = {
  sm: "text-[10px] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
  lg: "text-sm px-3 py-1.5",
};

/**
 * @param {{ rarity?: string, size?: "sm" | "md" | "lg", className?: string }} props
 */
export default function RarityBadge({
  rarity,
  size = "md",
  className = "",
}) {
  const config = useMemo(() => {
    const rarityKey = rarity ?? "";
    const rarityMap = /** @type {Record<string, { className: string, label: string }>} */ (RARITY_CONFIG);

    return rarityMap[rarityKey] || {
      className: "bg-secondary text-muted-foreground border-border",
      label: rarity || "Unknown",
    };
  }, [rarity]);

  const sizeClass = SIZE_VARIANTS[size] || SIZE_VARIANTS.md;

  return (
    <span
      className={`
        inline-flex items-center justify-center
        rounded border font-semibold tracking-wide
        whitespace-nowrap
        ${config.className}
        ${sizeClass}
        ${className}
      `}
    >
      {config.label}
    </span>
  );
}