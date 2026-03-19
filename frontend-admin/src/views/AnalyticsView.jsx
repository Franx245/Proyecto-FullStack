import { TrendingUp } from "lucide-react";
import {
  EmptyState,
  currency,
  formatDay,
} from "./shared";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 240;
const CHART_PADDING = { top: 18, right: 20, bottom: 34, left: 54 };

function getChartBounds() {
  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  return {
    innerWidth,
    innerHeight,
    chartBottom: CHART_PADDING.top + innerHeight,
  };
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function buildTicks(maxValue, count = 4) {
  const safeMax = Math.max(Number(maxValue) || 0, 1);
  return Array.from({ length: count + 1 }, (_, index) => (safeMax / count) * index).reverse();
}

function buildSeriesPoints(data, dataKey) {
  const { innerWidth, innerHeight, chartBottom } = getChartBounds();
  const values = data.map((entry) => Number(entry?.[dataKey] || 0));
  const maxValue = Math.max(...values, 0);
  const divisor = Math.max(maxValue, 1);
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;

  return data.map((entry, index) => {
    const value = Number(entry?.[dataKey] || 0);
    const x = CHART_PADDING.left + (data.length > 1 ? stepX * index : innerWidth / 2);
    const y = chartBottom - (value / divisor) * innerHeight;

    return {
      entry,
      value,
      x,
      y,
    };
  });
}

function buildLinePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildAreaPath(points) {
  if (!points.length) {
    return "";
  }

  const { chartBottom } = getChartBounds();
  const linePath = buildLinePath(points);
  return `${linePath} L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`;
}

function SeriesStat({ label, value, tone = "default" }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.03] text-slate-100",
    info: "border-sky-400/20 bg-sky-400/10 text-sky-100",
    warn: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  }[tone];

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function ChartCard({ height = "h-64", children }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(8,12,28,0.68))] p-3 ${height}`}>
      {children}
    </div>
  );
}

function LineTrendChart({ data, dataKey, stroke, valueFormatter }) {
  const points = buildSeriesPoints(data, dataKey);
  const maxValue = Math.max(...data.map((entry) => Number(entry?.[dataKey] || 0)), 0);
  const ticks = buildTicks(maxValue);
  const { innerWidth, chartBottom } = getChartBounds();
  const linePath = buildLinePath(points);
  const areaPath = buildAreaPath(points);

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      {ticks.map((tick) => {
        const y = CHART_PADDING.top + ((maxValue - tick) / Math.max(maxValue || 1, 1)) * getChartBounds().innerHeight;
        return (
          <g key={tick}>
            <line x1={CHART_PADDING.left} y1={y} x2={CHART_PADDING.left + innerWidth} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />
            <text x={CHART_PADDING.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
              {formatCompactNumber(tick)}
            </text>
          </g>
        );
      })}

      {points.map((point) => (
        <text key={`label-${point.entry.day}`} x={point.x} y={chartBottom + 20} textAnchor="middle" fontSize="11" fill="#94a3b8">
          {formatDay(point.entry.day)}
        </text>
      ))}

      <path d={areaPath} fill={stroke} opacity="0.14" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((point) => (
        <g key={point.entry.day}>
          <circle cx={point.x} cy={point.y} r="4.5" fill={stroke} />
          <circle cx={point.x} cy={point.y} r="9" fill={stroke} opacity="0.16" />
          <title>{`${formatDay(point.entry.day)} · ${valueFormatter(point.value)}`}</title>
        </g>
      ))}
    </svg>
  );
}

function BarTrendChart({ data, dataKey, fill, valueFormatter }) {
  const { innerWidth, innerHeight, chartBottom } = getChartBounds();
  const maxValue = Math.max(...data.map((entry) => Number(entry?.[dataKey] || 0)), 0);
  const ticks = buildTicks(maxValue);
  const slotWidth = data.length ? innerWidth / data.length : innerWidth;
  const barWidth = Math.max(18, Math.min(42, slotWidth * 0.56));

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      {ticks.map((tick) => {
        const y = CHART_PADDING.top + ((maxValue - tick) / Math.max(maxValue || 1, 1)) * innerHeight;
        return (
          <g key={tick}>
            <line x1={CHART_PADDING.left} y1={y} x2={CHART_PADDING.left + innerWidth} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />
            <text x={CHART_PADDING.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
              {formatCompactNumber(tick)}
            </text>
          </g>
        );
      })}

      {data.map((entry, index) => {
        const value = Number(entry?.[dataKey] || 0);
        const height = (value / Math.max(maxValue || 1, 1)) * innerHeight;
        const x = CHART_PADDING.left + slotWidth * index + (slotWidth - barWidth) / 2;
        const y = chartBottom - height;

        return (
          <g key={entry.day}>
            <rect x={x} y={y} width={barWidth} height={height} rx="12" fill={fill} opacity="0.94" />
            <text x={x + barWidth / 2} y={chartBottom + 20} textAnchor="middle" fontSize="11" fill="#94a3b8">
              {formatDay(entry.day)}
            </text>
            <title>{`${formatDay(entry.day)} · ${valueFormatter(value)}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

