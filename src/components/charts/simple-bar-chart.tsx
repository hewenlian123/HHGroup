"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SimpleBarChartItem = {
  label: string;
  value: number;
  color?: string;
};

export function SimpleBarChart({
  data,
  maxValue,
  showValues,
  className,
}: {
  data: SimpleBarChartItem[];
  maxValue: number;
  showValues?: boolean;
  className?: string;
}) {
  const scale = maxValue > 0 ? 100 / maxValue : 0;
  return (
    <div className={cn("space-y-2", className)}>
      {data.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            {showValues && (
              <span className="tabular-nums font-medium">
                ${item.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", item.color ?? "bg-primary")}
              style={{ width: `${Math.min(100, item.value * scale)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
