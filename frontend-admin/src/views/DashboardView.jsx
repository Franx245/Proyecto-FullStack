import { PackageSearch, ReceiptText } from "lucide-react";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function currency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function orderStatusLabel(status) {
  return status.toUpperCase();
}

const STATUS_STYLES = {
  pending: "border-slate-400/20 bg-slate-400/10 text-slate-200",
  paid: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  shipped: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  cancelled: "border-rose-400/20 bg-rose-400/10 text-rose-300",
};

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
      <div className="mb-4 rounded-2xl bg-white/[0.06] p-4 text-slate-300">
        <Icon className="h-7 w-7" />
      </div>
      <p className="text-lg font-bold text-white">{title}</p>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}

function StatCard({ title, value, tone = "default" }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.04]",
    warn: "border-amber-400/30 bg-amber-400/10",
    danger: "border-rose-500/30 bg-rose-500/10",
  }[tone];

  return (
    <div className={cn("rounded-3xl border p-5 transition hover:-translate-y-0.5", toneClass)}>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]", STATUS_STYLES[status] || STATUS_STYLES.pending)}>
      {orderStatusLabel(status)}
    </span>
  );
}

export default function DashboardView({ dashboard }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Revenue" value={currency(dashboard.metrics.totalRevenue)} />
        <StatCard title="Orders" value={dashboard.metrics.totalOrders} />
        <StatCard title="Products" value={dashboard.metrics.totalProducts} />
        <StatCard title="Low Stock" value={dashboard.metrics.lowStockCount} tone="warn" />
        <StatCard title="Out of Stock" value={dashboard.metrics.outOfStockCount} tone="danger" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass rounded-3xl border border-white/10 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top selling cards</p>
              <h2 className="mt-2 text-xl font-black text-white">Cartas con más ventas</h2>
            </div>
            <PackageSearch className="h-5 w-5 text-amber-300" />
          </div>

          {dashboard.topSellingCards.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Todavía no hay ventas registradas"
              description="Cuando un pedido pase a PAID o SHIPPED, el ranking de ventas se actualiza automáticamente."
            />
          ) : (
            <div className="space-y-4">
              {dashboard.topSellingCards.map((card) => (
                <div key={card.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3 transition hover:border-white/20">
                  <img src={card.image} alt={card.name} className="h-20 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{card.name}</p>
                    <p className="text-sm text-slate-400">{card.rarity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Ventas</p>
                    <p className="text-lg font-black text-amber-300">{card.sales_count}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-3xl border border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recent orders</p>
          <h2 className="mt-2 text-xl font-black text-white">Últimos pedidos</h2>
          <div className="mt-5 space-y-4">
            {dashboard.recentOrders.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="Sin pedidos recientes"
                description="El panel mostrará aquí los últimos pedidos creados en la tienda pública."
              />
            ) : dashboard.recentOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">Pedido #{order.id}</p>
                    <p className="text-sm text-slate-400">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Total</span>
                  <span className="font-semibold text-white">{currency(order.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}