function getSeriesSummary(series, dataKey) {
  const total = series.reduce((accumulator, entry) => accumulator + Number(entry?.[dataKey] || 0), 0);
  const average = series.length ? total / series.length : 0;
  const peakEntry = series.reduce((best, entry) => {
    const value = Number(entry?.[dataKey] || 0);
    if (!best || value > Number(best?.[dataKey] || 0)) {
      return entry;
    }
    return best;
  }, null);

  return {
    total,
    average,
    peakEntry,
  };
}

export default function AnalyticsView({ analytics, topSellingCards }) {
  const dailySeries = analytics?.daily || [];
  const usersSeries = analytics?.usersByDay || [];
  const revenueSummary = getSeriesSummary(dailySeries, "revenue");
  const usersSummary = getSeriesSummary(usersSeries, "count");

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="glass rounded-3xl border border-white/10 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">💰 Ingresos por día</p>
        <h2 className="mt-2 text-xl font-black text-white">Ingresos diarios</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SeriesStat label="Total" value={currency(revenueSummary.total)} />
          <SeriesStat label="Promedio" value={currency(revenueSummary.average)} tone="info" />
          <SeriesStat label="Pico" value={revenueSummary.peakEntry ? `${formatDay(revenueSummary.peakEntry.day)} · ${currency(revenueSummary.peakEntry.revenue)}` : "-"} tone="warn" />
        </div>
        <div className="mt-6 h-80">
          {dailySeries.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Sin facturación todavía" description="Cuando existan pedidos pagados o enviados, vas a ver la serie diaria de ingresos." />
          ) : (
            <ChartCard height="h-80">
              <LineTrendChart data={dailySeries} dataKey="revenue" stroke="#f59e0b" valueFormatter={currency} />
            </ChartCard>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass rounded-3xl border border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">👥 Altas por día</p>
          <h2 className="mt-2 text-xl font-black text-white">Altas diarias</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SeriesStat label="Total" value={formatCompactNumber(usersSummary.total)} />
            <SeriesStat label="Promedio" value={formatCompactNumber(usersSummary.average)} tone="info" />
            <SeriesStat label="Pico" value={usersSummary.peakEntry ? `${formatDay(usersSummary.peakEntry.day)} · ${formatCompactNumber(usersSummary.peakEntry.count)}` : "-"} tone="warn" />
          </div>
          <div className="mt-6 h-64">
            {usersSeries.length === 0 ? (
              <EmptyState icon={TrendingUp} title="Sin usuarios nuevos" description="Las altas de clientes van a aparecer acá día por día." />
            ) : (
              <ChartCard height="h-64">
                <BarTrendChart data={usersSeries} dataKey="count" fill="#38bdf8" valueFormatter={formatCompactNumber} />
              </ChartCard>
            )}
          </div>
        </div>

        <div className="glass rounded-3xl border border-white/10 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">🏆 Cartas más vendidas</p>
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