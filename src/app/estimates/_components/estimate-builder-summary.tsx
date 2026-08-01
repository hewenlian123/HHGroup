"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
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
  const internalLines = [
    { label: "Material", value: materialCost },
    { label: "Labor", value: laborCost },
    { label: "Subcontractor", value: subcontractorCost },
  ].filter(({ value }) => Math.abs(value) >= 0.005);

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
          {internalLines.length > 0 ? (
            internalLines.map(({ label, value }) => (
              <InternalLine key={label} label={label} value={value} />
            ))
          ) : (
            <p className="py-0.5 text-[12.5px] leading-snug text-[#7F899B]">No internal costs</p>
          )}
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

export function EstimateBuilderMobileSummary({
  summary,
  className,
}: {
  summary: EstimateSummaryResult | null;
  className?: string;
}): React.ReactElement {
  return (
    <details className={cn("eb-mobile-summary", className)}>
      <summary aria-label="Toggle price breakdown">
        <span className="eb-mobile-summary-label">Total</span>
        <span className={cn("eb-mobile-summary-total", EB.goldTotal)}>
          {summary ? fmt(summary.grandTotal) : "—"}
        </span>
        <ChevronDown className="eb-mobile-summary-chevron h-4 w-4" aria-hidden />
      </summary>
      {summary ? (
        <div className="eb-mobile-summary-breakdown">
          <SummaryLine label="Subtotal" value={summary.subtotal} />
          {summary.discount > 0 ? <SummaryLine label="Discount" value={-summary.discount} /> : null}
          {summary.tax > 0 ? <SummaryLine label="Tax" value={summary.tax} /> : null}
        </div>
      ) : null}
    </details>
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
