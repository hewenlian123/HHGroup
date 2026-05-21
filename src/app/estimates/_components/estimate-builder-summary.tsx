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
        <p className="text-[13px] leading-snug text-[#A7B0C0]">Add scope lines to see totals.</p>
      </div>
    );
  }

  const { subtotal, grandTotal, tax, discount, materialCost, laborCost, subcontractorCost } =
    summary;

  return (
    <div className={shellClass} aria-label="Estimate overview">
      <SummaryHeader />

      {paymentSummary && paymentSummary.milestoneCount > 0 ? (
        <div className="mb-3 border-b border-white/[0.05] pb-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#9EA8B8]">
            Payments
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#929CAF]">
            {paymentSummary.milestoneCount} milestone
            {paymentSummary.milestoneCount === 1 ? "" : "s"} ·{" "}
            <span className="font-medium tabular-nums text-[#D8DEE8] [font-feature-settings:'tnum']">
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

      <div className="space-y-1">
        <SummaryLine label="Subtotal" value={subtotal} />
        {discount > 0 ? <SummaryLine label="Discount" value={-discount} /> : null}
        {tax > 0 ? <SummaryLine label="Tax" value={tax} /> : null}
      </div>

      <div className="mt-4 border-t border-white/[0.08] pt-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#9EA8B8]">
          Total
        </p>
        <p
          className={cn(
            "mt-1.5 break-words text-[clamp(1.25rem,4vw,1.625rem)] font-semibold leading-none tabular-nums tracking-[-0.02em] [font-feature-settings:'tnum']",
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
    <div className="mb-3.5 border-b border-white/[0.06] pb-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#9EA8B8]">
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
