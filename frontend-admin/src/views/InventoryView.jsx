import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Boxes, Search } from "lucide-react";
import {
  EmptyState,
  PaginationControls,
  cardStatusLabel,
  cn,
} from "./shared";

export default function InventoryView({ cards, onSave, onBulkUpdate, savingCardId, isBulkSaving, canEditInventory }) {
  const [drafts, setDrafts] = useState(() => new Map());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDraft, setBulkDraft] = useState({
    price: "",
    stock: "",
    low_stock_threshold: "",
  });

  const deferredSearch = useDeferredValue(search);
  const pageSize = 50;

  const rows = useMemo(() => {
    return cards.filter((card) => {
      const needle = deferredSearch.trim().toLowerCase();
      if (!needle) return true;
      return [card.name, card.rarity, card.card_type].some((value) => value?.toLowerCase().includes(needle));
    }).map((card) => ({
      ...card,
      draft: drafts.get(card.id) || {
        price: card.price,
        stock: card.stock,
        low_stock_threshold: card.low_stock_threshold,
        is_visible: card.is_visible,
        is_featured: card.is_featured,
      },
    }));
  }, [cards, deferredSearch, drafts]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, rows]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const updateDraft = useCallback((cardId, field, value) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(cardId) || {};
      next.set(cardId, { ...current, [field]: value });
      return next;
    });
  }, []);

  const toggleCardSelection = useCallback((cardId, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(cardId);
      } else {
        next.delete(cardId);
      }
      return next;
    });
  }, []);

  const togglePageSelection = useCallback((checked) => {
    const pageIds = paginatedRows.map((card) => card.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((cardId) => {
        if (checked) {
          next.add(cardId);
        } else {
          next.delete(cardId);
        }
      });
      return next;
    });
  }, [paginatedRows]);

  const selectFilteredRows = useCallback(() => {
    setSelectedIds(new Set(rows.map((card) => card.id)));
  }, [rows]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const updateBulkDraft = useCallback((field, value) => {
    setBulkDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const selectedCount = selectedIds.size;
  const pageIds = paginatedRows.map((card) => card.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((cardId) => selectedIds.has(cardId));

  const runBulkUpdate = useCallback((updates) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      return;
    }

    onBulkUpdate(ids, updates);
  }, [onBulkUpdate, selectedIds]);

  const applyBulkField = useCallback((field) => {
    const value = bulkDraft[field];
    if (value === "") {
      return;
    }

    runBulkUpdate({ [field]: Number(value) });
  }, [bulkDraft, runBulkUpdate]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl border border-white/10 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Inventory controls</p>
            <h2 className="mt-1 text-xl font-black text-white">Inventario operativo</h2>
            <p className="mt-2 text-sm text-slate-400">{rows.length} cartas en resultados · página {page} de {totalPages}</p>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, rareza o tipo"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="font-semibold text-white">Selección:</span>
            <span>{selectedCount} cartas</span>
            <button onClick={selectFilteredRows} className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]" disabled={!rows.length}>
              Seleccionar resultados
            </button>
            <button onClick={() => togglePageSelection(true)} className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]" disabled={!paginatedRows.length}>
              Seleccionar página
            </button>
            <button onClick={clearSelection} className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]" disabled={!selectedCount}>
              Limpiar selección
            </button>
          </div>

          {canEditInventory ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Precio</label>
                <input type="number" step="0.01" className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2" value={bulkDraft.price} onChange={(event) => updateBulkDraft("price", event.target.value)} />
              </div>
              <button onClick={() => applyBulkField("price")} className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/15 disabled:opacity-50" disabled={!selectedCount || isBulkSaving || bulkDraft.price === ""}>
                Aplicar precio
              </button>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Stock</label>
                <input type="number" className="w-24 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2" value={bulkDraft.stock} onChange={(event) => updateBulkDraft("stock", event.target.value)} />
              </div>
              <button onClick={() => applyBulkField("stock")} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50" disabled={!selectedCount || isBulkSaving || bulkDraft.stock === ""}>
                Aplicar stock
              </button>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Threshold</label>
                <input type="number" className="w-24 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2" value={bulkDraft.low_stock_threshold} onChange={(event) => updateBulkDraft("low_stock_threshold", event.target.value)} />
              </div>
              <button onClick={() => applyBulkField("low_stock_threshold")} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50" disabled={!selectedCount || isBulkSaving || bulkDraft.low_stock_threshold === ""}>
                Aplicar threshold
              </button>
              <button onClick={() => runBulkUpdate({ is_visible: true })} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50" disabled={!selectedCount || isBulkSaving}>
                Hacer visibles
              </button>
              <button onClick={() => runBulkUpdate({ is_visible: false })} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-50" disabled={!selectedCount || isBulkSaving}>
                Ocultar
              </button>
            </div>
          ) : null}
        </div>

        {!canEditInventory ? (
          <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
            Tu rol STAFF puede consultar inventario, pero no modificar precios, stock ni visibilidad.
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No hay cartas para mostrar"
          description="Ajustá la búsqueda o volvé a intentar después de sincronizar el inventario."
        />
      ) : (
        <div className="glass overflow-hidden rounded-3xl border border-white/10">
          <div className="space-y-3 p-4 lg:hidden">
            {paginatedRows.map((card) => (
              <div key={card.id} className={cn("rounded-3xl border border-white/10 bg-slate-950/40 p-4", card.status === "low_stock" && "border-amber-400/20", card.status === "out_of_stock" && "border-rose-400/20")}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selectedIds.has(card.id)} onChange={(event) => toggleCardSelection(card.id, event.target.checked)} className="mt-2" />
                  <img src={card.image} alt={card.name} className="h-20 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{card.name}</p>
                        <p className="text-xs text-slate-400">{card.rarity}</p>
                      </div>
                      <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", card.status === "in_stock" && "bg-emerald-500/15 text-emerald-300", card.status === "low_stock" && "bg-amber-500/15 text-amber-300", card.status === "out_of_stock" && "bg-rose-500/15 text-rose-300")}>
                        {cardStatusLabel(card)}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <label className="space-y-1 text-slate-300">
                        <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Precio</span>
                        <input type="number" step="0.01" disabled={!canEditInventory} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 disabled:opacity-60" value={card.draft.price} onChange={(event) => updateDraft(card.id, "price", event.target.value)} />
                      </label>
                      <label className="space-y-1 text-slate-300">
                        <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Stock</span>
                        <input type="number" disabled={!canEditInventory} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 disabled:opacity-60" value={card.draft.stock} onChange={(event) => updateDraft(card.id, "stock", event.target.value)} />
                      </label>
                      <label className="space-y-1 text-slate-300">
                        <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Threshold</span>
                        <input type="number" disabled={!canEditInventory} className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 disabled:opacity-60" value={card.draft.low_stock_threshold} onChange={(event) => updateDraft(card.id, "low_stock_threshold", event.target.value)} />
                      </label>
                      <div className="space-y-2 text-slate-300">
                        <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Flags</span>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEditInventory} checked={Boolean(card.draft.is_visible)} onChange={(event) => updateDraft(card.id, "is_visible", event.target.checked)} /> Visible</label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEditInventory} checked={Boolean(card.draft.is_featured)} onChange={(event) => updateDraft(card.id, "is_featured", event.target.checked)} /> Featured</label>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button onClick={() => onSave(card.id, card.draft)} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canEditInventory || savingCardId === card.id}>
                        {savingCardId === card.id ? "Guardando..." : canEditInventory ? "Guardar" : "Solo lectura"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <input type="checkbox" disabled={!paginatedRows.length} checked={allPageSelected} onChange={(event) => togglePageSelection(event.target.checked)} />
                  </th>
                  <th className="px-4 py-3 font-medium">Carta</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Threshold</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Visible</th>
                  <th className="px-4 py-3 font-medium">Featured</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((card) => (
                  <tr key={card.id} className={cn("border-t border-white/5", card.status === "low_stock" && "bg-amber-500/5", card.status === "out_of_stock" && "bg-rose-500/8")}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(card.id)} onChange={(event) => toggleCardSelection(card.id, event.target.checked)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={card.image} alt={card.name} className="h-16 w-12 rounded-lg object-cover" />
                        <div>
                          <p className="font-semibold text-white">{card.name}</p>
                          <p className="text-xs text-slate-400">{card.rarity}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" step="0.01" disabled={!canEditInventory} className="w-24 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 disabled:opacity-60" value={card.draft.price} onChange={(event) => updateDraft(card.id, "price", event.target.value)} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" disabled={!canEditInventory} className="w-20 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 disabled:opacity-60" value={card.draft.stock} onChange={(event) => updateDraft(card.id, "stock", event.target.value)} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" disabled={!canEditInventory} className="w-20 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 disabled:opacity-60" value={card.draft.low_stock_threshold} onChange={(event) => updateDraft(card.id, "low_stock_threshold", event.target.value)} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", card.status === "in_stock" && "bg-emerald-500/15 text-emerald-300", card.status === "low_stock" && "bg-amber-500/15 text-amber-300", card.status === "out_of_stock" && "bg-rose-500/15 text-rose-300")}>
                        {cardStatusLabel(card)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" disabled={!canEditInventory} checked={Boolean(card.draft.is_visible)} onChange={(event) => updateDraft(card.id, "is_visible", event.target.checked)} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" disabled={!canEditInventory} checked={Boolean(card.draft.is_featured)} onChange={(event) => updateDraft(card.id, "is_featured", event.target.checked)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onSave(card.id, card.draft)} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canEditInventory || savingCardId === card.id}>
                        {savingCardId === card.id ? "Guardando..." : canEditInventory ? "Guardar" : "Solo lectura"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}