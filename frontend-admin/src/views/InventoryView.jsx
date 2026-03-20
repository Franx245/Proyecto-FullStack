import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Check,
  Eye,
  EyeOff,
  History,
  LoaderCircle,
  PackageSearch,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  ConfirmActionDialog,
  EmptyState,
  PaginationControls,
  cn,
  currency,
  getAdminCardImageProps,
} from "./shared";
import { getAdminCardDetail } from "../lib/api";

const DEFAULT_FILTERS = {
  search: "",
  rarity: "all",
  cardType: "all",
  stockStatus: "all",
  visibility: "all",
};

const STOCK_STATUS_OPTIONS = [
  { value: "all", label: "Todo el stock" },
  { value: "out_of_stock", label: "Agotado" },
  { value: "low_stock", label: "Stock bajo" },
  { value: "available", label: "Disponible" },
];

const VISIBILITY_OPTIONS = [
  { value: "all", label: "Toda visibilidad" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Oculta" },
];

const ROW_HEIGHT = 78;
const OVERSCAN = 8;

function formatCatalogLabel(value, fallback) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return fallback;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "unknown" || lowered === "n/a" || lowered === "null" || lowered === "undefined") {
    return fallback;
  }

  return normalized;
}

function normalizeCatalogOptions(values, fallback) {
  return [...new Set((values || []).map((value) => formatCatalogLabel(value, fallback)).filter(Boolean))];
}

function getStatusMeta(card) {
  if ((card.stock || 0) <= 0) {
    return {
      label: "Agotada",
      className: "border-rose-500/20 bg-rose-500/10 text-rose-200",
    };
  }

  if ((card.stock || 0) <= (card.low_stock_threshold || 0)) {
    return {
      label: "Stock bajo",
      className: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    };
  }

  return {
    label: "Disponible",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  };
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryPanel({ title, emptyMessage, entries, renderEntry }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-white">
        <History className="h-4 w-4 text-slate-400" />
        <p className="font-semibold">{title}</p>
      </div>
      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400">{emptyMessage}</div>
        ) : entries.map((entry) => renderEntry(entry))}
      </div>
    </div>
  );
}

function numberField(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function ToggleCell({ checked, disabled, onChange, activeLabel, inactiveLabel }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200",
        checked ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
        disabled ? "opacity-60" : ""
      )}
    >
      {checked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      <span>{checked ? activeLabel : inactiveLabel}</span>
    </button>
  );
}

