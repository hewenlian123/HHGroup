"use client";

import * as React from "react";
import type { EstimateSummaryResult } from "@/lib/data";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB } from "./estimate-builder-ui";
import { cn } from "@/lib/utils";

const fmt = formatEstimateCurrency;

export type EstimateBuilderPaymentSummary = {
  milestoneCount: number;
  scheduledTotal: number;
};

export type EstimateBuilderSummaryProps = {
  summary: EstimateSummaryResult | null;
  showInternal?: boolean;
  /** Shown when milestones exist — compact executive line only. */
  paymentSummary?: EstimateBuilderPaymentSummary | null;
  className?: string;
  floating?: boolean;
};

export function EstimateBuilderSummary({
  summary,
  showInternal = false,
  paymentSummary = null,
  className,
  floating = true,
}: EstimateBuilderSummaryProps): React.ReactElement {
  const shellClass = cn(floating ? EB.glassSidebarFloat : EB.glassSidebar, className);

  if (!summary) {
    return (
      <div className={shellClass} aria-label="Estimate overview">
        <SummaryHeader />
        <p className="text-[11px] leading-snug text-zinc-500">Add scope lines to see totals.</p>
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
    <div className={shellClass} aria-label="Estimate overview">
      <SummaryHeader />

      {paymentSummary && paymentSummary.milestoneCount > 0 ? (
        <div className="mb-3 border-b border-white/[0.05] pb-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Payments
          </p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-400">
            {paymentSummary.milestoneCount} milestone
            {paymentSummary.milestoneCount === 1 ? "" : "s"} ·{" "}
            <span className="font-medium tabular-nums text-zinc-300">
              {fmt(paymentSummary.scheduledTotal)}
            </span>{" "}
            scheduled
          </p>
        </div>
      ) : null}

      {showInternal ? (
        <div className="mb-3 space-y-1 border-b border-white/[0.05] pb-2.5">
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

      <div className="mt-4 border-t border-white/[0.05] pt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">Total</p>
        <p
          className={cn(
            "mt-1 break-words text-[clamp(1.25rem,4vw,1.65rem)] font-semibold leading-none tabular-nums tracking-tight text-zinc-50",
            EB.goldTotal
          )}
        >
          {fmt(grandTotal)}
        </p>
      </div>
    </div>
  );
}

function SummaryHeader(): React.ReactElement {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">
        Estimate overview
      </p>
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
      <span
        className={cn(
          EB.summaryLineValue,
          "min-w-0 max-w-[58%] break-words text-right",
          muted && EB.summaryLineValueMuted
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
      <span className={EB.summaryLineLabel}>{label}</span>
      <span className={cn(EB.summaryLineValue, "min-w-0 max-w-[58%] break-words text-right")}>
        {fmt(value)}
      </span>
    </div>
  );
}
