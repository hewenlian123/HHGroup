"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CashFlowPoint {
  date: string;
  cumulativeIncome: number;
  cumulativeExpense: number;
  netCash: number;
}

export interface ProjectCashFlowChartProps {
  points: CashFlowPoint[];
  className?: string;
  width?: number;
  height?: number;
  /** Padding inside the chart area for axis labels */
  padding?: { top: number; right: number; bottom: number; left: number };
}

export function ProjectCashFlowChart({
  points,
  className,
  width = 640,
  height = 280,
  padding = { top: 16, right: 16, bottom: 28, left: 52 },
}: ProjectCashFlowChartProps) {
  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border/60 bg-background",
          className
        )}
        style={{ width, height }}
      >
        <p className="text-sm text-muted-foreground">No cash flow data</p>
      </div>
    );
  }

  const { top, right, bottom, left } = padding;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const allValues = points.flatMap((p) => [p.cumulativeIncome, p.cumulativeExpense, p.netCash]);
  const yMin = Math.min(0, ...allValues);
  const yMax = Math.max(0, ...allValues);
  const yRange = yMax - yMin || 1;
  const yScale = (v: number) => top + chartHeight - ((v - yMin) / yRange) * chartHeight;

  const xScale = (i: number) => left + (i / Math.max(1, points.length - 1)) * chartWidth;

  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(v)}`).join(" ");

  const incomePath = linePath(points.map((p) => p.cumulativeIncome));
  const expensePath = linePath(points.map((p) => p.cumulativeExpense));
  const netPath = linePath(points.map((p) => p.netCash));

  const singlePoint = points.length === 1;
  const cx = singlePoint ? xScale(0) : undefined;
  const cyIncome = singlePoint ? yScale(points[0].cumulativeIncome) : undefined;
  const cyExpense = singlePoint ? yScale(points[0].cumulativeExpense) : undefined;
  const cyNet = singlePoint ? yScale(points[0].netCash) : undefined;

  const yTicks = 5;
  const yTickValues: number[] = [];
  for (let i = 0; i <= yTicks; i++) {
    yTickValues.push(yMin + (yRange * i) / yTicks);
  }

  const formatY = (v: number) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return String(Math.round(v));
  };

  const formatDate = (d: string) => {
    try {
      const [, m, day] = d.split("-");
      return `${m}/${day}`;
    } catch {
      return d;
    }
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <svg width={width} height={height} className="min-w-full" viewBox={`0 0 ${width} ${height}`}>
        {/* Y-axis labels */}
        {yTickValues.map((v, i) => (
          <g key={i}>
            <line
              x1={left}
              y1={yScale(v)}
              x2={left + chartWidth}
              y2={yScale(v)}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeDasharray="4 2"
            />
            <text
              x={left - 8}
              y={yScale(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              ${formatY(v)}
            </text>
          </g>
        ))}
        {/* X-axis labels - first, middle, last */}
        {points.length > 0 && (
          <>
            <text
              x={left}
              y={height - 6}
              textAnchor="start"
              className="fill-muted-foreground text-[10px]"
            >
              {formatDate(points[0].date)}
            </text>
            {points.length > 1 && (
              <text
                x={left + chartWidth / 2}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {formatDate(points[Math.floor(points.length / 2)].date)}
              </text>
            )}
            {points.length > 1 && (
              <text
                x={left + chartWidth}
                y={height - 6}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {formatDate(points[points.length - 1].date)}
              </text>
            )}
          </>
        )}
        {/* Lines */}
        <path
          d={incomePath}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={expensePath}
          fill="none"
          stroke="rgb(239 68 68)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={netPath}
          fill="none"
          stroke="rgb(34 197 94)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {singlePoint && cx != null && cyIncome != null && (
          <>
            <circle cx={cx} cy={cyIncome} r={4} fill="rgb(59 130 246)" />
            <circle cx={cx} cy={cyExpense!} r={4} fill="rgb(239 68 68)" />
            <circle cx={cx} cy={cyNet!} r={4} fill="rgb(34 197 94)" />
          </>
        )}
      </svg>
      <div className="flex flex-wrap gap-4 mt-3 justify-center text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Income</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Expense</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Net Cash</span>
        </span>
      </div>
    </div>
  );
}
