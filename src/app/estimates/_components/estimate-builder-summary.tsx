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
      <div className={cn("py-2", className)} aria-label="Estimate summary">
        <p className="text-xs text-muted-foreground/45">Add scope lines to see totals.</p>
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
    <div className={cn("flex flex-col pt-1", className)} aria-label="Estimate summary">
      {showInternal ? (
        <div className="mb-6 space-y-0.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/35">
            Internal
          </p>
          <InternalLine label="Material" value={materialCost} />
          <InternalLine label="Labor" value={laborCost} />
          <InternalLine label="Subcontractor" value={subcontractorCost} />
        </div>
      ) : null}

      <div className="space-y-0.5">
        <SummaryLine label="Subtotal" value={subtotal} />
        {discount > 0 ? <SummaryLine label="Discount" value={-discount} /> : null}
        {tax > 0 ? <SummaryLine label="Tax" value={tax} /> : null}
        {showInternal && markup > 0 ? <SummaryLine label="Markup" value={markup} muted /> : null}
      </div>

      <div className="mt-8 pt-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/40">
          Total
        </p>
        <p className="mt-3 text-[2.25rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
          {fmt(grandTotal)}
        </p>
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-muted-foreground/45">{label}</span>
      <span
        className={cn(
          "text-[11px] tabular-nums",
          muted ? "text-muted-foreground/35" : "text-muted-foreground/55"
        )}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

function InternalLine({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-muted-foreground/40">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground/45">{fmt(value)}</span>
    </div>
  );
}
