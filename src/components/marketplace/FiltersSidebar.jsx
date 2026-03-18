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
      <Trigger className="flex items-center justify-between w-full py-2 text-sm font-semibold group">
        {title}
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </Trigger>

      <Content className="space-y-1 pb-3">
        {children}
      </Content>
    </Collapsible>
  );
}

/**
 * @param {{
 *  label: string,
 *  checked: boolean,
 *  onChange: () => void
 * }} props
 */
function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 py-1 px-1 rounded-md hover:bg-secondary/50 cursor-pointer text-sm transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 accent-primary"
      />
      <span className="text-muted-foreground flex-1">{label}</span>
    </label>
  );
}

/**
 * @param {{
 *  filters: Filters,
 *  onFilterChange: (f: Filters) => void,
 *  onClearFilters: () => void,
 *  sets?: string[]
 * }} props
 */
export default function FiltersSidebar({
  filters,
  onFilterChange,
  onClearFilters,
  sets = [],
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
    <aside className="sticky top-24 space-y-2 rounded-3xl border border-border bg-card/70 p-4 shadow-[0_20px_45px_rgba(0,0,0,0.18)]">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Filter className="w-4 h-4" />
          Filtros
        </h2>

        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
          >
            Limpiar
          </button>
        )}
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