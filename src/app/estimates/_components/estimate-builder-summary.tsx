"use client";

import * as React from "react";
import { FileText } from "lucide-react";
import type { EstimateSummaryResult } from "@/lib/data";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB } from "./estimate-builder-ui";
import { cn } from "@/lib/utils";

const fmt = formatEstimateCurrency;

export type EstimateBuilderSummaryProps = {
  summary: EstimateSummaryResult | null;
  showInternal?: boolean;
  className?: string;
  floating?: boolean;
};

export function EstimateBuilderSummary({
  summary,
  showInternal = false,
  className,
  floating = true,
}: EstimateBuilderSummaryProps): React.ReactElement {
  const shellClass = cn(floating ? EB.glassSidebarFloat : EB.glassSidebar, className);

  if (!summary) {
    return (
      <div className={shellClass} aria-label="Estimate summary">
        <SummaryHeader />
        <p className="text-xs text-zinc-400/95">Add scope lines to see totals.</p>
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
    <div className={shellClass} aria-label="Estimate summary">
      <SummaryHeader />

      {showInternal ? (
        <div className="mb-4 space-y-1 border-b border-white/[0.06] pb-3">
          <p className={EB.summaryInternalLabel}>Internal</p>
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

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Total</p>
        <p
          className={cn(
            "mt-1.5 text-[1.75rem] font-semibold leading-none tabular-nums tracking-tight text-zinc-50",
            EB.goldTotal
          )}
        >
          {fmt(grandTotal)}
        </p>
      </div>

      <button
        type="button"
        className={cn(EB.glassNotes, "mt-3 flex w-full items-start gap-2 text-left")}
        aria-label="Add notes (internal)"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
        <span>
          <span className="block text-xs font-medium text-zinc-100">Add notes</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-400">
            Internal only — not shown on customer preview.
          </span>
        </span>
      </button>
    </div>
  );
}

function SummaryHeader(): React.ReactElement {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-zinc-500">Summary</p>
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
      <span className={EB.summaryLineLabel}>{label}</span>
      <span className={cn(EB.summaryLineValue, muted && EB.summaryLineValueMuted)}>
        {fmt(value)}
      </span>
    </div>
  );
}

function InternalLine({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={EB.summaryLineLabel}>{label}</span>
      <span className={EB.summaryLineValue}>{fmt(value)}</span>
    </div>
  );
}
