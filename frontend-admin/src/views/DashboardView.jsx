import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Boxes,
  ChevronDown,
  Clock3,
  PackageSearch,
  ReceiptText,
  Search,
  ShieldAlert,
  Truck,
  UserRound,
  Users,
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

const DASHBOARD_VIEW_STATE_KEY = "duelvault_admin_dashboard_view_state_v1";

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
    eyebrow: "Reposición urgente",
    title: "Stock bajo",
    empty: "No hay cartas en stock bajo con los filtros actuales.",
    cta: "Reponer",
    tone: "warn",
  },
  out_of_stock: {
    eyebrow: "Fricción de catálogo",
    title: "Sin stock",
    empty: "No hay cartas agotadas con los filtros actuales.",
    cta: "Ver",
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
    <section className={cn("glass relative overflow-hidden rounded-[30px] border border-white/10 p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
          <h3 className="mt-1.5 text-lg font-black text-white sm:text-xl">{title}</h3>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricTile({ label, value, accent = "default", helper }) {
  const accentClass = {
    default: "border-white/10 bg-white/[0.04]",
    info: "border-sky-400/20 bg-sky-400/10",
    warn: "border-amber-400/20 bg-amber-400/10",
    danger: "border-rose-500/20 bg-rose-500/10",
  }[accent];

  return (
    <div className={cn("rounded-3xl border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", accentClass)}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2.5 text-2xl font-black text-white">{value}</p>
      {helper ? <p className="mt-1.5 text-xs text-slate-400">{helper}</p> : null}
    </div>
  );
}

function StatusStripButton({ label, count, tone = "default", onClick, helper }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]",
    warn: "border-amber-400/20 bg-amber-400/10 hover:border-amber-300/35 hover:bg-amber-400/15",
    danger: "border-rose-500/20 bg-rose-500/10 hover:border-rose-300/35 hover:bg-rose-500/15",
    success: "border-emerald-400/20 bg-emerald-400/10 hover:border-emerald-300/35 hover:bg-emerald-400/15",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("group h-full min-w-0 rounded-3xl border px-4 py-4 text-left transition duration-200 xl:px-3 xl:py-3", toneClass)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-black text-white">{count}</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">{label}</p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300 transition group-hover:border-white/20">
          Ver
        </span>
      </div>
      {helper ? <p className="mt-3 text-xs text-slate-400">{helper}</p> : null}
    </button>
  );
}

function IncrementalListPanel({
  eyebrow,
  title,
  action,
  items,
  empty,
  maxHeight = "max-h-[340px] xl:max-h-none",
  initialCount = 6,
  step = 6,
  renderItem,
}) {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  useEffect(() => {
    setVisibleCount(initialCount);
  }, [initialCount, items]);

  const visibleItems = items.slice(0, visibleCount);
  const canLoadMore = visibleCount < items.length;

  return (
    <DashboardPanel eyebrow={eyebrow} title={title} action={action}>
      {items.length === 0 ? (
        empty
      ) : (
        <div
          className={cn("admin-scroll-row overflow-y-auto pr-1", maxHeight)}
          onScroll={(event) => {
            if (!canLoadMore) {
              return;
            }

            const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
            if (scrollTop + clientHeight >= scrollHeight - 80) {
              setVisibleCount((current) => Math.min(items.length, current + step));
            }
          }}
        >
          <div className="space-y-2">
            {visibleItems.map((item, index) => renderItem(item, index))}
          </div>
          {canLoadMore ? (
            <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-3 text-center text-xs uppercase tracking-[0.22em] text-slate-500">
              Scroll para cargar más
            </div>
          ) : null}
        </div>
      )}
    </DashboardPanel>
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
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Cliente</p>
              <p className="mt-3 text-lg font-bold text-white">{order.customer_name || "Cliente sin nombre"}</p>
              <p className="mt-1 text-sm text-slate-400">{order.customer_email || "Sin email"}</p>
              {order.customer_phone ? <p className="mt-1 text-sm text-slate-500">{order.customer_phone}</p> : null}
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
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

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
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

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
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

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
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
  const persistedAlertMode = readDashboardViewState().alertMode;
  const [globalSearch, setGlobalSearch] = useState(() => readDashboardViewState().globalSearch || "");
  const [dateRange, setDateRange] = useState(() => readDashboardViewState().dateRange || "30d");
  const [statusFilter, setStatusFilter] = useState(() => readDashboardViewState().statusFilter || "all");
  const [userFilter, setUserFilter] = useState(() => readDashboardViewState().userFilter || "all");
  const [alertMode, setAlertMode] = useState(() => (persistedAlertMode === "out_of_stock" ? "out_of_stock" : "low_stock"));
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [showNotifications, setShowNotifications] = useState(() => Boolean(readDashboardViewState().showNotifications));
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
        showNotifications,
      })
    );
  }, [alertMode, dateRange, globalSearch, showNotifications, statusFilter, userFilter]);

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
    const activeCustomers = new Set(filteredOrders.map((order) => getCustomerFilterValue(order))).size;
    const pendingPaymentCount = filteredOrders.filter((order) => order.status === "pending_payment").length;

    return {
      revenue,
      orders: filteredOrders.length,
      avgTicket: countedOrders.length ? revenue / countedOrders.length : 0,
      activeCustomers,
      pendingPaymentCount,
    };
  }, [filteredOrders]);

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

  const recentOrders = useMemo(
    () => [...filteredOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8),
    [filteredOrders]
  );

  const recentActivity = useMemo(() => {
    const orderActivity = filteredOrders.slice(0, 12).map((order) => ({
      id: `order-${order.id}`,
      title: `Pedido #${order.id}`,
      description: `${order.customer_name || order.customer_email || "Cliente"} · ${orderStatusLabel(order.status)}`,
      createdAt: order.created_at,
      tone: order.status === "pending_payment" ? "warn" : order.status === "cancelled" ? "danger" : "default",
      icon: ReceiptText,
    }));

    const userActivity = filteredUsers.slice(0, 8).map((user) => ({
      id: `user-${user.id}`,
      title: user.full_name || user.username || user.email || `Usuario ${user.id}`,
      description: `Alta nueva · ${userRoleLabel(user.role)}`,
      createdAt: user.created_at,
      tone: "default",
      icon: Users,
    }));

    return [...orderActivity, ...userActivity]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 7);
  }, [filteredOrders, filteredUsers]);

  const lowStockCards = useMemo(
    () => filteredCards.filter((card) => card.status === "low_stock").slice(0, 6),
    [filteredCards]
  );
  const outOfStockCards = useMemo(
    () => filteredCards.filter((card) => card.status === "out_of_stock").slice(0, 6),
    [filteredCards]
  );
  const pendingPayments = useMemo(
    () => filteredOrders.filter((order) => order.status === "pending_payment").slice(0, 6),
    [filteredOrders]
  );
  const readyToShipCount = useMemo(
    () => filteredOrders.filter((order) => order.status === "paid").length,
    [filteredOrders]
  );

  const notifications = useMemo(() => {
    const items = [];

    if (metrics.pendingPaymentCount) {
      items.push({ id: "pending", label: `${metrics.pendingPaymentCount} pagos pendientes`, tone: "danger" });
    }
    if (outOfStockCards.length) {
      items.push({ id: "out", label: `${outOfStockCards.length} cartas agotadas`, tone: "danger" });
    }
    if (lowStockCards.length) {
      items.push({ id: "low", label: `${lowStockCards.length} cartas en stock bajo`, tone: "warn" });
    }
    if (readyToShipCount) {
      items.push({ id: "ship", label: `${readyToShipCount} pedidos listos para envío`, tone: "default" });
    }

    return items;
  }, [lowStockCards.length, metrics.pendingPaymentCount, outOfStockCards.length, readyToShipCount]);

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
  const dashboardTitle = dashboard?.metrics?.totalRevenue ? "Centro de mando comercial" : "Centro de mando operativo";

  return (
    <>
      <div className="space-y-4 2xl:space-y-5">
        <div className="glass relative overflow-visible rounded-[30px] border border-white/10 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:px-6 xl:px-5 xl:py-4">
          <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Panel operativo</p>
              <h2 className="mt-1 text-xl font-black text-white xl:text-2xl">{dashboardTitle}</h2>
              <p className="mt-1 text-sm text-slate-400">Buscá, filtrá y accioná sin salir del flujo del operador.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(180px,1fr))]">
              <div className="relative min-w-0 xl:col-span-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder="Buscar pedidos, usuarios o productos"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-11 pr-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
                />
              </div>

              <div className="contents xl:col-span-3">
                <select
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value)}
                  className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={userFilter}
                  onChange={(event) => setUserFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition duration-200 focus:border-amber-400"
                >
                  <option value="all">Todos los usuarios</option>
                  {customerOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end 2xl:self-auto">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifications((current) => !current)}
                  className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200 transition duration-200 hover:bg-white/[0.08]"
                >
                  <Bell className="h-5 w-5" />
                  {notifications.length ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {notifications.length}
                    </span>
                  ) : null}
                </button>

                {showNotifications ? (
                  <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[320px] rounded-3xl border border-white/10 bg-[#090d1f]/96 p-4 shadow-2xl">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Notificaciones</p>
                      <button type="button" onClick={() => setShowNotifications(false)} className="text-slate-400 transition hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {notifications.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">Sin alertas críticas para este recorte.</p>
                      ) : notifications.map((item) => (
                        <div key={item.id} className={cn(
                          "rounded-2xl border px-3 py-3 text-sm",
                          item.tone === "danger" ? "border-rose-500/20 bg-rose-500/10 text-rose-100" : item.tone === "warn" ? "border-amber-400/20 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-200"
                        )}>
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 transition duration-200 hover:bg-white/[0.08]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="hidden text-left sm:block">
                    <p className="font-semibold text-white">{admin.email}</p>
                    <p className="text-xs text-slate-400">{userRoleLabel(admin.role)}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </summary>
                <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[260px] rounded-3xl border border-white/10 bg-[#090d1f]/96 p-4 shadow-2xl">
                  <p className="text-sm font-semibold text-white">Sesión activa</p>
                  <p className="mt-1 text-xs text-slate-400">Operador: {userRoleLabel(admin.role)}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <button type="button" onMouseEnter={() => onNavigateSectionIntent?.("users")} onFocus={() => onNavigateSectionIntent?.("users")} onClick={() => onNavigateSection("users")} className="w-full rounded-2xl border border-white/10 px-3 py-3 text-left text-slate-200 transition duration-200 hover:bg-white/[0.06]">
                      Ver usuarios
                    </button>
                    <button type="button" onMouseEnter={() => onNavigateSectionIntent?.("orders")} onFocus={() => onNavigateSectionIntent?.("orders")} onClick={() => onNavigateSection("orders")} className="w-full rounded-2xl border border-white/10 px-3 py-3 text-left text-slate-200 transition duration-200 hover:bg-white/[0.06]">
                      Ir a pedidos
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4 xl:grid-cols-4">
          <StatusStripButton
            label="pagos pendientes"
            count={metrics.pendingPaymentCount}
            tone={metrics.pendingPaymentCount ? "danger" : "default"}
            helper="Cobros por resolver ahora"
            onClick={() => {
              setStatusFilter("pending_payment");
              setSelectedOrderId(pendingPayments[0]?.id || null);
            }}
          />
          <StatusStripButton
            label="cartas agotadas"
            count={outOfStockCards.length}
            tone={outOfStockCards.length ? "danger" : "default"}
            helper="Productos que ya cortan ventas"
            onClick={() => setAlertMode("out_of_stock")}
          />
          <StatusStripButton
            label="stock bajo"
            count={lowStockCards.length}
            tone={lowStockCards.length ? "warn" : "default"}
            helper="Reposiciones a vigilar"
            onClick={() => setAlertMode("low_stock")}
          />
          <StatusStripButton
            label="listos para envío"
            count={readyToShipCount}
            tone={readyToShipCount ? "success" : "default"}
            helper="Pedidos ya cobrados"
            onClick={() => setStatusFilter("paid")}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4 xl:grid-cols-4">
          <MetricTile label="Ingresos" value={currency(metrics.revenue)} helper="Filtrado por búsqueda y rango" />
          <MetricTile label="Pedidos" value={metrics.orders} accent="info" helper="Volumen operativo visible" />
          <MetricTile label="Ticket promedio" value={currency(metrics.avgTicket)} accent="warn" helper="Solo pedidos que contabilizan" />
          <MetricTile label="Clientes activos" value={metrics.activeCustomers} accent="default" helper="Clientes tocados por el recorte" />
        </div>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.95fr)_minmax(300px,0.88fr)]">
          <IncrementalListPanel
            eyebrow="Operación central"
            title="Pedidos recientes"
            action={
              <button
                type="button"
                onMouseEnter={() => onNavigateSectionIntent?.("orders")}
                onFocus={() => onNavigateSectionIntent?.("orders")}
                onClick={() => onNavigateSection("orders")}
                className="rounded-2xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/[0.06]"
              >
                Ver pedidos
              </button>
            }
            items={recentOrders}
            empty={<div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">Sin pedidos para este recorte.</div>}
            maxHeight="max-h-[520px]"
            renderItem={(order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedOrderId(order.id)}
                className="grid w-full gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3.5 py-3 text-left transition duration-200 hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white">Pedido #{order.id}</p>
                    <p className="truncate text-sm text-slate-400">{order.customer_name || order.customer_email || "Cliente sin nombre"}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{new Date(order.created_at).toLocaleString("es-AR")}</span>
                  <span className="font-semibold text-white">{currency(order.total)}</span>
                </div>
              </button>
            )}
          />

          <div className="grid content-start gap-4">
            <IncrementalListPanel
              eyebrow="Cobros trabados"
              title="Pagos pendientes"
              action={
                <button
                  type="button"
                  onClick={() => {
                    setAlertMode("pending_payment");
                    setStatusFilter("pending_payment");
                  }}
                  className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition duration-200 hover:bg-rose-500/15"
                >
                  Enfocar pagos
                </button>
              }
              items={pendingPayments}
              empty={<div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">No hay pagos pendientes con los filtros actuales.</div>}
              maxHeight="max-h-[280px]"
              renderItem={(order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrderId(order.id)}
                  className="w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-left transition duration-200 hover:bg-rose-500/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">Pedido #{order.id}</p>
                      <p className="truncate text-sm text-rose-100/80">{order.customer_name || order.customer_email || "Cliente"}</p>
                    </div>
                    <span className="text-sm font-bold text-white">{currency(order.total)}</span>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-rose-200/70">Pendiente de pago</p>
                </button>
              )}
            />

            <IncrementalListPanel
              eyebrow="Movimiento reciente"
              title="Actividad"
              action={<Clock3 className="h-5 w-5 text-sky-300" />}
              items={recentActivity}
              empty={<div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">No hay actividad reciente para los filtros elegidos.</div>}
              maxHeight="max-h-[300px]"
              renderItem={(activity) => {
                const Icon = activity.icon;
                return (
                  <div key={activity.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-3.5 py-3">
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
                    <p className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleDateString("es-AR")}</p>
                  </div>
                );
              }}
            />
          </div>

          <div className="grid content-start gap-4">
            <DashboardPanel
              eyebrow="Insights"
              title="Top selling products"
              action={<PackageSearch className="h-5 w-5 text-amber-300" />}
            >
              {topSellingProducts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                  No hay productos vendidos para el recorte actual.
                </div>
              ) : (
                <div className="admin-scroll-row max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {topSellingProducts.slice(0, 6).map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2.5">
                      <img {...getAdminCardImageProps(product.image)} alt={product.name} className="h-14 w-10 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{product.name}</p>
                        <p className="text-sm text-slate-400">{product.rarity}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-bold text-white">{product.quantity}</p>
                        <p className="text-slate-500">ventas</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>

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
              {visibleAlerts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                  {alertMeta.empty}
                </div>
              ) : (
                <div className="admin-scroll-row max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {visibleAlerts.slice(0, 6).map((entry) => (
                    <div key={`${alertMode}-${entry.id}`} className={cn(
                      "rounded-2xl border px-3.5 py-3",
                      alertMeta.tone === "danger" ? "border-rose-500/20 bg-rose-500/10" : "border-amber-400/20 bg-amber-400/10"
                    )}>
                      {alertMode === "pending_payment" ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-white">Pedido #{entry.id}</p>
                            <p className="truncate text-sm text-slate-300">{entry.customer_name || entry.customer_email || "Cliente"}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedOrderId(entry.id)}
                            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white transition duration-200 hover:bg-white/[0.1]"
                          >
                            {alertMeta.cta}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
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
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>
            <DashboardPanel eyebrow="Acciones y radar" title="Control rápido">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Resultados</p>
                    <p className="mt-2 text-xl font-black text-white">{filteredOrders.length}</p>
                    <p className="mt-1 text-sm text-slate-400">pedidos visibles</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Clientes</p>
                    <p className="mt-2 text-xl font-black text-white">{filteredUsers.length}</p>
                    <p className="mt-1 text-sm text-slate-400">en el recorte</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Stock bajo</p>
                    <p className="mt-2 text-xl font-black text-amber-300">{lowStockCards.length}</p>
                    <p className="mt-1 text-sm text-slate-400">requieren reposición</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Agotadas</p>
                    <p className="mt-2 text-xl font-black text-rose-300">{outOfStockCards.length}</p>
                    <p className="mt-1 text-sm text-slate-400">frenan conversión</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button type="button" onMouseEnter={() => onNavigateSectionIntent?.("inventory")} onFocus={() => onNavigateSectionIntent?.("inventory")} onClick={() => onNavigateSection("inventory")} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition duration-200 hover:bg-white/[0.06]">
                    <div>
                      <p className="font-semibold text-white">Revisar inventario</p>
                      <p className="mt-1 text-sm text-slate-400">Stock, umbrales y visibilidad</p>
                    </div>
                    <Boxes className="h-5 w-5 text-amber-300" />
                  </button>
                  <button type="button" onMouseEnter={() => onNavigateSectionIntent?.("orders")} onFocus={() => onNavigateSectionIntent?.("orders")} onClick={() => onNavigateSection("orders")} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition duration-200 hover:bg-white/[0.06]">
                    <div>
                      <p className="font-semibold text-white">Resolver pedidos</p>
                      <p className="mt-1 text-sm text-slate-400">Cobros, estados y tracking</p>
                    </div>
                    <Truck className="h-5 w-5 text-sky-300" />
                  </button>
                  <button type="button" onMouseEnter={() => onNavigateSectionIntent?.("users")} onFocus={() => onNavigateSectionIntent?.("users")} onClick={() => onNavigateSection("users")} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition duration-200 hover:bg-white/[0.06]">
                    <div>
                      <p className="font-semibold text-white">Analizar clientes</p>
                      <p className="mt-1 text-sm text-slate-400">Roles, gasto y actividad</p>
                    </div>
                    <ShieldAlert className="h-5 w-5 text-violet-300" />
                  </button>
                </div>
              </div>
            </DashboardPanel>
          </div>
        </div>
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