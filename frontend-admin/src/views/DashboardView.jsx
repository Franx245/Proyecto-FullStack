import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Clock3,
  PackageSearch,
  ReceiptText,
  Search,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import {
  ActionStatusButton,
  ConfirmActionDialog,
  EmptyState,
  StatusBadge,
  cn,
  currency,
  getAdminCardImageProps,
  orderStatusLabel,
  userRoleLabel,
} from "./shared";

const DASHBOARD_VIEW_STATE_KEY = "duelvault_admin_dashboard_view_state_v2";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readDashboardViewState() {
  if (!canUseStorage()) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(DASHBOARD_VIEW_STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function scheduleIdleTask(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const callbackId = window.requestIdleCallback(callback, { timeout: 1200 });
    return () => window.cancelIdleCallback?.(callbackId);
  }

  const timeoutId = window.setTimeout(callback, 180);
  return () => window.clearTimeout(timeoutId);
}

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
  { value: "all", label: "Todo el historial" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "pending_payment", label: "Pendiente de pago" },
  { value: "paid", label: "Pagado" },
  { value: "shipped", label: "Enviado" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

const ALERT_COPY = {
  low_stock: {
    eyebrow: "Alertas de inventario",
    title: "Stock bajo",
    empty: "No hay cartas con stock bajo para el recorte actual.",
    cta: "Revisar",
    tone: "warn",
  },
  out_of_stock: {
    eyebrow: "Alertas de inventario",
    title: "Agotadas",
    empty: "No hay cartas agotadas para el recorte actual.",
    cta: "Revisar",
    tone: "danger",
  },
};

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function getCutoffDate(range) {
  if (range === "all") {
    return null;
  }

  const days = Number.parseInt(range, 10);
  if (!Number.isFinite(days)) {
    return null;
  }

  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
}

function getCustomerFilterValue(entity) {
  if (!entity) {
    return "all";
  }

  if (entity.user_id) {
    return `id:${entity.user_id}`;
  }

  if (entity.id && entity.email) {
    return `id:${entity.id}`;
  }

  if (entity.customer_email || entity.email) {
    return `email:${normalizeText(entity.customer_email || entity.email)}`;
  }

  if (entity.username) {
    return `username:${normalizeText(entity.username)}`;
  }

  if (entity.customer_name || entity.full_name) {
    return `name:${normalizeText(entity.customer_name || entity.full_name)}`;
  }

  return `guest:${entity.id || "anon"}`;
}

function matchesGlobalSearch({ needle, order, user, card }) {
  if (!needle) {
    return true;
  }

  const haystack = [
    order ? [
      String(order.id),
      order.customer_name,
      order.customer_email,
      order.customer_phone,
      order.shipping_address,
      order.shipping_zone,
      order.status,
      ...(order.items || []).flatMap((item) => [item.card?.name, item.card?.rarity, String(item.card_id)]),
    ] : [],
    user ? [user.full_name, user.username, user.email, user.phone] : [],
    card ? [card.name, card.rarity, card.card_type, card.status] : [],
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function DashboardPanel({ eyebrow, title, action, children, className = "" }) {
  return (
    <section className={cn("glass rounded-2xl border border-white/10 p-4 shadow-[0_8px_30px_rgba(8,12,24,0.22)] md:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p> : null}
          <h3 className="mt-1 text-lg font-black text-white">{title}</h3>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function KpiCard({ label, value, helper, tone = "default", onClick }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.03]",
    danger: "border-rose-500/20 bg-rose-500/10",
    success: "border-emerald-400/20 bg-emerald-400/10",
    info: "border-sky-400/20 bg-sky-400/10",
  }[tone];

  const content = (
    <div className={cn("h-full rounded-2xl border px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]", toneClass)}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-400">{helper}</p> : null}
    </div>
  );

  if (typeof onClick !== "function") {
    return content;
  }

  return (
    <button type="button" onClick={onClick} className="text-left transition duration-200 hover:-translate-y-0.5 hover:opacity-100">
      {content}
    </button>
  );
}

function InlineFilterChip({ children, tone = "default" }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.03] text-slate-300",
    warn: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  }[tone];

  return <span className={cn("rounded-full border px-3 py-1.5 text-xs", toneClass)}>{children}</span>;
}

function OrderListRow({
  order,
  onOpen,
  onStatusChange,
  onRequestCancel,
  canCancelOrders,
  updatingOrderId,
  completedOrderActionKey,
}) {
  const isBusy = updatingOrderId === order.id;
  const canMarkPaid = order.status === "pending_payment";
  const canMarkShipped = order.status === "paid";

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/25 px-4 py-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_auto_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-white">Pedido #{order.id}</p>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-2 truncate text-sm text-slate-300">{order.customer_name || order.customer_email || "Cliente sin nombre"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{new Date(order.created_at).toLocaleString("es-AR")}</span>
            <span>{order.shipping_label || "Envío"}</span>
            <span>{currency(order.total)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <button
            type="button"
            onClick={() => onOpen(order.id)}
            className="min-h-11 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]"
          >
            Ver detalle
          </button>

          {canMarkPaid ? (
            <ActionStatusButton
              onClick={() => onStatusChange(order.id, "paid")}
              disabled={isBusy}
              pending={isBusy}
              success={completedOrderActionKey === `${order.id}:paid`}
              idleLabel="Marcar pagado"
              pendingLabel="Guardando..."
              successLabel="Pago confirmado"
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            />
          ) : null}

          {canMarkShipped ? (
            <ActionStatusButton
              onClick={() => onStatusChange(order.id, "shipped")}
              disabled={isBusy}
              pending={isBusy}
              success={completedOrderActionKey === `${order.id}:shipped`}
              idleLabel="Marcar enviado"
              pendingLabel="Guardando..."
              successLabel="Enviado"
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            />
          ) : null}

          {canCancelOrders && order.status !== "cancelled" ? (
            <button
              type="button"
              onClick={() => onRequestCancel(order.id)}
              disabled={isBusy}
              className="min-h-11 rounded-xl border border-rose-500/20 px-4 py-3 text-sm font-semibold text-rose-200 transition duration-200 hover:bg-rose-500/10 disabled:opacity-60"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function OrderDrawer({
  order,
  onClose,
  onRequestCancel,
  canCancelOrders,
  updatingOrderId,
  completedOrderActionKey,
  onStatusChange,
}) {
  if (!order) {
    return null;
  }

  const isBusy = updatingOrderId === order.id;
  const isActionCompleted = (status) => completedOrderActionKey === `${order.id}:${status}`;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar detalle del pedido"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-950/72 backdrop-blur-sm"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-white/10 bg-[#090d1f]/96 shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Pedido seleccionado</p>
            <h3 className="mt-2 text-2xl font-black text-white">Pedido #{order.id}</h3>
            <p className="mt-2 text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 p-3 text-slate-300 transition duration-200 hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Cliente</p>
              <p className="mt-3 text-lg font-bold text-white">{order.customer_name || "Cliente sin nombre"}</p>
              <p className="mt-1 text-sm text-slate-400">{order.customer_email || "Sin email"}</p>
              {order.customer_phone ? <p className="mt-1 text-sm text-slate-500">{order.customer_phone}</p> : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Cobro y envío</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={order.status} />
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300">
                  {currency(order.total)}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-400">{order.shipping_label || "Envío"} · {order.shipping_zone || "Zona sin definir"}</p>
              {order.tracking_code ? <p className="mt-1 text-sm text-slate-500">Tracking: {order.tracking_code}</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Acciones rápidas</p>
                <h4 className="mt-2 text-base font-black text-white">Resolver pedido</h4>
              </div>
              {order.counts_for_dashboard ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Impacta métricas</span>
              ) : (
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-400">Sin impacto</span>
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ActionStatusButton
                onClick={() => onStatusChange(order.id, "paid")}
                disabled={isBusy || order.status !== "pending_payment"}
                pending={isBusy}
                success={isActionCompleted("paid")}
                idleLabel="Marcar pagado"
                pendingLabel="Actualizando..."
                successLabel="Pago confirmado"
                className="bg-sky-500 text-slate-950 hover:bg-sky-400"
              />
              <ActionStatusButton
                onClick={() => onStatusChange(order.id, "shipped")}
                disabled={isBusy || order.status !== "paid"}
                pending={isBusy}
                success={isActionCompleted("shipped")}
                idleLabel="Marcar enviado"
                pendingLabel="Actualizando..."
                successLabel="Enviado"
                className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              />
              {canCancelOrders ? (
                <button
                  type="button"
                  onClick={() => onRequestCancel?.(order.id)}
                  disabled={isBusy || order.status === "cancelled"}
                  className="min-h-11 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition duration-200 hover:bg-rose-500/15 disabled:opacity-50"
                >
                  Cancelar
                </button>
              ) : null}
              <div className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400">
                Estado actual: <span className="font-semibold text-white">{orderStatusLabel(order.status)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Productos</p>
            <div className="mt-4 space-y-3">
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3">
                  <img
                    {...getAdminCardImageProps(item.card?.image)}
                    alt={item.card?.name || `Card ${item.card_id}`}
                    className="h-16 w-12 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{item.card?.name || `Card ${item.card_id}`}</p>
                    <p className="mt-1 text-sm text-slate-400">Cantidad: {item.quantity} · {currency(item.price)} c/u</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-bold text-white">{currency(item.subtotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Entrega</p>
            <p className="mt-3 text-sm text-slate-300">{order.shipping_address || "Sin dirección registrada"}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function DashboardView({
  dashboard,
  orders,
  users,
  cards,
  admin,
  canCancelOrders,
  updatingOrderId,
  completedOrderActionKey,
  onNavigateSection,
  onNavigateSectionIntent,
  onStatusChange,
}) {
  const persistedState = readDashboardViewState();
  const [globalSearch, setGlobalSearch] = useState(() => persistedState.globalSearch || "");
  const [dateRange, setDateRange] = useState(() => persistedState.dateRange || "30d");
  const [statusFilter, setStatusFilter] = useState(() => persistedState.statusFilter || "all");
  const [userFilter, setUserFilter] = useState(() => persistedState.userFilter || "all");
  const [alertMode, setAlertMode] = useState(() => (persistedState.alertMode === "out_of_stock" ? "out_of_stock" : "low_stock"));
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [showActivity, setShowActivity] = useState(() => Boolean(persistedState.showActivity));
  const [insightsReady, setInsightsReady] = useState(false);
  const deferredSearch = useDeferredValue(globalSearch);

  useEffect(() => {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.setItem(
      DASHBOARD_VIEW_STATE_KEY,
      JSON.stringify({
        globalSearch,
        dateRange,
        statusFilter,
        userFilter,
        alertMode,
        showActivity,
      })
    );
  }, [alertMode, dateRange, globalSearch, showActivity, statusFilter, userFilter]);

  useEffect(() => {
    const cancel = scheduleIdleTask(() => setInsightsReady(true));
    return cancel;
  }, []);

  const cutoffDate = useMemo(() => getCutoffDate(dateRange), [dateRange]);

  const customerOptions = useMemo(() => {
    const seen = new Map();

    for (const user of users) {
      const value = getCustomerFilterValue(user);
      if (!seen.has(value)) {
        seen.set(value, {
          value,
          label: user.full_name || user.username || user.email || `Usuario ${user.id}`,
        });
      }
    }

    for (const order of orders) {
      const value = getCustomerFilterValue(order);
      if (!seen.has(value)) {
        seen.set(value, {
          value,
          label: order.customer_name || order.customer_email || `Pedido #${order.id}`,
        });
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [orders, users]);

  const filteredOrders = useMemo(() => {
    const needle = normalizeText(deferredSearch);

    return orders.filter((order) => {
      const createdAt = order.created_at ? new Date(order.created_at) : null;
      const dateMatches = !cutoffDate || (createdAt && createdAt >= cutoffDate);
      const statusMatches = statusFilter === "all" || order.status === statusFilter;
      const userMatches = userFilter === "all" || getCustomerFilterValue(order) === userFilter;
      const searchMatches = matchesGlobalSearch({ needle, order });
      return dateMatches && statusMatches && userMatches && searchMatches;
    });
  }, [cutoffDate, deferredSearch, orders, statusFilter, userFilter]);

  const filteredUsers = useMemo(() => {
    const needle = normalizeText(deferredSearch);

    return users.filter((user) => {
      const createdAt = user.created_at ? new Date(user.created_at) : null;
      const dateMatches = !cutoffDate || (createdAt && createdAt >= cutoffDate);
      const userMatches = userFilter === "all" || getCustomerFilterValue(user) === userFilter;
      const searchMatches = matchesGlobalSearch({ needle, user });
      return dateMatches && userMatches && searchMatches;
    });
  }, [cutoffDate, deferredSearch, userFilter, users]);

  const filteredCards = useMemo(() => {
    const needle = normalizeText(deferredSearch);
    return cards.filter((card) => matchesGlobalSearch({ needle, card }));
  }, [cards, deferredSearch]);

  const metrics = useMemo(() => {
    const countedOrders = filteredOrders.filter((order) => order.counts_for_dashboard && order.status !== "cancelled");
    const revenue = countedOrders.reduce((accumulator, order) => accumulator + Number(order.total || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersToday = filteredOrders.filter((order) => {
      const createdAt = order.created_at ? new Date(order.created_at) : null;
      return createdAt && createdAt >= today;
    }).length;
    const activeUsers = new Set(filteredOrders.map((order) => getCustomerFilterValue(order))).size;
    const pendingPaymentCount = filteredOrders.filter((order) => order.status === "pending_payment").length;

    return {
      revenue,
      ordersToday,
      activeUsers,
      pendingPaymentCount,
      visibleOrders: filteredOrders.length,
      visibleUsers: filteredUsers.length,
      visibleCards: filteredCards.length,
      avgTicket: countedOrders.length ? revenue / countedOrders.length : 0,
    };
  }, [filteredCards.length, filteredOrders, filteredUsers.length]);

  const recentOrders = useMemo(
    () => [...filteredOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8),
    [filteredOrders]
  );

  const pendingPayments = useMemo(
    () => filteredOrders.filter((order) => order.status === "pending_payment").slice(0, 6),
    [filteredOrders]
  );

  const lowStockCards = useMemo(
    () => filteredCards.filter((card) => card.status === "low_stock").slice(0, 6),
    [filteredCards]
  );

  const outOfStockCards = useMemo(
    () => filteredCards.filter((card) => card.status === "out_of_stock").slice(0, 6),
    [filteredCards]
  );

  const topSellingProducts = useMemo(() => {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const aggregate = new Map();

    for (const order of filteredOrders) {
      for (const item of order.items || []) {
        const sourceCard = item.card || cardsById.get(item.card_id) || {};
        const current = aggregate.get(item.card_id) || {
          id: item.card_id,
          name: sourceCard.name || `Card ${item.card_id}`,
          image: sourceCard.image,
          rarity: sourceCard.rarity || sourceCard.card_type || "Carta",
          quantity: 0,
          revenue: 0,
        };

        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.subtotal || 0);
        aggregate.set(item.card_id, current);
      }
    }

    return Array.from(aggregate.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 6);
  }, [cards, filteredOrders]);

  const recentActivity = useMemo(() => {
    const orderActivity = filteredOrders.slice(0, 10).map((order) => ({
      id: `order-${order.id}`,
      title: `Pedido #${order.id}`,
      description: `${order.customer_name || order.customer_email || "Cliente"} · ${orderStatusLabel(order.status)}`,
      createdAt: order.created_at,
      tone: order.status === "pending_payment" ? "warn" : order.status === "cancelled" ? "danger" : "default",
      icon: ReceiptText,
    }));

    const userActivity = filteredUsers.slice(0, 6).map((user) => ({
      id: `user-${user.id}`,
      title: user.full_name || user.username || user.email || `Usuario ${user.id}`,
      description: `Actividad de ${userRoleLabel(user.role)}`,
      createdAt: user.created_at,
      tone: "default",
      icon: ShieldAlert,
    }));

    return [...orderActivity, ...userActivity]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);
  }, [filteredOrders, filteredUsers]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [orders, selectedOrderId]);

  const visibleAlerts = {
    low_stock: lowStockCards,
    out_of_stock: outOfStockCards,
  }[alertMode] || lowStockCards;

  const alertMeta = ALERT_COPY[alertMode];
  const activeFilterChips = [
    DATE_RANGE_OPTIONS.find((option) => option.value === dateRange)?.label,
    statusFilter !== "all" ? STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label : null,
    userFilter !== "all" ? customerOptions.find((option) => option.value === userFilter)?.label : null,
    globalSearch.trim() ? `Busqueda: ${globalSearch.trim()}` : null,
  ].filter(Boolean);

  const globalMetrics = dashboard?.metrics || {};

  return (
    <>
      <div className="grid gap-4 lg:gap-6">
        <DashboardPanel eyebrow="Panel operativo" title="Centro de mando comercial" className="overflow-visible">
          <div className="grid gap-4 xl:grid-cols-12 xl:items-end">
            <div className="xl:col-span-4">
              <p className="max-w-2xl text-sm leading-6 text-slate-400">
                Priorizá cobros, pedidos y alertas sin perder contexto del recorte activo. El resumen superior responde a tus filtros actuales.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <InlineFilterChip>Base global: {currency(globalMetrics.totalRevenue)}</InlineFilterChip>
                <InlineFilterChip>{globalMetrics.totalOrders || 0} pedidos históricos</InlineFilterChip>
                <InlineFilterChip tone="warn">{globalMetrics.pendingPaymentCount || 0} pagos pendientes</InlineFilterChip>
              </div>
            </div>

            <div className="xl:col-span-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder="Buscar pedidos, usuarios o productos"
                  className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 pl-11 pr-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
                />
              </div>

              <select
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
              >
                {DATE_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
              >
                <option value="all">Todos los usuarios</option>
                {customerOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <InlineFilterChip>{metrics.visibleOrders} pedidos visibles</InlineFilterChip>
            <InlineFilterChip>{metrics.visibleUsers} usuarios visibles</InlineFilterChip>
            <InlineFilterChip>{metrics.visibleCards} cartas analizadas</InlineFilterChip>
            {activeFilterChips.map((chip) => <InlineFilterChip key={chip}>{chip}</InlineFilterChip>)}
          </div>
        </DashboardPanel>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Pagos pendientes"
            value={metrics.pendingPaymentCount}
            helper="Cobros por resolver"
            tone={metrics.pendingPaymentCount ? "danger" : "default"}
            onClick={() => setStatusFilter("pending_payment")}
          />
          <KpiCard
            label="Pedidos hoy"
            value={metrics.ordersToday}
            helper="Ingresados desde las 00:00"
            tone="info"
          />
          <KpiCard
            label="Ingresos"
            value={currency(metrics.revenue)}
            helper="Solo pedidos que contabilizan"
            tone="success"
          />
          <KpiCard
            label="Usuarios activos"
            value={metrics.activeUsers}
            helper="Clientes con pedidos en el recorte"
            onClick={() => onNavigateSection("users")}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <DashboardPanel
              eyebrow="Operaciones"
              title="Pedidos recientes"
              action={
                <button
                  type="button"
                  onMouseEnter={() => onNavigateSectionIntent?.("orders")}
                  onFocus={() => onNavigateSectionIntent?.("orders")}
                  onClick={() => onNavigateSection("orders")}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]"
                >
                  Ver pedidos
                </button>
              }
            >
              {recentOrders.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="No hay pedidos para este recorte"
                  description="Ajustá filtros o rango para recuperar la operación visible sin salir del tablero."
                />
              ) : (
                <div className="space-y-3 overflow-y-auto pr-1 xl:max-h-[620px]">
                  {recentOrders.map((order) => (
                    <OrderListRow
                      key={order.id}
                      order={order}
                      onOpen={setSelectedOrderId}
                      onStatusChange={onStatusChange}
                      onRequestCancel={(orderId) => setConfirmState({ type: "cancel-order", orderId })}
                      canCancelOrders={canCancelOrders}
                      updatingOrderId={updatingOrderId}
                      completedOrderActionKey={completedOrderActionKey}
                    />
                  ))}
                </div>
              )}
            </DashboardPanel>
          </div>

          <div className="xl:col-span-4 grid content-start gap-4">
            {visibleAlerts.length > 0 ? (
              <DashboardPanel
                eyebrow={alertMeta.eyebrow}
                title={alertMeta.title}
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAlertMode("low_stock")}
                      className={cn(
                        "rounded-full px-3 py-2 text-xs font-semibold transition duration-200",
                        alertMode === "low_stock" ? "bg-amber-500 text-slate-950" : "border border-white/10 text-slate-300 hover:bg-white/[0.06]"
                      )}
                    >
                      Bajo
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertMode("out_of_stock")}
                      className={cn(
                        "rounded-full px-3 py-2 text-xs font-semibold transition duration-200",
                        alertMode === "out_of_stock" ? "bg-rose-500 text-white" : "border border-white/10 text-slate-300 hover:bg-white/[0.06]"
                      )}
                    >
                      Agotado
                    </button>
                  </div>
                }
              >
                <div className="space-y-2 overflow-y-auto pr-1 xl:max-h-[280px]">
                  {visibleAlerts.map((entry) => (
                    <div
                      key={`${alertMode}-${entry.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-3.5 py-3",
                        alertMeta.tone === "danger" ? "border-rose-500/20 bg-rose-500/10" : "border-amber-400/20 bg-amber-400/10"
                      )}
                    >
                      <img {...getAdminCardImageProps(entry.image)} alt={entry.name} className="h-14 w-10 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{entry.name}</p>
                        <p className="text-sm text-slate-300">Stock {entry.stock} · Umbral {entry.low_stock_threshold}</p>
                      </div>
                      <button
                        type="button"
                        onMouseEnter={() => onNavigateSectionIntent?.("inventory")}
                        onFocus={() => onNavigateSectionIntent?.("inventory")}
                        onClick={() => onNavigateSection("inventory")}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white transition duration-200 hover:bg-white/[0.1]"
                      >
                        {alertMeta.cta}
                      </button>
                    </div>
                  ))}
                </div>
              </DashboardPanel>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            {!insightsReady ? (
              <DashboardPanel eyebrow="Insights" title="Productos más vendidos">
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                  ))}
                </div>
              </DashboardPanel>
            ) : (
              <DashboardPanel eyebrow="Insights" title="Productos más vendidos" action={<PackageSearch className="h-5 w-5 text-slate-400" />}>
                {topSellingProducts.length === 0 ? (
                  <EmptyState
                    icon={PackageSearch}
                    title="Todavía no hay ventas destacadas"
                    description="Cuando existan pedidos dentro del recorte activo, acá vas a ver el mix que más tracciona."
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {topSellingProducts.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/25 px-4 py-3">
                        <img {...getAdminCardImageProps(product.image)} alt={product.name} className="h-16 w-11 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{product.name}</p>
                          <p className="text-sm text-slate-400">{product.rarity}</p>
                          <p className="mt-1 text-xs text-slate-500">{currency(product.revenue)} generados</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-xl font-black text-white">{product.quantity}</p>
                          <p className="text-slate-500">ventas</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardPanel>
            )}
          </div>

          <div className="xl:col-span-4">
            <DashboardPanel
              eyebrow="Actividad"
              title="Movimiento reciente"
              action={
                <button
                  type="button"
                  onClick={() => setShowActivity((current) => !current)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]"
                >
                  {showActivity ? "Ocultar" : "Mostrar"}
                </button>
              }
            >
              {!insightsReady ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-16 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                  ))}
                </div>
              ) : !showActivity ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                  Expandí esta sección cuando necesites revisar la secuencia reciente de pedidos y usuarios sin sobrecargar la pantalla principal.
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                  No hay actividad reciente para los filtros elegidos.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto pr-1 xl:max-h-[360px]">
                  {recentActivity.map((activity) => {
                    const Icon = activity.icon;
                    return (
                      <div key={activity.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/25 px-3.5 py-3">
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                          activity.tone === "danger" ? "bg-rose-500/15 text-rose-300" : activity.tone === "warn" ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.06] text-slate-300"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white">{activity.title}</p>
                          <p className="mt-1 text-sm text-slate-400">{activity.description}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <Clock3 className="ml-auto h-3.5 w-3.5" />
                          <p className="mt-1">{new Date(activity.createdAt).toLocaleDateString("es-AR")}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DashboardPanel>
          </div>
        </section>
      </div>

      <OrderDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrderId(null)}
        onRequestCancel={(orderId) => setConfirmState({ type: "cancel-order", orderId })}
        canCancelOrders={canCancelOrders}
        updatingOrderId={updatingOrderId}
        completedOrderActionKey={completedOrderActionKey}
        onStatusChange={onStatusChange}
      />

      <ConfirmActionDialog
        open={Boolean(confirmState)}
        title={`Cancelar pedido #${confirmState?.orderId || ""}`}
        description="El pedido pasará a cancelado y el backend recalculará stock y métricas cuando corresponda."
        confirmLabel="Sí, cancelar"
        pending={Boolean(confirmState?.orderId && updatingOrderId === confirmState.orderId)}
        onCancel={() => {
          if (!confirmState?.orderId || updatingOrderId !== confirmState.orderId) {
            setConfirmState(null);
          }
        }}
        onConfirm={() => {
          if (confirmState?.orderId) {
            onStatusChange(confirmState.orderId, "cancelled");
            window.setTimeout(() => setConfirmState(null), 120);
          }
        }}
      />
    </>
  );
}