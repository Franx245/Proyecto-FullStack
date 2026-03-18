import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import {
  EmptyState,
  PaginationControls,
  StatCard,
  cn,
} from "./shared";

export default function HomeMerchandisingView({ cards, onSave, onBulkUpdate, savingCardId, isBulkSaving, canEditHome }) {
  const [drafts, setDrafts] = useState(() => new Map());
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const pageSize = 24;

  const rows = useMemo(() => {
    return cards.filter((card) => {
      const needle = deferredSearch.trim().toLowerCase();
      if (!needle) return true;
      return [card.name, card.rarity, card.card_type].some((value) => value?.toLowerCase().includes(needle));
    }).map((card) => ({
      ...card,
      draft: drafts.get(card.id) || {
        is_featured: card.is_featured,
        is_new_arrival: card.is_new_arrival,
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

  const featuredCount = rows.filter((card) => Boolean(card.draft.is_featured)).length;
  const newArrivalCount = rows.filter((card) => Boolean(card.draft.is_new_arrival)).length;

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

  const runBulkUpdate = useCallback((updates) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      return;
    }

    onBulkUpdate(ids, updates);
  }, [onBulkUpdate, selectedIds]);

  const pageIds = paginatedRows.map((card) => card.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((cardId) => selectedIds.has(cardId));

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl border border-white/10 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Home merchandising</p>
            <h2 className="mt-1 text-xl font-black text-white">Destacados y últimos ingresos</h2>
            <p className="mt-2 text-sm text-slate-400">La búsqueda recorre todo el catálogo y la edición se pagina para que responda mejor en desktop y mobile.</p>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cartas para la home"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatCard title="Resultados" value={rows.length} />
          <StatCard title="Destacadas" value={featuredCount} />
          <StatCard title="Últimos ingresos" value={newArrivalCount} />
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">Selección:</span>
            <span>{selectedIds.size} cartas</span>
            <button onClick={selectFilteredRows} className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]" disabled={!rows.length}>
              Seleccionar resultados
            </button>
            <button onClick={() => togglePageSelection(true)} className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]" disabled={!paginatedRows.length}>
              Seleccionar página
            </button>
            <button onClick={clearSelection} className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]" disabled={!selectedIds.size}>
              Limpiar selección
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
            <span className="rounded-full border border-white/10 px-3 py-2">Página {page} de {totalPages}</span>
            <span className="rounded-full border border-white/10 px-3 py-2">{paginatedRows.length} visibles ahora</span>
            <span className="rounded-full border border-white/10 px-3 py-2">Búsqueda global</span>
          </div>
          {canEditHome ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => runBulkUpdate({ is_featured: true })} className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50" disabled={!selectedIds.size || isBulkSaving}>
                Marcar destacadas
              </button>
              <button onClick={() => runBulkUpdate({ is_featured: false })} className="rounded-xl border border-white/10 px-4 py-2 font-semibold transition hover:bg-white/[0.06] disabled:opacity-50" disabled={!selectedIds.size || isBulkSaving}>
                Quitar destacadas
              </button>
              <button onClick={() => runBulkUpdate({ is_new_arrival: true })} className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50" disabled={!selectedIds.size || isBulkSaving}>
                Marcar ingresos
              </button>
              <button onClick={() => runBulkUpdate({ is_new_arrival: false })} className="rounded-xl border border-white/10 px-4 py-2 font-semibold transition hover:bg-white/[0.06] disabled:opacity-50" disabled={!selectedIds.size || isBulkSaving}>
                Quitar ingresos
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No hay cartas para configurar"
          description="Probá otra búsqueda para seleccionar qué cartas van a la portada."
        />
      ) : (
        <div className="glass overflow-hidden rounded-3xl border border-white/10">
          <div className="space-y-3 p-4 lg:hidden">
            {paginatedRows.map((card) => (
              <div key={card.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selectedIds.has(card.id)} onChange={(event) => toggleCardSelection(card.id, event.target.checked)} className="mt-2" />
                  <img src={card.image} alt={card.name} className="h-20 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{card.name}</p>
                        <p className="text-xs text-slate-400">{card.rarity}</p>
                      </div>
                      <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", card.is_visible ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                        {card.is_visible ? "Visible" : "Oculta"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-300">
                      <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEditHome} checked={Boolean(card.draft.is_featured)} onChange={(event) => updateDraft(card.id, "is_featured", event.target.checked)} /> Destacada</label>
                      <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEditHome} checked={Boolean(card.draft.is_new_arrival)} onChange={(event) => updateDraft(card.id, "is_new_arrival", event.target.checked)} /> Último ingreso</label>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => onSave(card.id, card.draft)}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canEditHome || savingCardId === card.id}
                      >
                        {savingCardId === card.id ? "Guardando..." : canEditHome ? "Guardar" : "Solo lectura"}
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
                  <th className="px-4 py-3 font-medium">Visible</th>
                  <th className="px-4 py-3 font-medium">Destacada</th>
                  <th className="px-4 py-3 font-medium">Último ingreso</th>
                  <th className="px-4 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((card) => (
                  <tr key={card.id} className="border-t border-white/5">
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
                      <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", card.is_visible ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                        {card.is_visible ? "Visible" : "Oculta"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" disabled={!canEditHome} checked={Boolean(card.draft.is_featured)} onChange={(event) => updateDraft(card.id, "is_featured", event.target.checked)} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" disabled={!canEditHome} checked={Boolean(card.draft.is_new_arrival)} onChange={(event) => updateDraft(card.id, "is_new_arrival", event.target.checked)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onSave(card.id, card.draft)}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canEditHome || savingCardId === card.id}
                      >
                        {savingCardId === card.id ? "Guardando..." : canEditHome ? "Guardar" : "Solo lectura"}
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