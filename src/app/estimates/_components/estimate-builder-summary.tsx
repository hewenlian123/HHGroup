"use client";

import * as React from "react";
import type { EstimateSummaryResult } from "@/lib/data";
import { formatEstimateCurrency } from "./estimate-currency";
import { cn } from "@/lib/utils";

const fmt = formatEstimateCurrency;

export type EstimateBuilderSummaryProps = {
  summary: EstimateSummaryResult | null;
  /** Show material/labor/subcontractor breakdown (internal only). */
  showInternal?: boolean;
  className?: string;
};

export function EstimateBuilderSummary({
  summary,
  showInternal = false,
  className,
}: EstimateBuilderSummaryProps): React.ReactElement {
  if (!summary) {
    return (
      <div className={cn("py-1", className)} aria-label="Estimate summary">
        <p className="text-sm text-muted-foreground/70">Add line items to see totals.</p>
      </div>
    );
  }

  const {
    subtotal,
    grandTotal,
    tax,
    discount,
    markup,
    materialCost,
    laborCost,
    subcontractorCost,
  } = summary;

  return (
    <div className={cn("space-y-5", className)} aria-label="Estimate summary">
      {showInternal ? (
        <div className="space-y-1 text-xs text-muted-foreground/65">
          <p className="font-medium uppercase tracking-[0.08em] text-muted-foreground/55">
            Internal
          </p>
          <SummaryLine label="Material" value={materialCost} />
          <SummaryLine label="Labor" value={laborCost} />
          <SummaryLine label="Subcontractor" value={subcontractorCost} />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <SummaryLine label="Subtotal" value={subtotal} />
        {discount > 0 ? <SummaryLine label="Discount" value={-discount} /> : null}
        {tax > 0 ? <SummaryLine label="Tax" value={tax} /> : null}
        {showInternal && markup > 0 ? <SummaryLine label="Markup" value={markup} /> : null}
      </div>

      <div className="space-y-1 pt-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/55">
          Total
        </p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {fmt(grandTotal)}
        </p>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="tabular-nums text-muted-foreground/85">{fmt(value)}</span>
    </div>
  );
}
