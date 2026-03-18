import { useEffect, useMemo, useRef, useState } from "react";
import { PackageSearch, ReceiptText, Users, Truck } from "lucide-react";
import { EmptyState, StatCard, StatusBadge, currency, orderStatusLabel } from "./shared";

export default function DashboardView({ dashboard }) {
  const statusEntries = Object.entries(dashboard.analytics?.statuses || {});
  const zoneEntries = dashboard.analytics?.zones || [];
  const recentOrders = dashboard.recentOrders || [];
  const [visibleRecentOrders, setVisibleRecentOrders] = useState(3);
  const recentOrdersSentinelRef = useRef(null);

  useEffect(() => {
    setVisibleRecentOrders(3);
  }, [recentOrders.length]);

  useEffect(() => {
    const node = recentOrdersSentinelRef.current;
    if (!node || visibleRecentOrders >= recentOrders.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleRecentOrders((current) => Math.min(current + 3, recentOrders.length));
        }
      },
      {
        rootMargin: "0px 0px 120px 0px",
        threshold: 0.2,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [recentOrders.length, visibleRecentOrders]);

  const recentOrdersSlice = useMemo(
    () => recentOrders.slice(0, visibleRecentOrders),
    [recentOrders, visibleRecentOrders]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <StatCard title="Revenue" value={currency(dashboard.metrics.totalRevenue)} />
        <StatCard title="Orders" value={dashboard.metrics.totalOrders} />
        <StatCard title="Products" value={dashboard.metrics.totalProducts} />
        <StatCard title="Customers" value={dashboard.metrics.totalCustomers} />
        <StatCard title="Staff" value={dashboard.metrics.activeStaffCount} />
        <StatCard title="Avg Ticket" value={currency(dashboard.metrics.avgOrderValue)} />
        <StatCard title="Pending Payment" value={dashboard.metrics.pendingPaymentCount} tone={dashboard.metrics.pendingPaymentCount ? "warn" : "default"} />
        <StatCard title="Low Stock" value={dashboard.metrics.lowStockCount} tone="warn" />
        <StatCard title="Out of Stock" value={dashboard.metrics.outOfStockCount} tone="danger" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
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

        <div className="space-y-6">
          <div className="glass rounded-3xl border border-white/10 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recent orders</p>
                <h2 className="mt-2 text-xl font-black text-white">Últimos pedidos</h2>
                <p className="mt-2 text-sm text-slate-400">Arranca con 3 pedidos y carga más al hacer scroll dentro de la lista.</p>
              </div>
              <ReceiptText className="h-5 w-5 text-amber-300" />
            </div>
            <div className="mt-5">
              {recentOrders.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="Sin pedidos recientes"
                  description="El panel mostrará aquí los últimos pedidos creados en la tienda pública."
                />
              ) : (
                <div className="max-h-[420px] space-y-4 overflow-y-auto pr-2 admin-scroll-row">
                  {recentOrdersSlice.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-white">Pedido #{order.id}</p>
                          <p className="truncate text-sm text-slate-400">{order.customer_name || order.customer_email || "Cliente sin nombre"}</p>
                          <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString("es-AR")}</p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm">
                        <span className="text-slate-400">Total</span>
                        <span className="font-semibold text-white">{currency(order.total)}</span>
                      </div>
                    </div>
                  ))}
                  {visibleRecentOrders < recentOrders.length ? (
                    <div ref={recentOrdersSentinelRef} className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
                      Deslizá para cargar más pedidos
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="glass rounded-3xl border border-white/10 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Commerce pulse</p>
                <h2 className="mt-2 text-xl font-black text-white">Estados y zonas</h2>
              </div>
              <Truck className="h-5 w-5 text-sky-300" />
            </div>

            <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              <div className="space-y-3">
                {statusEntries.map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <span className="text-slate-300">{orderStatusLabel(status)}</span>
                    <span className="font-black text-white">{count}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {zoneEntries.map((zone) => (
                  <div key={zone.zone} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <span className="text-slate-300">{zone.zone}</span>
                    <span className="font-black text-white">{zone.orders}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="glass rounded-3xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top customers</p>
              <h2 className="mt-2 text-xl font-black text-white">Clientes con más valor</h2>
            </div>
            <Users className="h-5 w-5 text-emerald-300" />
          </div>

          <div className="mt-5 space-y-3">
            {dashboard.topCustomers.length === 0 ? (
              <EmptyState icon={Users} title="Sin clientes todavía" description="Cuando los usuarios empiecen a comprar, acá vas a ver recurrencia y gasto total." />
            ) : dashboard.topCustomers.map((customer) => (
              <div key={customer.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{customer.full_name || customer.username}</p>
                    <p className="text-sm text-slate-400">{customer.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-white">{currency(customer.total_spent)}</p>
                    <p className="text-xs text-slate-400">{customer.total_orders} pedidos</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-3xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recent users</p>
              <h2 className="mt-2 text-xl font-black text-white">Altas recientes</h2>
            </div>
            <Users className="h-5 w-5 text-violet-300" />
          </div>

          <div className="mt-5 space-y-3">
            {dashboard.recentUsers.length === 0 ? (
              <EmptyState icon={Users} title="Sin usuarios nuevos" description="Las cuentas creadas en la tienda pública aparecerán acá." />
            ) : dashboard.recentUsers.map((user) => (
              <div key={user.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{user.full_name || user.username}</p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>{user.role}</p>
                    <p>{new Date(user.created_at).toLocaleDateString("es-AR")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}