import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ReceiptText, Search } from "lucide-react";
import {
  ActionStatusButton,
  EmptyState,
  PaginationControls,
  StatCard,
  StatusBadge,
  cn,
  currency,
  matchesOrderSearch,
  orderStatusLabel,
} from "./shared";

export default function OrdersView({ orders, onStatusChange, onDeleteOrder, onClearOrders, onExportOrders, onShippingSave, updatingOrderId, completedOrderActionKey, savingShippingOrderId, completedShippingOrderId, deletingOrderId, isClearingOrders, isExportingOrders, canCancelOrders, canDeleteOrders }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [shippingDrafts, setShippingDrafts] = useState({});
  const deferredSearch = useDeferredValue(search);
  const pageSize = 10;

  const allowedStatuses = canCancelOrders
    ? ["pending_payment", "paid", "shipped", "completed", "cancelled"]
    : ["pending_payment", "paid", "shipped", "completed"];

  const filteredOrders = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatches = statusFilter === "all" || order.status === statusFilter;
      return statusMatches && matchesOrderSearch(order, needle);
    });
  }, [deferredSearch, orders, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setShippingDrafts((current) => {
      const next = { ...current };
      for (const order of orders) {
        next[order.id] = {
          tracking_code: current[order.id]?.tracking_code ?? (order.tracking_code || ""),
          tracking_visible_to_user: current[order.id]?.tracking_visible_to_user ?? Boolean(order.tracking_visible_to_user),
        };
      }
      return next;
    });
  }, [orders]);

  const getShippingDraft = (order) => shippingDrafts[order.id] || {
    tracking_code: order.tracking_code || "",
    tracking_visible_to_user: Boolean(order.tracking_visible_to_user),
  };

  const updateShippingDraft = (orderId, field, value) => {
    setShippingDrafts((current) => ({
      ...current,
      [orderId]: {
        tracking_code: current[orderId]?.tracking_code ?? "",
        tracking_visible_to_user: current[orderId]?.tracking_visible_to_user ?? false,
        ...current[orderId],
        [field]: value,
      },
    }));
  };

  const pendingCount = orders.filter((order) => order.status === "pending_payment").length;
  const countedCount = orders.filter((order) => order.counts_for_dashboard).length;
  const isActionCompleted = (orderId, status) => completedOrderActionKey === `${orderId}:${status}`;
  const isShippingSaved = (orderId) => completedShippingOrderId === orderId;

  if (orders.length === 0) {
    return <EmptyState icon={ReceiptText} title="No hay pedidos cargados" description="Los pedidos confirmados desde la tienda aparecerán aquí con su estado actual." />;
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Control de pedidos</p>
            <h2 className="mt-1 text-xl font-black text-white">Confirmación manual y limpieza</h2>
            <p className="mt-2 text-sm text-slate-400">Ahora podés filtrar por estados nuevos, revisar envío y trabajar sobre clientes autenticados sin perder trazabilidad.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onExportOrders}
              disabled={isExportingOrders}
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              {isExportingOrders ? "Exportando..." : "Exportar Excel"}
            </button>
            {canDeleteOrders ? (
              <button
                onClick={() => {
                  if (window.confirm("Esto eliminará todos los pedidos y devolverá stock/ventas a su estado anterior. ¿Continuar?")) {
                    onClearOrders();
                  }
                }}
                disabled={isClearingOrders}
                className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
              >
                {isClearingOrders ? "Limpiando..." : "Limpiar pedidos de prueba"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard title="Pedidos totales" value={orders.length} />
          <StatCard title="Pendientes" value={pendingCount} tone={pendingCount ? "warn" : "default"} />
          <StatCard title="Contabilizados" value={countedCount} />
          <StatCard title="Resultados" value={filteredOrders.length} />
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por pedido, cliente, email o carta"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
          >
            <option value="all">Todos los estados</option>
            {allowedStatuses.map((status) => (
              <option key={status} value={status}>{orderStatusLabel(status)}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Sin coincidencias" description="Ajustá la búsqueda o el filtro de estado para encontrar el pedido." />
      ) : (
        <div className="space-y-4">
          <div className="space-y-4 lg:hidden">
            {paginatedOrders.map((order) => (
              <div key={order.id} className="glass rounded-3xl border border-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    <p className="mt-2 font-bold text-white">{currency(order.total)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-xs text-slate-300">
                  <span className={cn("rounded-full px-3 py-1 font-semibold", order.counts_for_dashboard ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300")}>
                    {order.counts_for_dashboard ? "Contabiliza ventas" : "No contabiliza"}
                  </span>
                  {order.customer_name ? <span>Cliente: {order.customer_name}</span> : null}
                  {order.customer_email ? <span>{order.customer_email}</span> : null}
                  <span>{order.items.length} ítems</span>
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3 text-xs text-slate-300">
                  <p>{order.shipping_label || "Envío"} · {order.shipping_zone}</p>
                  {order.tracking_code ? <p className="mt-1 text-slate-300">Tracking: {order.tracking_code}</p> : null}
                  {order.shipping_address ? <p className="mt-1 text-slate-400">{order.shipping_address}</p> : null}
                </div>

                {order.is_shipping_order ? (
                  <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3 text-sm text-slate-300">
                    <input
                      value={getShippingDraft(order).tracking_code}
                      onChange={(event) => updateShippingDraft(order.id, "tracking_code", event.target.value)}
                      placeholder="Código de seguimiento"
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={getShippingDraft(order).tracking_visible_to_user}
                        onChange={(event) => updateShippingDraft(order.id, "tracking_visible_to_user", event.target.checked)}
                      />
                      Mostrar tracking al usuario
                    </label>
                    <ActionStatusButton
                      onClick={() => onShippingSave(order.id, getShippingDraft(order))}
                      pending={savingShippingOrderId === order.id}
                      success={isShippingSaved(order.id)}
                      idleLabel="Guardar tracking"
                      pendingLabel="Guardando tracking..."
                      successLabel="Tracking guardado"
                      className="border border-white/10 hover:bg-white/[0.06]"
                    >
                    </ActionStatusButton>
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <label className="space-y-1 text-sm text-slate-300">
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Estado</span>
                    <select
                      value={order.status}
                      disabled={updatingOrderId === order.id || order.status === "cancelled"}
                      onChange={(event) => onStatusChange(order.id, event.target.value)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                    >
                      {allowedStatuses.map((status) => (
                        <option key={status} value={status}>{orderStatusLabel(status)}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <ActionStatusButton
                      onClick={() => onStatusChange(order.id, "paid")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status !== "pending_payment"}
                      pending={updatingOrderId === order.id}
                      success={isActionCompleted(order.id, "paid")}
                      idleLabel="Confirmar pago"
                      pendingLabel="Actualizando..."
                      successLabel="Pago confirmado"
                      className="bg-sky-500 text-slate-950 hover:bg-sky-400"
                    >
                    </ActionStatusButton>
                    <ActionStatusButton
                      onClick={() => onStatusChange(order.id, "shipped")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status !== "paid"}
                      pending={updatingOrderId === order.id}
                      success={isActionCompleted(order.id, "shipped")}
                      idleLabel="Marcar enviado"
                      pendingLabel="Actualizando..."
                      successLabel="Envío actualizado"
                      className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    >
                    </ActionStatusButton>
                    <ActionStatusButton
                      onClick={() => onStatusChange(order.id, "completed")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status !== "shipped"}
                      pending={updatingOrderId === order.id}
                      success={isActionCompleted(order.id, "completed")}
                      idleLabel="Marcar completado"
                      pendingLabel="Actualizando..."
                      successLabel="Completado"
                      className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                    >
                    </ActionStatusButton>
                    {canCancelOrders ? (
                      <button
                        onClick={() => onStatusChange(order.id, "cancelled")}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "cancelled"}
                        className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {canDeleteOrders ? (
                      <button
                        onClick={() => {
                          if (window.confirm(`Eliminar el pedido #${order.id} y devolver stock/ventas?`)) {
                            onDeleteOrder(order.id);
                          }
                        }}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id}
                        className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-950/50 px-3 py-3">
                      <img src={item.card?.image} alt={item.card?.name} className="h-16 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                        <p className="text-sm text-slate-400">{item.quantity} x {currency(item.price)}</p>
                      </div>
                      <p className="font-bold text-white">{currency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden space-y-4 lg:block">
            {paginatedOrders.map((order) => (
              <details key={order.id} className="glass rounded-3xl border border-white/10 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={order.status} />
                    <span className="font-bold text-white">{currency(order.total)}</span>
                  </div>
                </summary>

                <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <span className="text-slate-400">Dashboard:</span>
                    <span className={cn("rounded-full px-3 py-1 font-semibold", order.counts_for_dashboard ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300")}>
                      {order.counts_for_dashboard ? "Contabiliza ventas" : "No contabiliza todavía"}
                    </span>
                    {order.customer_name ? <span className="text-slate-400">Cliente: {order.customer_name}</span> : null}
                    {order.customer_email ? <span className="text-slate-400">Email: {order.customer_email}</span> : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
                    <p>{order.shipping_label || "Envío"} · {order.shipping_zone}</p>
                    {order.tracking_code ? <p className="mt-1 text-slate-300">Tracking: {order.tracking_code}</p> : null}
                    {order.shipping_address ? <p className="mt-1 text-slate-400">{order.shipping_address}</p> : null}
                  </div>

                  {order.is_shipping_order ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <div className="space-y-3">
                          <input
                            value={getShippingDraft(order).tracking_code}
                            onChange={(event) => updateShippingDraft(order.id, "tracking_code", event.target.value)}
                            placeholder="Código de seguimiento"
                            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
                          />
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={getShippingDraft(order).tracking_visible_to_user}
                              onChange={(event) => updateShippingDraft(order.id, "tracking_visible_to_user", event.target.checked)}
                            />
                            Mostrar tracking al usuario
                          </label>
                        </div>
                        <ActionStatusButton
                          onClick={() => onShippingSave(order.id, getShippingDraft(order))}
                          pending={savingShippingOrderId === order.id}
                          success={isShippingSaved(order.id)}
                          idleLabel="Guardar tracking"
                          pendingLabel="Guardando tracking..."
                          successLabel="Tracking guardado"
                          className="border border-white/10 hover:bg-white/[0.06]"
                        >
                        </ActionStatusButton>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Order status</p>
                      <p className="mt-1 text-sm text-slate-300">Actualizá el estado operativo y el sistema ajusta ventas y stock automáticamente cuando corresponde.</p>
                    </div>
                    <select
                      value={order.status}
                      disabled={updatingOrderId === order.id || order.status === "cancelled"}
                      onChange={(event) => onStatusChange(order.id, event.target.value)}
                      className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                    >
                      {allowedStatuses.map((status) => (
                        <option key={status} value={status}>{orderStatusLabel(status)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ActionStatusButton
                      onClick={() => onStatusChange(order.id, "paid")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status !== "pending_payment"}
                      pending={updatingOrderId === order.id}
                      success={isActionCompleted(order.id, "paid")}
                      idleLabel="Confirmar pago"
                      pendingLabel="Actualizando..."
                      successLabel="Pago confirmado"
                      className="bg-sky-500 py-2 text-slate-950 hover:bg-sky-400"
                    >
                    </ActionStatusButton>
                    <ActionStatusButton
                      onClick={() => onStatusChange(order.id, "shipped")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status !== "paid"}
                      pending={updatingOrderId === order.id}
                      success={isActionCompleted(order.id, "shipped")}
                      idleLabel="Marcar enviado"
                      pendingLabel="Actualizando..."
                      successLabel="Envío actualizado"
                      className="bg-emerald-500 py-2 text-slate-950 hover:bg-emerald-400"
                    >
                    </ActionStatusButton>
                    <ActionStatusButton
                      onClick={() => onStatusChange(order.id, "completed")}
                      disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status !== "shipped"}
                      pending={updatingOrderId === order.id}
                      success={isActionCompleted(order.id, "completed")}
                      idleLabel="Marcar completado"
                      pendingLabel="Actualizando..."
                      successLabel="Completado"
                      className="bg-amber-500 py-2 text-slate-950 hover:bg-amber-400"
                    >
                    </ActionStatusButton>
                    {canCancelOrders ? (
                      <button
                        onClick={() => onStatusChange(order.id, "cancelled")}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id || order.status === "cancelled"}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {canDeleteOrders ? (
                      <button
                        onClick={() => {
                          if (window.confirm(`Eliminar el pedido #${order.id} y devolver stock/ventas?`)) {
                            onDeleteOrder(order.id);
                          }
                        }}
                        disabled={updatingOrderId === order.id || deletingOrderId === order.id}
                        className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>

                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-slate-950/50 px-4 py-3">
                      <img src={item.card?.image} alt={item.card?.name} className="h-16 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                        <p className="text-sm text-slate-400">{item.quantity} x {currency(item.price)}</p>
                      </div>
                      <p className="font-bold text-white">{currency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="glass overflow-hidden rounded-3xl border border-white/10">
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}