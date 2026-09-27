"use client";

import * as React from "react";
import { estimateInspectorTotal } from "./estimate-line-item-model";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EstimateSummaryResult } from "@/lib/data";
import { formatEstimateCurrency } from "./estimate-currency";
import { EB } from "./estimate-builder-ui";
import { EstimateStitchInspectorContext } from "./estimate-stitch-inspector";
import { cn } from "@/lib/utils";

const fmt = formatEstimateCurrency;

export type EstimateBuilderPaymentSummary = {
  milestoneCount: number;
  scheduledTotal: number;
};

export type EstimateBuilderSummaryProps = {
  summary: EstimateSummaryResult | null;
  /** Shown when milestones exist — compact executive line only. */
  paymentSummary?: EstimateBuilderPaymentSummary | null;
  onOpenPaymentSchedule?: () => void;
  onOpenDetails?: () => void;
  onOpenPricing?: () => void;
  paymentContent?: React.ReactNode;
  className?: string;
  floating?: boolean;
};

export function EstimateBuilderSummary({
  summary,
  paymentSummary = null,
  className,
  floating = true,
}: EstimateBuilderSummaryProps): React.ReactElement {
  const shellClass = cn(floating ? EB.glassSidebarFloat : EB.glassSidebar, className);

  if (!summary) {
    return (
      <div className={shellClass} aria-label="Estimate overview">
        <SummaryHeader />
        <p className="text-hh-table-cell leading-snug text-muted-foreground">
          Add scope lines to see totals.
        </p>
      </div>
    );
  }

  const { subtotal, grandTotal, tax, discount } = summary;

  return (
    <div className={shellClass} aria-label="Estimate overview">
      <SummaryHeader />

      {paymentSummary && paymentSummary.milestoneCount > 0 ? (
        <div className="mb-3 border-b border-border pb-2.5">
          <p className="text-hh-status font-semibold uppercase tracking-normal leading-tight text-muted-foreground">
            Payments
          </p>
          <p className="mt-1 text-hh-metadata leading-snug text-muted-foreground">
            {paymentSummary.milestoneCount} milestone
            {paymentSummary.milestoneCount === 1 ? "" : "s"} ·{" "}
            <span className="font-medium tabular-nums text-foreground hh-fin">
              {fmt(paymentSummary.scheduledTotal)}
            </span>{" "}
            scheduled
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <SummaryLine label="Subtotal" value={subtotal} />
        {discount > 0 ? <SummaryLine label="Discount" value={-discount} /> : null}
        {tax > 0 ? <SummaryLine label="Tax" value={tax} /> : null}
      </div>

      <div className="mt-4 border-t border-border pt-3.5">
        <p className="text-hh-status font-semibold uppercase tracking-normal leading-tight text-muted-foreground">
          Total
        </p>
        <p
          className={cn(
            "mt-1.5 break-words text-[clamp(1.25rem,4vw,1.625rem)] font-semibold leading-none tabular-nums tracking-normal hh-fin",
            EB.goldTotal
          )}
        >
          {fmt(grandTotal)}
        </p>
      </div>
    </div>
  );
}

export function EstimateBuilderCompactSummary({
  summary,
  paymentSummary = null,
  onOpenDetails,
  onOpenPricing,
  className,
}: EstimateBuilderSummaryProps): React.ReactElement {
  const inspector = React.useContext(EstimateStitchInspectorContext);
  const previewTotal = estimateInspectorTotal(summary?.grandTotal, inspector?.pricing ?? null);
  return (
    <section
      className={cn("eb-pricing-summary-strip", className)}
      aria-label="Estimate pricing summary"
      data-estimate-inspector="pricing"
    >
      <div className="estimate-workspace-summary">
        <div className="estimate-workspace-financials">
          <div className="estimate-workspace-total-label">
            <h2>Estimate Summary</h2>
            <span>USD ($)</span>
          </div>
          <p className="estimate-workspace-total-label">
            Grand Total{inspector?.pricing?.adjustment ? " (preview)" : ""}
          </p>
          <strong className="estimate-workspace-grand-total">
            {previewTotal == null ? "—" : fmt(previewTotal)}
          </strong>
          <div className="estimate-workspace-costs">
            <CompactAmount
              label="Subtotal"
              value={summary ? summary.subtotal + (inspector?.pricing?.adjustment ?? 0) : null}
            />
            <CompactAmount label="Discount" value={summary ? -summary.discount : null} />
            <CompactAmount label="Tax" value={summary?.tax ?? null} />
          </div>
          {onOpenPricing ? (
            <button
              type="button"
              className="estimate-workspace-text-action"
              onClick={onOpenPricing}
            >
              Edit tax &amp; discount
            </button>
          ) : null}
        </div>
        <div className="estimate-workspace-costs" aria-label="Payment allocation summary">
          <CompactAmount label="Scheduled" value={paymentSummary?.scheduledTotal ?? 0} />
          <CompactAmount
            label="Remaining"
            value={
              previewTotal == null ? null : previewTotal - (paymentSummary?.scheduledTotal ?? 0)
            }
          />
        </div>
        <div className="estimate-workspace-disclosure">
          <strong>Payment Schedule</strong>
          <p className="text-xs text-muted-foreground">
            {paymentSummary?.milestoneCount ?? 0} milestones ·{" "}
            {previewTotal && previewTotal > 0
              ? (((paymentSummary?.scheduledTotal ?? 0) / previewTotal) * 100).toFixed(1)
              : "0"}
            % allocated
          </p>
        </div>
        <details className="estimate-workspace-disclosure">
          <summary>
            <strong>Client Presentation Rules</strong>
            <ChevronRight size={16} aria-hidden />
          </summary>
          <div className="estimate-workspace-presentation">
            <p>
              Document style and customer/project details control your client-facing estimate.
              Individual amounts can be hidden from each item&apos;s menu.
            </p>
            {onOpenDetails ? (
              <button
                type="button"
                className="estimate-workspace-text-action"
                onClick={onOpenDetails}
              >
                Edit document details
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </section>
  );
}

export function EstimateBuilderMobileSummary({
  summary,
  className,
}: {
  summary: EstimateSummaryResult | null;
  className?: string;
}): React.ReactElement {
  const inspector = React.useContext(EstimateStitchInspectorContext);
  const previewTotal = estimateInspectorTotal(summary?.grandTotal, inspector?.pricing ?? null);
  return (
    <details className={cn("eb-mobile-summary", className)}>
      <summary aria-label="Toggle price breakdown">
        <span className="eb-mobile-summary-label">Total</span>
        <span className={cn("eb-mobile-summary-total", EB.goldTotal)}>
          {previewTotal == null ? "—" : fmt(previewTotal)}
        </span>
        <ChevronDown className="eb-mobile-summary-chevron h-4 w-4" aria-hidden />
      </summary>
      {summary ? (
        <div className="eb-mobile-summary-breakdown">
          <SummaryLine
            label="Subtotal"
            value={summary.subtotal + (inspector?.pricing?.adjustment ?? 0)}
          />
          {summary.discount > 0 ? <SummaryLine label="Discount" value={-summary.discount} /> : null}
          {summary.tax > 0 ? <SummaryLine label="Tax" value={summary.tax} /> : null}
        </div>
      ) : null}
    </details>
  );
}

function SummaryHeader(): React.ReactElement {
  return (
    <div className="mb-3.5 border-b border-border pb-2.5">
      <p className="text-hh-status font-semibold uppercase tracking-normal leading-tight text-muted-foreground">
        Estimate overview
      </p>
    </div>
  );
}

function CompactAmount({
  label,
  value,
  total = false,
}: {
  label: string;
  value: number | null;
  total?: boolean;
}): React.ReactElement {
  return (
    <div className={cn("estimate-workspace-cost-row", total && "is-total")}>
      <span>{label}</span>
      <strong>{value === null ? "—" : fmt(value)}</strong>
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
