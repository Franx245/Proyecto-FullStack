import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  currency,
  formatDay,
} from "./shared";

export default function AnalyticsView({ analytics, topSellingCards }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="glass rounded-3xl border border-white/10 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Revenue per day</p>
        <h2 className="mt-2 text-xl font-black text-white">Ingresos diarios</h2>
        <div className="mt-6 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${value}`} />
              <Tooltip formatter={(value) => currency(Number(value))} labelFormatter={formatDay} />
              <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass rounded-3xl border border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sales per day</p>
          <h2 className="mt-2 text-xl font-black text-white">Ventas diarias</h2>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip labelFormatter={formatDay} />
                <Bar dataKey="sales" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-3xl border border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Most sold cards</p>
          <h2 className="mt-2 text-xl font-black text-white">Ranking</h2>
          <div className="mt-4 space-y-3">
            {topSellingCards.length === 0 ? (
              <EmptyState icon={TrendingUp} title="Sin datos de ventas" description="El ranking se completa cuando los pedidos pasan a estados facturables." />
            ) : topSellingCards.map((card) => (
              <div key={card.id} className="flex items-center justify-between rounded-2xl bg-slate-950/50 px-4 py-3">
                <div>
                  <p className="font-semibold text-white">{card.name}</p>
                  <p className="text-sm text-slate-400">{card.rarity}</p>
                </div>
                <p className="text-lg font-black text-amber-300">{card.sales_count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}