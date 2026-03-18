import { Star } from "lucide-react";

/**
 * @param {{
 *  label: string,
 *  value?: number | null,
 *  color?: string,
 *  children?: import("react").ReactNode
 * }} props
 */
function StatCard({ label, value = null, color = "", children = null }) {
  const hasValue = value != null;

  return (
    <div className="flex flex-col items-center justify-center bg-secondary/60 rounded-xl py-3 border border-border min-h-[70px]">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </span>

      <div className="flex items-center gap-1">
        {children ? (
          children
        ) : (
          <span
            className={`text-lg font-bold ${
              hasValue ? color : "text-muted-foreground"
            }`}
          >
            {hasValue ? value : "—"}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{
 *  level?: number | null,
 *  atk?: number | null,
 *  def?: number | null
 * }} props
 */
export default function StatBlock({ level = null, atk = null, def = null }) {
  const hasLevel = level != null;

  return (
    <div className="grid grid-cols-3 gap-3">

      {/* ⭐ LEVEL */}
      <StatCard label="Level">
        {hasLevel ? (
          <>
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span className="text-lg font-bold text-yellow-300">
              {level}
            </span>
          </>
        ) : (
          <span className="text-lg font-bold text-muted-foreground">—</span>
        )}
      </StatCard>

      {/* ⚔️ ATK */}
      <StatCard
        label="ATK"
        value={atk}
        color="text-red-400"
      />

      {/* 🛡 DEF */}
      <StatCard
        label="DEF"
        value={def}
        color="text-blue-400"
      />

    </div>
  );
}