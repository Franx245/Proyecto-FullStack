import { useCallback, useMemo } from "react";
import { Filter, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * @typedef {{ label: string, min: number, max: number | null }} PriceRange
 */

/**
 * @typedef {{
 *  rarities: string[],
 *  cardTypes: string[],
 *  conditions: string[],
 *  sets: string[],
 *  priceRange: PriceRange | null
 * }} Filters
 */

const RARITIES = [
  "Common",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Starlight Rare",
];

const CARD_TYPES = ["Monster", "Spell", "Trap"];

const CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
];

/** @type {PriceRange[]} */
const PRICE_RANGES = [
  { label: "Under $5", min: 0, max: 5 },
  { label: "$5 – $25", min: 5, max: 25 },
  { label: "$25 – $100", min: 25, max: 100 },
  { label: "$100+", min: 100, max: null },
];

/**
 * ⚠️ Fix Radix typing issues (JS + TS hybrid)
 */
const Trigger = /** @type {any} */ (CollapsibleTrigger);
const Content = /** @type {any} */ (CollapsibleContent);

/**
 * @param {{
 *  title: string,
 *  children: import("react").ReactNode,
 *  defaultOpen?: boolean
 * }} props
 */
function FilterSection({ title, children, defaultOpen = true }) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Trigger className="group flex w-full items-center justify-between py-2 text-sm font-semibold text-slate-200 transition hover:text-white">
        {title}
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </Trigger>

      <Content className="space-y-1.5 pb-3">
        {children}
      </Content>
    </Collapsible>
  );
}

/**
 * @param {{
 *  label: string,
 *  checked: boolean,
 *  onChange: () => void,
 *  disabled?: boolean
 * }} props
 */
function Checkbox({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-all duration-200 ease-out ${checked ? "border-emerald-400/25 bg-emerald-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_26px_rgba(16,185,129,0.08)]" : "border-transparent hover:border-white/10 hover:bg-secondary/60"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer active:scale-[0.99]"}` } data-state={checked ? "checked" : "unchecked"}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-3.5 h-3.5 accent-primary"
      />
      <span className={`flex-1 transition-colors ${checked ? "text-emerald-50" : "text-muted-foreground group-hover:text-foreground"}`}>{label}</span>
      <span className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${checked ? "bg-emerald-300 opacity-100 shadow-[0_0_12px_rgba(110,231,183,0.7)]" : "opacity-0"}`} />
    </label>
  );
}

/**
 * @param {{
 *  filters: Filters,
 *  onFilterChange: (f: Filters) => void,
 *  onClearFilters: () => void,
 *  sets?: string[],
 *  isPending?: boolean
 * }} props
 */
export default function FiltersSidebar({
  filters,
  onFilterChange,
  onClearFilters,
  sets = [],
  isPending = false,
}) {

  const hasFilters = useMemo(() => {
    return Boolean(
      filters.rarities.length ||
      filters.cardTypes.length ||
      filters.conditions.length ||
      filters.sets.length ||
      filters.priceRange
    );
  }, [filters]);

  const activeFiltersCount = useMemo(() => {
    return filters.rarities.length
      + filters.cardTypes.length
      + filters.conditions.length
      + filters.sets.length
      + (filters.priceRange ? 1 : 0);
  }, [filters]);

  const toggleArray = useCallback(
    /**
     * @param {"rarities" | "cardTypes" | "conditions" | "sets"} key
     * @param {string} value
     */
    (key, value) => {
      const current = filters[key];

      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      onFilterChange({
        ...filters,
        [key]: updated,
      });
    },
    [filters, onFilterChange]
  );

  const togglePrice = useCallback(
    /**
     * @param {PriceRange} range
     */
    (range) => {
      onFilterChange({
        ...filters,
        priceRange:
          filters.priceRange?.label === range.label ? null : range,
      });
    },
    [filters, onFilterChange]
  );

  return (
    <aside className="sticky top-24 space-y-2 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_20px_45px_rgba(0,0,0,0.18)] backdrop-blur-xl" aria-busy={isPending} data-nav-pending={isPending ? "true" : "false"}>

      {/* HEADER */}
      <div className="mb-4 space-y-3">
        <h2 className="flex shrink-0 items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Filter className="w-4 h-4" />
          Filtros
        </h2>

        <div className="flex min-h-8 items-center gap-2">
          {isPending ? (
            <div className="catalog-feedback-pill inline-flex min-w-[7.5rem] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-emerald-300/18 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.65)]" />
              Aplicando
            </div>
          ) : hasFilters ? (
            <span className="inline-flex min-w-[7.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              {activeFiltersCount} activos
            </span>
          ) : null}

          {hasFilters && (
            <button
              onClick={onClearFilters}
              className="shrink-0 whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-primary/15"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* PRECIO */}
      <FilterSection title="Precio">
        {PRICE_RANGES.map((range) => (
          <Checkbox
            key={range.label}
            label={range.label}
            checked={filters.priceRange?.label === range.label}
            onChange={() => togglePrice(range)}
          />
        ))}
      </FilterSection>

      {/* RAREZA */}
      <FilterSection title="Rareza">
        {RARITIES.map((r) => (
          <Checkbox
            key={r}
            label={r}
            checked={filters.rarities.includes(r)}
            onChange={() => toggleArray("rarities", r)}
          />
        ))}
      </FilterSection>

      {/* TIPO */}
      <FilterSection title="Tipo de carta">
        {CARD_TYPES.map((t) => (
          <Checkbox
            key={t}
            label={t}
            checked={filters.cardTypes.includes(t)}
            onChange={() => toggleArray("cardTypes", t)}
          />
        ))}
      </FilterSection>

      {/* CONDICIÓN */}
      <FilterSection title="Condición" defaultOpen={false}>
        {CONDITIONS.map((c) => (
          <Checkbox
            key={c}
            label={c}
            checked={filters.conditions.includes(c)}
            onChange={() => toggleArray("conditions", c)}
          />
        ))}
      </FilterSection>

      {/* SETS */}
      {sets.length > 0 && (
        <FilterSection title="Expansión" defaultOpen={false}>
          {sets.slice(0, 15).map((s) => (
            <Checkbox
              key={s}
              label={s}
              checked={filters.sets.includes(s)}
              onChange={() => toggleArray("sets", s)}
            />
          ))}
        </FilterSection>
      )}
    </aside>
  );
}