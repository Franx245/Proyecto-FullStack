"use client";

import * as React from "react";
import * as Recharts from "recharts";
import { cn } from "@/lib/utils";

interface ChartConfig {
  label?: string;
  color?: string;
}

interface ChartContainerProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
  config?: Record<string, ChartConfig>;
}

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: any[];
  className?: string;
  formatter?: (value: any) => string;
  labelFormatter?: (payload: any) => string;
  hideLabel?: boolean;
}

interface ChartLegendContentProps {
  payload?: any[];
  className?: string;
}

const ChartContext = React.createContext<{ config?: Record<string, ChartConfig> } | null>(null);

export function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used inside ChartContainer");
  return ctx;
}

export const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  function ChartContainer({ id, className, children, config = {}, ...rest }, ref) {
    const uniqueId = React.useId();
    const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          data-chart={chartId}
          className={cn(
            "flex aspect-video w-full items-center justify-center text-xs",
            className
          )}
          {...rest}
        >
          <Recharts.ResponsiveContainer>
            {children}
          </Recharts.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  }
);

/* ================= TOOLTIP ================= */

export const ChartTooltip = Recharts.Tooltip;

export const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  function ChartTooltipContent(
    { active, payload, className, formatter, labelFormatter, hideLabel },
    ref
  ) {
    const { config } = useChart();

    if (!active || !payload?.length) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl",
          className
        )}
      >
        {!hideLabel && (
          <div className="font-semibold mb-1">
            {labelFormatter?.(payload) ?? payload[0]?.name}
          </div>
        )}

        <div className="space-y-1">
          {payload.map((item: any, i: number) => {
            const key = item?.dataKey;
            const cfg = config?.[key] || {};

            return (
              <div key={key || i} className="flex justify-between">
                <span>{cfg.label || item?.name}</span>
                <span>
                  {formatter
                    ? formatter(item?.value)
                    : item?.value?.toLocaleString?.()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

/* ================= LEGEND ================= */

export function ChartLegendContent({ payload, className }: ChartLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) return null;

  return (
    <div className={cn("flex gap-4 pt-3", className)}>
      {payload.map((item: any, i: number) => {
        const key = item?.dataKey;
        const cfg = config?.[key] || {};

        return (
          <div key={key || i} className="flex items-center gap-1 text-xs">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: item?.color }}
            />
            {cfg.label || key}
          </div>
        );
      })}
    </div>
  );
}