import { memo, useEffect, useState } from "react";
import { Check, Copy, CreditCard, Package, Printer, ReceiptText, Search, Truck } from "lucide-react";
import {
  ActionStatusButton,
  ConfirmActionDialog,
  EmptyState,
  PaginationControls,
  StatCard,
  cn,
  getAdminCardImageProps,
  orderStatusLabel,
} from "./shared";

const ORDER_STATUS_META = {
  paid: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
  pending_payment: "border-amber-500/25 bg-amber-500/15 text-amber-300",
  cancelled: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  failed: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  expired: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  shipped: "border-sky-500/25 bg-sky-500/15 text-sky-300",
  completed: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
};

const PAYMENT_STATUS_META = {
  approved: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
  pending: "border-amber-500/25 bg-amber-500/15 text-amber-300",
  in_process: "border-slate-500/25 bg-slate-500/15 text-slate-300",
  rejected: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  failed: "border-rose-500/25 bg-rose-500/15 text-rose-300",
};

const SHIPMENT_STATUS_META = {
  created: "border-sky-500/25 bg-sky-500/15 text-sky-300",
  pending: "border-slate-500/25 bg-slate-500/15 text-slate-300",
  picked_up: "border-violet-500/25 bg-violet-500/15 text-violet-300",
  in_transit: "border-amber-500/25 bg-amber-500/15 text-amber-300",
  out_for_delivery: "border-orange-500/25 bg-orange-500/15 text-orange-300",
  delivered: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
  cancelled: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  returned: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  shipped: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
  completed: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
  pickup: "border-violet-500/25 bg-violet-500/15 text-violet-300",
};

const MANUAL_SHIPMENT_STATUS_OPTIONS = [
  { value: "created", label: "Creado" },
  { value: "picked_up", label: "Retirado" },
  { value: "in_transit", label: "En tránsito" },
  { value: "out_for_delivery", label: "En reparto" },
  { value: "delivered", label: "Entregado" },
];
const LOCALHOST_SHIPMENT_STATUS_OPTIONS = [
  { value: "created", label: "Preparando" },
  { value: "picked_up", label: "Retirado" },
  { value: "in_transit", label: "En tránsito" },
  { value: "delivered", label: "Entregado" },
];
const MANUAL_SHIPMENT_STATUS_VALUES = new Set(MANUAL_SHIPMENT_STATUS_OPTIONS.map((option) => option.value));

function isLocalhostRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function formatStatusText(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "SIN DATO";
  }

  if (normalized === "pending_payment") {
    return "PENDING";
  }

  if (normalized === "in_process") {
    return "IN PROCESS";
  }

  return normalized.replace(/_/g, " ").toUpperCase();
}

function getStatusClassName(type, value) {
  const normalized = String(value || "").trim().toLowerCase();
  const maps = {
    order: ORDER_STATUS_META,
    payment: PAYMENT_STATUS_META,
    shipment: SHIPMENT_STATUS_META,
  };

  return maps[type]?.[normalized] || "border-white/10 bg-white/5 text-slate-300";
}

function resolvePaymentBadgeValue(order) {
  const paymentStatus = String(order.payment_status || "").trim().toLowerCase();
  if (paymentStatus) {
    return paymentStatus;
  }

  if (["paid", "shipped", "completed"].includes(order.status)) {
    return "approved";
  }

  if (["failed", "expired", "cancelled"].includes(order.status)) {
    return "rejected";
  }

  return "pending";
}

function resolveShipmentBadgeValue(order) {
  const shipmentStatus = String(order.shipment_status || "").trim().toLowerCase();
  if (shipmentStatus) {
    return shipmentStatus;
  }

  if (!order.is_shipping_order) {
    return "pickup";
  }

  if (order.status === "completed") {
    return "delivered";
  }

  if (order.status === "shipped") {
    return "in_transit";
  }

  return "pending";
}

function resolveEditableShipmentStatus(order) {
  const shipmentStatus = String(order.shipment_status || "").trim().toLowerCase();
  if (MANUAL_SHIPMENT_STATUS_VALUES.has(shipmentStatus)) {
    return shipmentStatus;
  }

  if (order.status === "completed") {
    return "delivered";
  }

  if (order.status === "shipped") {
    return "in_transit";
  }

  return "created";
}

