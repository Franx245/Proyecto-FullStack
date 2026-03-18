import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import StatBlock from "./StatBlock";

/**
 * @typedef {{
 *  name?: string,
 *  image?: string,
 *  attribute?: string,
 *  card_type?: string,
 *  race?: string,
 *  description?: string
 * }} Card
 *
 * @typedef {{
 *  name?: string,
 *  attribute?: string,
 *  type?: string,
 *  cardType?: string,
 *  race?: string,
 *  desc?: string,
 *  description?: string,
 *  level?: number,
 *  rank?: number,
 *  link_val?: number,
 *  linkval?: number,
 *  atk?: number,
 *  def?: number,
 *  card_images?: { image_url: string }[]
 * }} YgoProData
 */

/**
 * @param {{ card?: Card, ygoproData?: YgoProData }} props
 */
export default function CardInfo({ card = {}, ygoproData = {} }) {
  const [zoom, setZoom] = useState(false);

  const ATTRIBUTE_COLORS = {
    DARK: "bg-purple-900/80 text-purple-200 border-purple-700",
    LIGHT: "bg-yellow-800/80 text-yellow-100 border-yellow-600",
    FIRE: "bg-red-900/80 text-red-200 border-red-700",
    WATER: "bg-blue-900/80 text-blue-200 border-blue-700",
    EARTH: "bg-amber-900/80 text-amber-200 border-amber-700",
    WIND: "bg-green-900/80 text-green-200 border-green-700",
    DIVINE: "bg-orange-800/80 text-orange-100 border-orange-500",
  };

  // 🔥 Merge de data
  const data = useMemo(() => {
    return {
      name: ygoproData.name || card.name || "Unknown Card",
      image:
        ygoproData.card_images?.[0]?.image_url || card.image || null,
      attribute: ygoproData.attribute || card.attribute || null,
      type: ygoproData.type || ygoproData.cardType || card.card_type || null,
      race: ygoproData.race || card.race || null,
      desc: ygoproData.desc || ygoproData.description || card.description || null,
      level:
        ygoproData.level ??
        ygoproData.rank ??
        ygoproData.link_val ??
        ygoproData.linkval ??
        null,
      atk: ygoproData.atk ?? null,
      def: ygoproData.def ?? null,
    };
  }, [card, ygoproData]);

  const attrKey = /** @type {keyof typeof ATTRIBUTE_COLORS | undefined} */ (
  data.attribute?.toUpperCase()
);
  const attrStyle =
  (attrKey && ATTRIBUTE_COLORS[attrKey]) ||
  "bg-secondary text-muted-foreground border-border";

  const tags = useMemo(() => {
  return [data.type, data.race, "Effect"].filter(
    (tag) => typeof tag === "string"
  );
}, [data.type, data.race]);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
      <div className="grid md:grid-cols-2 gap-8">

        {/* IMAGE */}
        <div className="flex justify-center md:justify-start">
          <motion.div
            className="relative cursor-zoom-in"
            animate={{ scale: zoom ? 1.08 : 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onMouseEnter={() => setZoom(true)}
            onMouseLeave={() => setZoom(false)}
          >
            {data.image ? (
              <img
                src={data.image}
                alt={data.name}
                loading="lazy"
                className="w-[280px] md:w-[320px] rounded-xl shadow-2xl shadow-black/60 ring-1 ring-border"
              />
            ) : (
              <div className="w-[280px] md:w-[320px] aspect-[3/4] bg-secondary rounded-xl flex items-center justify-center text-muted-foreground text-sm">
                Sin imagen
              </div>
            )}

            <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition duration-300 pointer-events-none shadow-[0_0_40px_rgba(34,197,94,0.2)]" />
          </motion.div>
        </div>

        {/* INFO */}
        <div className="flex flex-col gap-4 relative">

          {data.attribute && (
            <div className="absolute top-0 right-0">
              <div
                className={`flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs font-bold tracking-widest uppercase ${attrStyle}`}
              >
                <span className="text-[9px] opacity-70 mb-0.5">
                  ATTR
                </span>
                {data.attribute}
              </div>
            </div>
          )}

          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight pr-20">
            {data.name}
          </h1>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <span
                key={tag + i}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  i === 0
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-secondary text-muted-foreground border-border"
                }`}
              >
                {tag}
              </span>
            ))}
          </div>

          <StatBlock
            level={data.level}
            atk={data.atk}
            def={data.def}
          />

          {data.desc && (
            <div className="bg-secondary/40 border border-border rounded-xl p-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {data.desc}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}