const InventoryRow = memo(function InventoryRow({
  card,
  canEditInventory,
  isSelected,
  isDeletingCards,
  onSelectedChange,
  onOpen,
  onRequestDelete,
  onSave,
}) {
  const [draft, setDraft] = useState(() => ({
    price: String(card.price ?? 0),
    stock: String(card.stock ?? 0),
    low_stock_threshold: String(card.low_stock_threshold ?? 0),
    is_visible: Boolean(card.is_visible),
    is_featured: Boolean(card.is_featured),
  }));
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });
  const committedRef = useRef(draft);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    const nextDraft = {
      price: String(card.price ?? 0),
      stock: String(card.stock ?? 0),
      low_stock_threshold: String(card.low_stock_threshold ?? 0),
      is_visible: Boolean(card.is_visible),
      is_featured: Boolean(card.is_featured),
    };

    setDraft(nextDraft);
    committedRef.current = nextDraft;
    setSaveState({ status: "idle", message: "" });
  }, [card.id, card.updated_at, card.price, card.stock, card.low_stock_threshold, card.is_visible, card.is_featured]);

  useEffect(() => {
    if (!canEditInventory) {
      return undefined;
    }

    const hasChanges = JSON.stringify(draft) !== JSON.stringify(committedRef.current);
    if (!hasChanges) {
      return undefined;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        setSaveState({ status: "saving", message: "Guardando..." });
        await onSave(card.id, {
          price: numberField(draft.price, card.price),
          stock: numberField(draft.stock, card.stock),
          low_stock_threshold: numberField(draft.low_stock_threshold, card.low_stock_threshold),
          is_visible: Boolean(draft.is_visible),
          is_featured: Boolean(draft.is_featured),
        });
        committedRef.current = draft;
        setSaveState({ status: "saved", message: "Guardado" });
        window.setTimeout(() => {
          setSaveState((current) => (current.status === "saved" ? { status: "idle", message: "" } : current));
        }, 1400);
      } catch (error) {
        setSaveState({ status: "error", message: error.message || "No se pudo guardar" });
      }
    }, 420);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [canEditInventory, card.id, card.low_stock_threshold, card.price, card.stock, draft, onSave]);

  const statusMeta = getStatusMeta({
    stock: numberField(draft.stock, card.stock),
    low_stock_threshold: numberField(draft.low_stock_threshold, card.low_stock_threshold),
  });

  return (
    <div
      className="grid h-[78px] grid-cols-[48px_290px_120px_108px_96px_96px_124px_108px_108px_132px_132px] border-b border-white/5 text-sm text-slate-300 transition duration-150 hover:bg-white/[0.04]"
      onClick={() => onOpen(card)}
    >
      <div className="sticky left-0 z-20 flex items-center justify-center border-r border-white/5 bg-[#090d1f] px-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => {
            event.stopPropagation();
            onSelectedChange(card.id, event.target.checked);
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => onOpen(card)}
        className="sticky left-[48px] z-10 flex min-w-0 items-center gap-3 border-r border-white/5 bg-[#090d1f] px-4 text-left"
      >
        <img {...getAdminCardImageProps(card.image)} alt={card.name} className="h-12 w-9 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{card.name}</p>
          <p className="truncate text-xs text-slate-500">{formatCatalogLabel(card.card_type, "Carta")}</p>
        </div>
      </button>

      <div className="flex items-center px-4">
        <span className="inline-flex max-w-full truncate rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
          {formatCatalogLabel(card.rarity, "Sin especificar")}
        </span>
      </div>

      <div className="flex items-center px-3">
        <input
          type="number"
          step="0.01"
          disabled={!canEditInventory}
          value={draft.price}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
          className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
        />
      </div>

      <div className="flex items-center px-3">
        <input
          type="number"
          disabled={!canEditInventory}
          value={draft.stock}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft((current) => ({ ...current, stock: event.target.value }))}
          className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
        />
      </div>

      <div className="flex items-center px-3">
        <input
          type="number"
          disabled={!canEditInventory}
          value={draft.low_stock_threshold}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft((current) => ({ ...current, low_stock_threshold: event.target.value }))}
          className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
        />
      </div>

      <div className="flex items-center px-3">
        <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", statusMeta.className)}>
          {statusMeta.label}
        </span>
      </div>

      <div className="flex items-center px-3">
        <ToggleCell
          checked={Boolean(draft.is_visible)}
          disabled={!canEditInventory}
          onChange={(value) => setDraft((current) => ({ ...current, is_visible: value }))}
          activeLabel="Visible"
          inactiveLabel="Oculta"
        />
      </div>

      <div className="flex items-center px-3">
        <ToggleCell
          checked={Boolean(draft.is_featured)}
          disabled={!canEditInventory}
          onChange={(value) => setDraft((current) => ({ ...current, is_featured: value }))}
          activeLabel="Destacada"
          inactiveLabel="Normal"
        />
      </div>

      <div className="flex items-center px-4 text-xs text-slate-400">
        {formatDateTime(card.updated_at)}
      </div>

      <div className="flex items-center justify-between gap-2 px-3">
        <div className="min-w-0 text-xs">
          {saveState.status === "saving" ? <span className="inline-flex items-center gap-1 text-sky-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Guardando</span> : null}
          {saveState.status === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="h-3.5 w-3.5" /> Guardado</span> : null}
          {saveState.status === "error" ? <span className="truncate text-rose-300">{saveState.message}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(card);
            }}
            className="rounded-xl border border-white/10 p-2 text-slate-300 transition duration-200 hover:bg-white/[0.06]"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canEditInventory || isDeletingCards}
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(card);
            }}
            className="rounded-xl border border-rose-500/20 p-2 text-rose-200 transition duration-200 hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