function resolveOrderTrackingCode(order) {
  return String(order?.tracking_code || order?.trackingCode || order?.shipping?.tracking_code || order?.shipping?.trackingCode || "").trim();
}

function hasShipmentStatusSource(order) {
  return Boolean(String(order?.shipmentId || order?.shipment_id || resolveOrderTrackingCode(order) || order?.trackingNumber || "").trim());
}

function StatusPill({ type, value }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]",
      getStatusClassName(type, value)
    )}
    >
      {formatStatusText(value)}
    </span>
  );
}

function InfoSection({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        <Icon className="h-4 w-4 text-slate-500" />
        <span>{title}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-200">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, className }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className={cn("max-w-[70%] text-right text-slate-100", className)}>{value || "-"}</span>
    </div>
  );
}

function carrierLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["correoargentino", "correo-argentino"].includes(normalized)) {
    return "Correo Argentino";
  }

  if (normalized === "andreani") {
    return "Andreani";
  }

  if (normalized === "showroom") {
    return "Retiro en showroom";
  }

  return value;
}

function getTransitionOptions(status, canCancelOrders) {
  const transitions = {
    pending_payment: ["pending_payment", "paid", "failed", "expired", ...(canCancelOrders ? ["cancelled"] : [])],
    failed: ["failed", "pending_payment", ...(canCancelOrders ? ["cancelled"] : [])],
    expired: ["expired", "pending_payment", ...(canCancelOrders ? ["cancelled"] : [])],
    paid: ["paid", "pending_payment", "shipped", ...(canCancelOrders ? ["cancelled"] : [])],
    shipped: ["shipped", "pending_payment", "paid", "completed", ...(canCancelOrders ? ["cancelled"] : [])],
    completed: ["completed", "shipped"],
    cancelled: ["cancelled"],
  };

  return transitions[status] || [status];
}

function getOrderQuickActions(order, canCancelOrders) {
  return getTransitionOptions(order?.status, canCancelOrders)
    .filter((status) => ["paid", "shipped", "completed"].includes(status) && status !== order?.status)
    .map((status) => ({
      status,
      idleLabel: status === "paid"
        ? (order?.status === "shipped" ? "Volver a pagado" : "Marcar pagado")
        : status === "shipped"
          ? (order?.status === "completed" ? "Volver a enviado" : "Marcar enviado")
          : "Marcar completado",
      successLabel: status === "paid" ? "Pago confirmado" : status === "shipped" ? "Envio actualizado" : "Completado",
      className: status === "paid"
        ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
        : status === "shipped"
          ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          : "bg-amber-500 text-slate-950 hover:bg-amber-400",
    }));
}