function InventoryDrawer({ card, onClose, onSave, onRequestDelete, canEditInventory, isDeletingCards }) {
  const [activeHistoryTab, setActiveHistoryTab] = useState("price");
  const [stockAdjustment, setStockAdjustment] = useState(1);
  const [detailState, setDetailState] = useState({ loading: false, detail: null, error: "" });

  useEffect(() => {
    setActiveHistoryTab("price");
    setStockAdjustment(1);
  }, [card?.id, card?.updated_at]);

  useEffect(() => {
    if (!card?.id) {
      setDetailState({ loading: false, detail: null, error: "" });
      return undefined;
    }

    let cancelled = false;
    setDetailState({ loading: true, detail: null, error: "" });

    getAdminCardDetail(card.id)
      .then((detail) => {
        if (!cancelled) {
          setDetailState({ loading: false, detail, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailState({ loading: false, detail: null, error: error.message || "No se pudo cargar el detalle" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [card?.id]);

  if (!card) {
    return null;
  }

  const detailCard = detailState.detail?.card || card;
  const priceHistory = detailState.detail?.price_history || [];
  const stockHistory = detailState.detail?.stock_history || [];
  const statusMeta = getStatusMeta(detailCard);
  const historyTabs = [
    { key: "price", label: "Precio", count: priceHistory.length },
    { key: "stock", label: "Stock", count: stockHistory.length },
  ];

  return (
    <>
      <button type="button" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/72 backdrop-blur-sm" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-white/10 bg-[#090d1f]/96 shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Detalle de carta</p>
            <h3 className="mt-2 text-2xl font-black text-white">{detailCard.name}</h3>
            <p className="mt-2 text-sm text-slate-400">{formatCatalogLabel(detailCard.rarity, "Sin especificar")} · {formatCatalogLabel(detailCard.card_type, "Carta")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 p-3 text-slate-300 transition duration-200 hover:bg-white/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <img {...getAdminCardImageProps(detailCard.image)} alt={detailCard.name} className="h-28 w-20 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", statusMeta.className)}>{statusMeta.label}</span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">ID #{detailCard.id}</span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{detailCard.description || "Sin descripción adicional."}</p>
            </div>
          </div>

          {detailState.loading ? (
            <div className="animate-pulse rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">Cargando historial...</div>
          ) : null}

          {detailState.error ? (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">{detailState.error}</div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Precio actual</p>
              <p className="mt-3 text-2xl font-black text-white">{currency(detailCard.price)}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Stock actual</p>
              <p className="mt-3 text-2xl font-black text-white">{detailCard.stock}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-white">
                <History className="h-4 w-4 text-slate-400" />
                <p className="font-semibold">Historial de cambios</p>
              </div>
              <div className="inline-flex rounded-2xl border border-white/10 bg-slate-950/40 p-1">
                {historyTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveHistoryTab(tab.key)}
                    className={cn(
                      "rounded-xl px-3 py-2 text-xs font-semibold transition duration-200",
                      activeHistoryTab === tab.key ? "bg-amber-400/15 text-amber-100" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {activeHistoryTab === "price" ? (
              <div className="mt-4">
                <HistoryPanel
                  title="Historial de precio"
                  emptyMessage="Todavía no hay cambios de precio registrados."
                  entries={priceHistory}
                  renderEntry={(entry) => (
                    <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
                      <p className="font-semibold text-white">{currency(entry.previous_price)} → {currency(entry.next_price)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.created_at)} · {entry.source}</p>
                    </div>
                  )}
                />
              </div>
            ) : null}

            {activeHistoryTab === "stock" ? (
              <div className="mt-4">
                <HistoryPanel
                  title="Historial de stock"
                  emptyMessage="Todavía no hay cambios de stock registrados."
                  entries={stockHistory}
                  renderEntry={(entry) => (
                    <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
                      <p className="font-semibold text-white">{entry.previous_stock} → {entry.next_stock} unidades</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.created_at)} · {entry.source}</p>
                    </div>
                  )}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Ajuste rápido de stock</p>
            <div className="mt-4 flex items-center gap-3">
              <input
                type="number"
                value={stockAdjustment}
                onChange={(event) => setStockAdjustment(numberField(event.target.value, 1))}
                className="h-11 w-24 rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-amber-400"
              />
              <button
                type="button"
                disabled={!canEditInventory}
                onClick={() => onSave(detailCard.id, { stock: Math.max(0, Number(detailCard.stock || 0) + Number(stockAdjustment || 0)) })}
                className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition duration-200 hover:bg-emerald-400/15 disabled:opacity-60"
              >
                Ajustar stock
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-5 sm:px-6">
          <button
            type="button"
            disabled={!canEditInventory || isDeletingCards}
            onClick={() => onRequestDelete(detailCard)}
            className="w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition duration-200 hover:bg-rose-500/15 disabled:opacity-60"
          >
            Eliminar carta
          </button>
        </div>
      </aside>
    </>
  );
}

export default function InventoryView({
  cardsPage,
  page,
  filters,
  onFiltersChange,
  onPageChange,
  onSyncCatalog,
  onRefresh,
  syncMutation,
  catalogSyncToken,
  isInventoryRefreshing,
  onSave,
  onBulkUpdate,
  onDeleteCards,
  isBulkSaving,
  isDeletingCards,
  canEditInventory,
}) {
  const [searchInput, setSearchInput] = useState(filters.search || "");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectionMode, setSelectionMode] = useState("manual");
  const [bulkDraft, setBulkDraft] = useState({ price: "", stock: "", visibility: "visible" });
  const [activeCardId, setActiveCardId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const viewportRef = useRef(null);
  const recoveryAttemptRef = useRef(new Set());
  const deferredSearch = useDeferredValue(searchInput);

  const cards = cardsPage?.cards || [];
  const total = cardsPage?.total || 0;
  const totalPages = cardsPage?.totalPages || 1;
  const rarityOptions = useMemo(() => normalizeCatalogOptions(cardsPage?.filters?.rarities || [], "Sin especificar"), [cardsPage?.filters?.rarities]);
  const cardTypeOptions = useMemo(() => normalizeCatalogOptions(cardsPage?.filters?.cardTypes || [], "Carta"), [cardsPage?.filters?.cardTypes]);
  const activeCard = useMemo(() => cards.find((card) => card.id === activeCardId) || null, [activeCardId, cards]);

  useEffect(() => {
    setSearchInput(filters.search || "");
  }, [filters.search]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (deferredSearch !== filters.search) {
        onFiltersChange({ search: deferredSearch });
      }
    }, 220);

    return () => window.clearTimeout(handle);
  }, [deferredSearch, filters.search, onFiltersChange]);

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => cards.some((card) => card.id === id))));
  }, [cards]);

  useEffect(() => {
    setSelectionMode("manual");
    setSelectedIds(new Set());
    setActiveCardId(null);
  }, [filters.search, filters.rarity, filters.cardType, filters.stockStatus, filters.visibility]);

  useEffect(() => {
    if (selectionMode !== "all-filtered") {
      return;
    }

    setSelectedIds(new Set(cards.map((card) => card.id)));
  }, [cards, selectionMode]);

  const allVisibleSelected = cards.length > 0 && cards.every((card) => selectedIds.has(card.id));
  const allFilteredSelected = selectionMode === "all-filtered" && total > 0;
  const selectedCount = allFilteredSelected ? total : selectedIds.size;
  const inventoryMetrics = useMemo(() => {
    const visibleOnPage = cards.filter((card) => card.is_visible).length;
    const featuredOnPage = cards.filter((card) => card.is_featured).length;
    const lowStockOnPage = cards.filter((card) => Number(card.stock || 0) > 0 && Number(card.stock || 0) <= Number(card.low_stock_threshold || 0)).length;
    const outOfStockOnPage = cards.filter((card) => Number(card.stock || 0) <= 0).length;

    return {
      visibleOnPage,
      featuredOnPage,
      lowStockOnPage,
      outOfStockOnPage,
    };
  }, [cards]);

  const totalHeight = cards.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(cards.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = useMemo(() => cards.slice(startIndex, endIndex), [cards, endIndex, startIndex]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return undefined;
    }

    const updateHeight = () => {
      const nextHeight = Math.max(node.clientHeight || 0, 320);
      setViewportHeight(nextHeight);
    };

    updateHeight();

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(node);
    }

    window.addEventListener("resize", updateHeight);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = 0;
    setScrollTop(0);
  }, [page, filters.search, filters.rarity, filters.cardType, filters.stockStatus, filters.visibility]);

  const handleFilterSelect = useCallback((field, value) => {
    onFiltersChange({ [field]: value });
  }, [onFiltersChange]);

  const handleSelectedChange = useCallback((cardId, checked) => {
    setSelectionMode("manual");
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(cardId);
      } else {
        next.delete(cardId);
      }
      return next;
    });
  }, []);

  const handleSelectVisible = useCallback((checked) => {
    setSelectionMode("manual");
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const card of cards) {
        if (checked) {
          next.add(card.id);
        } else {
          next.delete(card.id);
        }
      }
      return next;
    });
  }, [cards]);

  const handleSelectAllMatching = useCallback(() => {
    if (allFilteredSelected) {
      setSelectionMode("manual");
      setSelectedIds(new Set());
      return;
    }

    setSelectionMode("all-filtered");
    setSelectedIds(new Set(cards.map((card) => card.id)));
  }, [allFilteredSelected, cards]);

  const buildSelectionPayload = useCallback(() => {
    if (allFilteredSelected) {
      return {
        ids: Array.from(selectedIds),
        filters,
        select_all_matching: true,
      };
    }

    return { ids: Array.from(selectedIds) };
  }, [allFilteredSelected, filters, selectedIds]);

  const handleBulkApply = useCallback(async (kind) => {
    if (!selectedCount) {
      return;
    }

    const selection = buildSelectionPayload();

    if (kind === "price" && bulkDraft.price !== "") {
      await onBulkUpdate(selection, { price: numberField(bulkDraft.price, 0) });
      return;
    }

    if (kind === "stock" && bulkDraft.stock !== "") {
      await onBulkUpdate(selection, { stock: numberField(bulkDraft.stock, 0) });
      return;
    }

    if (kind === "visibility") {
      await onBulkUpdate(selection, { is_visible: bulkDraft.visibility === "visible" });
    }
  }, [buildSelectionPayload, bulkDraft.price, bulkDraft.stock, bulkDraft.visibility, onBulkUpdate, selectedCount]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedCount) {
      return;
    }

    await onDeleteCards(buildSelectionPayload());
    setSelectedIds(new Set());
    setSelectionMode("manual");
    setActiveCardId(null);
    setConfirmState(null);
  }, [buildSelectionPayload, onDeleteCards, selectedCount]);

  const handleDeleteOne = useCallback(async (cardId) => {
    await onDeleteCards({ ids: [cardId] });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(cardId);
      return next;
    });
    setActiveCardId((current) => (current === cardId ? null : current));
    setConfirmState(null);
  }, [onDeleteCards]);

  const handleSaveCard = useCallback((cardId, draft) => onSave(cardId, draft), [onSave]);

  const hasActiveFilters = Boolean(
    (filters.search || "").trim() ||
    filters.rarity !== DEFAULT_FILTERS.rarity ||
    filters.cardType !== DEFAULT_FILTERS.cardType ||
    filters.stockStatus !== DEFAULT_FILTERS.stockStatus ||
    filters.visibility !== DEFAULT_FILTERS.visibility
  );

  const clearFilters = () => {
    setSearchInput("");
    onFiltersChange(DEFAULT_FILTERS);
  };

  useEffect(() => {
    if (typeof onRefresh !== "function" || isInventoryRefreshing || syncMutation?.isPending) {
      return;
    }

    if (hasActiveFilters || total > 0) {
      return;
    }

    const recoveryKey = JSON.stringify({
      page,
      search: filters.search || "",
      rarity: filters.rarity || "all",
      cardType: filters.cardType || "all",
      stockStatus: filters.stockStatus || "all",
      visibility: filters.visibility || "all",
    });

    if (recoveryAttemptRef.current.has(recoveryKey)) {
      return;
    }

    recoveryAttemptRef.current.add(recoveryKey);
    void onRefresh();
  }, [filters.cardType, filters.rarity, filters.search, filters.stockStatus, filters.visibility, hasActiveFilters, isInventoryRefreshing, onRefresh, page, syncMutation?.isPending, total]);

  return (
    <>
      <div className="space-y-4">
        <div className="glass sticky top-3 z-20 rounded-[30px] border border-white/10 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:px-6">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,auto)] 2xl:items-start">
            <div className="min-w-0">
              <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(170px,1fr))]">
                <div className="relative min-w-0 xl:col-span-2 2xl:col-span-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Buscar por nombre, rareza o tipo"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-11 pr-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
                  />
                </div>

                <select value={filters.rarity} onChange={(event) => handleFilterSelect("rarity", event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400">
                  <option value="all">Toda rareza</option>
                  {rarityOptions.map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}
                </select>
                <select value={filters.cardType} onChange={(event) => handleFilterSelect("cardType", event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400">
                  <option value="all">Todo tipo</option>
                  {cardTypeOptions.map((cardType) => <option key={cardType} value={cardType}>{cardType}</option>)}
                </select>
                <select value={filters.stockStatus} onChange={(event) => handleFilterSelect("stockStatus", event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400">
                  {STOCK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={filters.visibility} onChange={(event) => handleFilterSelect("visibility", event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400">
                  {VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                <span className="rounded-full border border-white/10 px-3 py-2">{total} resultados</span>
                <span className="rounded-full border border-white/10 px-3 py-2">Página {page} / {totalPages}</span>
                {isInventoryRefreshing ? <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-sky-300">Actualizando</span> : null}
                {catalogSyncToken ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-emerald-300">Catálogo sincronizado</span> : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Visibles</p>
                  <p className="mt-2 text-xl font-black text-white">{inventoryMetrics.visibleOnPage}</p>
                  <p className="text-xs text-slate-500">en esta página</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Destacadas</p>
                  <p className="mt-2 text-xl font-black text-white">{inventoryMetrics.featuredOnPage}</p>
                  <p className="text-xs text-slate-500">listas para portada</p>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100/80">Stock bajo</p>
                  <p className="mt-2 text-xl font-black text-white">{inventoryMetrics.lowStockOnPage}</p>
                  <p className="text-xs text-amber-100/70">vigilar reposición</p>
                </div>
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-rose-100/80">Agotadas</p>
                  <p className="mt-2 text-xl font-black text-white">{inventoryMetrics.outOfStockOnPage}</p>
                  <p className="text-xs text-rose-100/70">sin venta inmediata</p>
                </div>
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-sky-100/80">Selección</p>
                  <p className="mt-2 text-xl font-black text-white">{selectedCount}</p>
                  <p className="text-xs text-sky-100/70">{allFilteredSelected ? "todo el filtro" : "selección manual"}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1 2xl:justify-items-stretch">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06] disabled:opacity-40"
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                onClick={() => handleSelectVisible(!allVisibleSelected)}
                disabled={!cards.length}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]"
              >
                {allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}
              </button>
              <button
                type="button"
                onClick={handleSelectAllMatching}
                disabled={!total}
                className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200 transition duration-200 hover:bg-amber-400/15 disabled:opacity-50"
              >
                {allFilteredSelected ? "Quitar selección global" : `Seleccionar todo el filtro (${total})`}
              </button>
              <button
                type="button"
                onClick={onSyncCatalog}
                disabled={!canEditInventory || syncMutation?.isPending}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition duration-200 hover:bg-emerald-400/15 disabled:opacity-60"
              >
                <RefreshCcw className={cn("h-4 w-4", syncMutation?.isPending ? "animate-spin" : "")} />
                Sincronizar catálogo
              </button>
            </div>
          </div>
        </div>

        <div className="glass overflow-hidden rounded-[30px] border border-white/10">
          {!cards.length ? (
            <div className="p-6 sm:p-8">
              <EmptyState
                icon={Boxes}
                title="No hay cartas para este filtro"
                description={hasActiveFilters ? "Quitá o ajustá filtros para volver a ver resultados sin perder el panel de control." : "Sincronizá el catálogo o revisá la configuración de alcance para cargar cartas."}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]"
                  >
                    Quitar filtros
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRefresh?.()}
                  disabled={isInventoryRefreshing}
                  className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-200 transition duration-200 hover:bg-sky-400/15 disabled:opacity-60"
                >
                  {isInventoryRefreshing ? "Recargando..." : "Recargar inventario"}
                </button>
                <button
                  type="button"
                  onClick={onSyncCatalog}
                  disabled={!canEditInventory || syncMutation?.isPending}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition duration-200 hover:bg-emerald-400/15 disabled:opacity-60"
                >
                  <RefreshCcw className={cn("h-4 w-4", syncMutation?.isPending ? "animate-spin" : "")} />
                  Sincronizar catálogo
                </button>
              </div>
            </div>
          ) : (
            <>
              <div ref={viewportRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} className="max-h-[calc(100vh-19rem)] overflow-auto">
                <div className="min-w-[1360px]">
                  <div className="sticky top-0 z-30 grid grid-cols-[48px_290px_120px_108px_96px_96px_124px_108px_108px_132px_132px] border-b border-white/10 bg-[#0b1022]/95 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 backdrop-blur-xl">
                    <div className="sticky left-0 z-30 flex items-center justify-center border-r border-white/5 bg-[#0b1022]/95 px-2 py-3">
                      <input type="checkbox" checked={allVisibleSelected} onChange={(event) => handleSelectVisible(event.target.checked)} />
                    </div>
                    <div className="sticky left-[48px] z-20 border-r border-white/5 bg-[#0b1022]/95 px-4 py-3">Carta</div>
                    <div className="px-4 py-3">Rareza</div>
                    <div className="px-3 py-3">Precio</div>
                    <div className="px-3 py-3">Stock</div>
                    <div className="px-3 py-3">Umbral</div>
                    <div className="px-3 py-3">Status</div>
                    <div className="px-3 py-3">Visible</div>
                    <div className="px-3 py-3">Destacada</div>
                    <div className="px-4 py-3">Última actualización</div>
                    <div className="px-3 py-3">Acciones</div>
                  </div>

                  <div className="relative" style={{ height: `${totalHeight}px` }}>
                    {visibleRows.map((card, index) => (
                      <div
                        key={card.id}
                        style={{ position: "absolute", left: 0, right: 0, top: `${(startIndex + index) * ROW_HEIGHT}px` }}
                      >
                        <InventoryRow
                          card={card}
                          canEditInventory={canEditInventory}
                          isSelected={allFilteredSelected || selectedIds.has(card.id)}
                          isDeletingCards={isDeletingCards}
                          onSelectedChange={handleSelectedChange}
                          onOpen={(nextCard) => setActiveCardId(nextCard.id)}
                          onRequestDelete={(nextCard) => setConfirmState({ type: "single-delete", card: nextCard })}
                          onSave={handleSaveCard}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
            </>
          )}
        </div>
      </div>

      {selectedCount ? (
        <div className="fixed bottom-5 left-1/2 z-40 w-[min(100%-24px,980px)] -translate-x-1/2 rounded-[28px] border border-white/10 bg-[#090d1f]/96 px-4 py-4 shadow-[0_22px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-sm text-slate-200">
              <span className="font-semibold text-white">{selectedCount} cartas seleccionadas</span>
              <span className="ml-2 text-slate-400">{allFilteredSelected ? "La acción se aplicará a todo el filtro actual." : "Aplicá cambios masivos sin salir de la tabla."}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input type="number" step="0.01" value={bulkDraft.price} onChange={(event) => setBulkDraft((current) => ({ ...current, price: event.target.value }))} placeholder="Precio" className="h-11 w-28 rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-amber-400" />
              <button type="button" disabled={isBulkSaving || bulkDraft.price === ""} onClick={() => handleBulkApply("price")} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200 transition duration-200 hover:bg-amber-400/15 disabled:opacity-60">
                Actualizar precio
              </button>

              <input type="number" value={bulkDraft.stock} onChange={(event) => setBulkDraft((current) => ({ ...current, stock: event.target.value }))} placeholder="Stock" className="h-11 w-24 rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-amber-400" />
              <button type="button" disabled={isBulkSaving || bulkDraft.stock === ""} onClick={() => handleBulkApply("stock")} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06] disabled:opacity-60">
                Actualizar stock
              </button>

              <select value={bulkDraft.visibility} onChange={(event) => setBulkDraft((current) => ({ ...current, visibility: event.target.value }))} className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400">
                <option value="visible">Visible</option>
                <option value="hidden">Oculta</option>
              </select>
              <button type="button" disabled={isBulkSaving} onClick={() => handleBulkApply("visibility")} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition duration-200 hover:bg-emerald-400/15 disabled:opacity-60">
                Aplicar visibilidad
              </button>

              <button type="button" onClick={() => { setSelectionMode("manual"); setSelectedIds(new Set()); }} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]">
                Limpiar selección
              </button>

              <button type="button" disabled={isDeletingCards} onClick={() => setConfirmState({ type: "bulk-delete" })} className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition duration-200 hover:bg-rose-500/15 disabled:opacity-60">
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <InventoryDrawer
        card={activeCard}
        onClose={() => setActiveCardId(null)}
        onSave={handleSaveCard}
        onRequestDelete={(card) => setConfirmState({ type: "single-delete", card })}
        canEditInventory={canEditInventory}
        isDeletingCards={isDeletingCards}
      />

      <ConfirmActionDialog
        open={Boolean(confirmState)}
        title={confirmState?.type === "bulk-delete" ? `Eliminar ${selectedCount} cartas` : `Eliminar ${confirmState?.card?.name || "carta"}`}
        description={confirmState?.type === "bulk-delete"
          ? "Las cartas con pedidos asociados se ocultarán y las restantes se eliminarán."
          : "Si la carta ya fue usada en pedidos, se ocultará en lugar de borrarse físicamente."
        }
        confirmLabel={confirmState?.type === "bulk-delete" ? "Sí, eliminar selección" : "Sí, eliminar carta"}
        pending={isDeletingCards}
        onCancel={() => {
          if (!isDeletingCards) {
            setConfirmState(null);
          }
        }}
        onConfirm={() => {
          if (confirmState?.type === "bulk-delete") {
            void handleDeleteSelected();
            return;
          }

          if (confirmState?.type === "single-delete" && confirmState.card?.id) {
            void handleDeleteOne(confirmState.card.id);
          }
        }}
      />
    </>
  );
}