function formatOrderMoney(value, currencyCode = "ARS") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }

  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: String(currencyCode || "ARS").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currencyCode || "ARS").toUpperCase()}`;
  }
}

function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

function resolveOrderDestination(order) {
  return order?.shipping_address || order?.shipping?.address?.city || order?.address?.city || "-";
}

function OrderOverviewSections({ order, copiedTrackingOrderId, onCopyTracking, onOpenLabel }) {
  const paymentBadgeValue = resolvePaymentBadgeValue(order);
  const shipmentBadgeValue = resolveShipmentBadgeValue(order);
  const copied = copiedTrackingOrderId === order.id;
  const trackingCode = resolveOrderTrackingCode(order);
  const orderCurrency = String(order.currency || "ARS").toUpperCase();
  const orderTotalLabel = formatOrderMoney(order.total, orderCurrency);
  const mercadoPagoTotalLabel = order.total_ars ? formatOrderMoney(order.total_ars, "ARS") : null;
  const shippingCost = Number(order.shipping_cost);
  const shippingCostLabel = order.is_shipping_order
    ? (Number.isFinite(shippingCost)
        ? (shippingCost === 0 ? "GRATIS" : formatOrderMoney(shippingCost, orderCurrency))
        : "Pendiente de cotización")
    : "Retiro en showroom";

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <InfoSection icon={CreditCard} title="Pago">
        <div className="flex items-center justify-between gap-3">
          <StatusPill type="payment" value={paymentBadgeValue} />
          <p className="text-lg font-black text-white">{orderTotalLabel}</p>
        </div>
        <InfoRow label="Estado" value={formatStatusText(paymentBadgeValue)} />
        <InfoRow label="Total pedido" value={orderTotalLabel} className="font-semibold text-white" />
        {mercadoPagoTotalLabel ? <InfoRow label="Cobro MP" value={mercadoPagoTotalLabel} /> : null}
        {order.expires_at ? <InfoRow label="Expira" value={new Date(order.expires_at).toLocaleString("es-AR")} /> : null}
      </InfoSection>

      <InfoSection icon={Truck} title="Envío">
        <div className="flex items-center justify-between gap-3">
          <StatusPill type="shipment" value={shipmentBadgeValue} />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{order.shipping_zone}</span>
        </div>
        <InfoRow label="Carrier" value={carrierLabel(order.carrier) || "Sin carrier"} />
        <InfoRow label="Servicio" value={order.shipping_label || "Sin servicio"} />
        <InfoRow label="Costo" value={shippingCostLabel} className="font-semibold text-white" />
        <InfoRow label="Tracking" value={trackingCode || "Sin tracking"} className="font-mono text-xs text-slate-200" />
        <InfoRow label="Destino" value={resolveOrderDestination(order)} className="text-xs text-slate-300" />
      </InfoSection>

      <InfoSection icon={Package} title="Acciones">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onCopyTracking(order)}
            disabled={!trackingCode}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? "Tracking copiado" : "Copiar tracking"}</span>
          </button>

          {order.shipping_label_url ? (
            <button
              type="button"
              onClick={() => onOpenLabel(order.shipping_label_url)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              <Printer className="h-4 w-4" />
              <span>Descargar etiqueta</span>
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-center text-sm text-slate-500">
              Etiqueta no disponible
            </div>
          )}
        </div>
      </InfoSection>
    </div>
  );
}

function ShipmentStatusOverridePanel({ canOverride, value, onChange, onSave, pending, success, disabled, localSimulation = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className={cn("grid gap-3", !localSimulation && "md:grid-cols-[minmax(0,1fr)_auto] md:items-end")}>
        <div className="min-w-0 space-y-2">
          <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
            {localSimulation ? "Estado de envío local" : "Estado manual de envío"}
          </span>
          {localSimulation ? (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))]">
              {LOCALHOST_SHIPMENT_STATUS_OPTIONS.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    disabled={disabled || !canOverride}
                    className={cn(
                      "min-h-14 min-w-0 rounded-2xl border px-4 py-3 text-center text-sm font-semibold leading-tight break-words transition disabled:opacity-60",
                      selected
                        ? "border-amber-400 bg-amber-400/15 text-amber-200"
                        : "border-white/10 bg-slate-950/70 text-slate-200 hover:bg-white/[0.06]"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <select
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled || !canOverride}
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
            >
              {MANUAL_SHIPMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
        </div>

        <ActionStatusButton
          onClick={onSave}
          pending={pending}
          success={success}
          disabled={disabled || !canOverride}
          idleLabel="Actualizar envío"
          pendingLabel="Actualizando..."
          successLabel="Envío actualizado"
          className={cn("border border-white/10 hover:bg-white/[0.06]", localSimulation && "w-full")}
        >
        </ActionStatusButton>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {localSimulation
          ? (canOverride
              ? "Simulación local controlada. Actualiza solo el estado de envío usado en localhost."
              : "Disponible solo para pedidos con envío en la simulación local.")
          : (canOverride
              ? "Fallback manual. El webhook y el polling de Envia siguen siendo la fuente automática del tracking real."
              : "Disponible cuando el pedido tenga tracking cargado o un shipment creado.")}
      </p>
    </div>
  );
}

export default memo(function OrdersView({ orders = [], summary, pagination, filters, onFiltersChange, onPageChange, onStatusChange, onDeleteOrder, onClearOrders, onExportOrders, onShippingSave, onShipmentStatusSave, updatingOrderId, completedOrderActionKey, savingShippingOrderId, savingShipmentStatusOrderId, completedShippingOrderId, completedShipmentStatusOrderId, deletingOrderId, isClearingOrders, isExportingOrders, canCancelOrders, canDeleteOrders }) {
  const [shippingDrafts, setShippingDrafts] = useState({});
  const [shipmentStatusDrafts, setShipmentStatusDrafts] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const [copiedTrackingOrderId, setCopiedTrackingOrderId] = useState(null);
  const localhostSimulation = isLocalhostRuntime();

  const filterStatuses = canCancelOrders
    ? ["pending_payment", "failed", "expired", "paid", "shipped", "completed", "cancelled"]
    : ["pending_payment", "failed", "expired", "paid", "shipped", "completed"];

  useEffect(() => {
    if (!confirmState) {
      return;
    }

    if (confirmState.type === "clear" && !isClearingOrders) {
      return;
    }

    if (confirmState.type === "delete" && deletingOrderId !== confirmState.orderId) {
      return;
    }

    if (confirmState.type === "cancel" && updatingOrderId !== confirmState.orderId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConfirmState(null);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [confirmState, deletingOrderId, isClearingOrders, updatingOrderId]);

  useEffect(() => {
    setShippingDrafts((current) => {
      const next = { ...current };
      for (const order of orders) {
        next[order.id] = {
          carrier: current[order.id]?.carrier ?? (order.carrier || ""),
          tracking_code: current[order.id]?.tracking_code ?? resolveOrderTrackingCode(order),
          tracking_visible_to_user: current[order.id]?.tracking_visible_to_user ?? Boolean(order.tracking_visible_to_user),
        };
      }
      return next;
    });
  }, [orders]);

  useEffect(() => {
    setShipmentStatusDrafts((current) => {
      const next = { ...current };
      for (const order of orders) {
        next[order.id] = resolveEditableShipmentStatus(order);
      }
      return next;
    });
  }, [orders]);

  const getShippingDraft = (order) => shippingDrafts[order.id] || {
    carrier: order.carrier || "",
    tracking_code: resolveOrderTrackingCode(order),
    tracking_visible_to_user: Boolean(order.tracking_visible_to_user),
  };

  const getShipmentStatusDraft = (order) => shipmentStatusDrafts[order.id] || resolveEditableShipmentStatus(order);

  const updateShippingDraft = (orderId, field, value) => {
    setShippingDrafts((current) => ({
      ...current,
      [orderId]: {
        carrier: current[orderId]?.carrier ?? "",
        tracking_code: current[orderId]?.tracking_code ?? "",
        tracking_visible_to_user: current[orderId]?.tracking_visible_to_user ?? false,
        ...current[orderId],
        [field]: value,
      },
    }));
  };

  const updateShipmentStatusDraft = (orderId, value) => {
    setShipmentStatusDrafts((current) => ({
      ...current,
      [orderId]: value,
    }));
  };

  const isActionCompleted = (orderId, status) => completedOrderActionKey === `${orderId}:${status}`;
  const isShippingSaved = (orderId) => completedShippingOrderId === orderId;
  const isShipmentStatusSaved = (orderId) => completedShipmentStatusOrderId === orderId;
  const isOrderStatusMutating = Boolean(updatingOrderId);
  const isConfirmPending = confirmState?.type === "clear"
    ? isClearingOrders
    : confirmState?.type === "delete"
      ? deletingOrderId === confirmState.orderId
      : confirmState?.type === "cancel"
        ? updatingOrderId === confirmState.orderId
        : false;

  const handleCopyTracking = async (order) => {
    const trackingCode = resolveOrderTrackingCode(order);
    if (!trackingCode || !window.navigator?.clipboard?.writeText) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(trackingCode);
      setCopiedTrackingOrderId(order.id);
      window.setTimeout(() => {
        setCopiedTrackingOrderId((current) => (current === order.id ? null : current));
      }, 1500);
    } catch {
      setCopiedTrackingOrderId(null);
    }
  };

  const handleOpenLabel = (labelUrl) => {
    if (!labelUrl) {
      return;
    }

    window.open(labelUrl, "_blank", "noopener,noreferrer");
  };

  if ((summary?.filteredTotal || 0) === 0) {
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
                onClick={() => setConfirmState({ type: "clear" })}
                disabled={isClearingOrders}
                className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
              >
                {isClearingOrders ? "Limpiando..." : "Limpiar pedidos de prueba"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard title="Pedidos totales" value={summary?.totalOrders || 0} />
          <StatCard title="Pendientes" value={summary?.pendingCount || 0} tone={(summary?.pendingCount || 0) ? "warn" : "default"} />
          <StatCard title="Contabilizados" value={summary?.countedCount || 0} />
          <StatCard title="Resultados" value={summary?.filteredTotal || 0} />
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={filters.search}
              onChange={(event) => onFiltersChange({ search: event.target.value })}
              placeholder="Buscar por pedido, cliente, email o carta"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400"
            />
          </div>
          <select
            value={filters.status}
            onChange={(event) => onFiltersChange({ status: event.target.value })}
            className="h-11 min-w-0 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
          >
            <option value="all">Todos los estados</option>
            {filterStatuses.map((status) => (
              <option key={status} value={status}>{orderStatusLabel(status)}</option>
            ))}
          </select>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Sin coincidencias" description="Ajustá la búsqueda o el filtro de estado para encontrar el pedido." />
      ) : (
        <div className="space-y-4">
          <div className="space-y-4 lg:hidden">
            {orders.map((order) => {
              const orderItems = getOrderItems(order);
              const quickActions = getOrderQuickActions(order, canCancelOrders);

              return (
                <div key={order.id} className="glass admin-list-card admin-content-auto rounded-3xl border border-white/10 p-4 transition duration-200 hover:border-white/20 hover:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusPill type="order" value={order.status} />
                      <StatusPill type="payment" value={resolvePaymentBadgeValue(order)} />
                      {order.is_shipping_order ? <StatusPill type="shipment" value={resolveShipmentBadgeValue(order)} /> : null}
                    </div>
                    <p className="mt-3 font-bold text-white">{formatOrderMoney(order.total, order.currency || "ARS")}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-xs text-slate-300">
                  <span className={cn("rounded-full px-3 py-1 font-semibold", order.counts_for_dashboard ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300")}>
                    {order.counts_for_dashboard ? "Contabiliza ventas" : "No contabiliza"}
                  </span>
                  {order.customer_name ? <span>Cliente: {order.customer_name}</span> : null}
                  {order.customer_email ? <span>{order.customer_email}</span> : null}
                  <span>{orderItems.length} ítems</span>
                </div>

                <div className="mt-3">
                  <OrderOverviewSections
                    order={order}
                    copiedTrackingOrderId={copiedTrackingOrderId}
                    onCopyTracking={handleCopyTracking}
                    onOpenLabel={handleOpenLabel}
                  />
                </div>

                {order.is_shipping_order ? (
                  <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3 text-sm text-slate-300">
                    <select
                      value={getShippingDraft(order).carrier}
                      onChange={(event) => updateShippingDraft(order.id, "carrier", event.target.value)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
                    >
                      <option value="">Carrier sin definir</option>
                      <option value="correo-argentino">Correo Argentino</option>
                      <option value="andreani">Andreani</option>
                    </select>
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
                      disabled={Boolean(savingShippingOrderId) || isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                      idleLabel="Guardar tracking"
                      pendingLabel="Guardando tracking..."
                      successLabel="Tracking guardado"
                      className="border border-white/10 hover:bg-white/[0.06]"
                    >
                    </ActionStatusButton>
                  </div>
                ) : null}

                {order.is_shipping_order ? (
                  <div className="mt-3">
                    <ShipmentStatusOverridePanel
                      canOverride={localhostSimulation ? true : hasShipmentStatusSource(order)}
                      value={getShipmentStatusDraft(order)}
                      onChange={(value) => updateShipmentStatusDraft(order.id, value)}
                      onSave={() => onShipmentStatusSave(order.id, getShipmentStatusDraft(order))}
                      pending={savingShipmentStatusOrderId === order.id}
                      success={isShipmentStatusSaved(order.id)}
                      disabled={Boolean(savingShipmentStatusOrderId) || isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                      localSimulation={localhostSimulation}
                    />
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <label className="space-y-1 text-sm text-slate-300">
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Estado</span>
                    <select
                      value={order.status}
                      disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders || order.status === "cancelled"}
                      onChange={(event) => onStatusChange(order.id, event.target.value)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                    >
                      {getTransitionOptions(order.status, canCancelOrders).map((status) => (
                        <option key={status} value={status}>{orderStatusLabel(status)}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickActions.map((action) => (
                      <ActionStatusButton
                        key={action.status}
                        onClick={() => onStatusChange(order.id, action.status)}
                        disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                        pending={updatingOrderId === order.id}
                        success={isActionCompleted(order.id, action.status)}
                        idleLabel={action.idleLabel}
                        pendingLabel="Actualizando..."
                        successLabel={action.successLabel}
                        className={action.className}
                      >
                      </ActionStatusButton>
                    ))}
                    {canCancelOrders ? (
                      <button
                        onClick={() => setConfirmState({ type: "cancel", orderId: order.id })}
                        disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders || order.status === "cancelled"}
                        className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {canDeleteOrders ? (
                      <button
                        onClick={() => setConfirmState({ type: "delete", orderId: order.id })}
                        disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                        className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-950/50 px-3 py-3">
                      <img {...getAdminCardImageProps(item.card?.image)} alt={item.card?.name} className="h-16 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                        <p className="text-sm text-slate-400">{item.quantity} x {formatOrderMoney(item.price, order.currency || "ARS")}</p>
                      </div>
                      <p className="font-bold text-white">{formatOrderMoney(item.subtotal, order.currency || "ARS")}</p>
                    </div>
                  ))}
                </div>
                </div>
              );
            })}
          </div>

          <div className="hidden space-y-4 lg:block">
            {orders.map((order) => {
              const orderItems = getOrderItems(order);
              const quickActions = getOrderQuickActions(order, canCancelOrders);

              return (
                <details key={order.id} className="glass admin-list-card admin-content-auto rounded-3xl border border-white/10 p-5 transition duration-200 hover:border-white/20 hover:bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill type="order" value={order.status} />
                    <StatusPill type="payment" value={resolvePaymentBadgeValue(order)} />
                    {order.is_shipping_order ? <StatusPill type="shipment" value={resolveShipmentBadgeValue(order)} /> : null}
                    <span className="font-bold text-white">{formatOrderMoney(order.total, order.currency || "ARS")}</span>
                  </div>
                </summary>

                <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <span className="text-slate-400">Panel:</span>
                    <span className={cn("rounded-full px-3 py-1 font-semibold", order.counts_for_dashboard ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300")}>
                      {order.counts_for_dashboard ? "Contabiliza ventas" : "No contabiliza todavía"}
                    </span>
                    {order.customer_name ? <span className="text-slate-400">Cliente: {order.customer_name}</span> : null}
                    {order.customer_email ? <span className="text-slate-400">Email: {order.customer_email}</span> : null}
                  </div>

                  <OrderOverviewSections
                    order={order}
                    copiedTrackingOrderId={copiedTrackingOrderId}
                    onCopyTracking={handleCopyTracking}
                    onOpenLabel={handleOpenLabel}
                  />

                  {order.is_shipping_order ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <div className="space-y-3">
                          <select
                            value={getShippingDraft(order).carrier}
                            onChange={(event) => updateShippingDraft(order.id, "carrier", event.target.value)}
                            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
                          >
                            <option value="">Carrier sin definir</option>
                            <option value="correo-argentino">Correo Argentino</option>
                            <option value="andreani">Andreani</option>
                          </select>
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
                          disabled={Boolean(savingShippingOrderId) || isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                          idleLabel="Guardar tracking"
                          pendingLabel="Guardando tracking..."
                          successLabel="Tracking guardado"
                          className="border border-white/10 hover:bg-white/[0.06]"
                        >
                        </ActionStatusButton>
                      </div>
                    </div>
                  ) : null}

                  {order.is_shipping_order ? (
                    <ShipmentStatusOverridePanel
                      canOverride={localhostSimulation ? true : hasShipmentStatusSource(order)}
                      value={getShipmentStatusDraft(order)}
                      onChange={(value) => updateShipmentStatusDraft(order.id, value)}
                      onSave={() => onShipmentStatusSave(order.id, getShipmentStatusDraft(order))}
                      pending={savingShipmentStatusOrderId === order.id}
                      success={isShipmentStatusSaved(order.id)}
                      disabled={Boolean(savingShipmentStatusOrderId) || isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                      localSimulation={localhostSimulation}
                    />
                  ) : null}

                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Estado del pedido</p>
                      <p className="mt-1 text-sm text-slate-300">Actualizá el estado operativo y el sistema ajusta ventas y stock automáticamente cuando corresponde.</p>
                    </div>
                    <select
                      value={order.status}
                      disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders || order.status === "cancelled"}
                      onChange={(event) => onStatusChange(order.id, event.target.value)}
                      className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                    >
                      {getTransitionOptions(order.status, canCancelOrders).map((status) => (
                        <option key={status} value={status}>{orderStatusLabel(status)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {quickActions.map((action) => (
                      <ActionStatusButton
                        key={action.status}
                        onClick={() => onStatusChange(order.id, action.status)}
                        disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                        pending={updatingOrderId === order.id}
                        success={isActionCompleted(order.id, action.status)}
                        idleLabel={action.idleLabel}
                        pendingLabel="Actualizando..."
                        successLabel={action.successLabel}
                        className={`${action.className} py-2`}
                      >
                      </ActionStatusButton>
                    ))}
                    {canCancelOrders ? (
                      <button
                        onClick={() => setConfirmState({ type: "cancel", orderId: order.id })}
                        disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders || order.status === "cancelled"}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {canDeleteOrders ? (
                      <button
                        onClick={() => setConfirmState({ type: "delete", orderId: order.id })}
                        disabled={isOrderStatusMutating || Boolean(deletingOrderId) || isClearingOrders}
                        className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>

                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-slate-950/50 px-4 py-3">
                      <img {...getAdminCardImageProps(item.card?.image)} alt={item.card?.name} className="h-16 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                        <p className="text-sm text-slate-400">{item.quantity} x {formatOrderMoney(item.price, order.currency || "ARS")}</p>
                      </div>
                      <p className="font-bold text-white">{formatOrderMoney(item.subtotal, order.currency || "ARS")}</p>
                    </div>
                  ))}
                </div>
                </details>
              );
            })}
          </div>

          <div className="glass overflow-hidden rounded-3xl border border-white/10">
            <PaginationControls page={pagination?.page || 1} totalPages={pagination?.totalPages || 1} onPageChange={onPageChange} />
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(confirmState)}
        title={confirmState?.type === "clear"
          ? "Limpiar pedidos de prueba"
          : confirmState?.type === "cancel"
            ? `Cancelar pedido #${confirmState?.orderId || ""}`
            : `Eliminar pedido #${confirmState?.orderId || ""}`}
        description={confirmState?.type === "clear"
          ? "Se eliminarán solo los pedidos de prueba detectados por email o buyer sandbox, y se revertirán stock y ventas asociados cuando corresponda."
          : confirmState?.type === "cancel"
            ? "El pedido pasará a cancelado y el backend devolverá stock y ajustará métricas cuando corresponda."
          : "Se eliminará el pedido y se devolverán stock y ventas a su estado anterior."
        }
        confirmLabel={confirmState?.type === "clear" ? "Sí, limpiar" : confirmState?.type === "cancel" ? "Sí, cancelar" : "Sí, eliminar"}
        pending={isConfirmPending}
        onCancel={() => {
          if (!isConfirmPending) {
            setConfirmState(null);
          }
        }}
        onConfirm={() => {
          if (confirmState?.type === "clear") {
            onClearOrders();
            return;
          }

          if (confirmState?.type === "cancel" && confirmState.orderId) {
            onStatusChange(confirmState.orderId, "cancelled");
            return;
          }

          if (confirmState?.type === "delete" && confirmState.orderId) {
            onDeleteOrder(confirmState.orderId);
          }
        }}
      />
    </div>
  );
});