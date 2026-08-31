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
  onOpenPaymentSchedule?: () => void;
  onOpenDetails?: () => void;
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
        <p className="text-hh-table-cell leading-snug text-muted-foreground">
          Add scope lines to see totals.
        </p>
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

      {showInternal ? (
        <div className="mb-3 space-y-1 border-b border-border pb-2.5">
          <p className={EB.summaryInternalLabel}>Internal</p>
          {internalLines.length > 0 ? (
            internalLines.map(({ label, value }) => (
              <InternalLine key={label} label={label} value={value} />
            ))
          ) : (
            <p className="py-0.5 text-hh-metadata leading-snug text-muted-foreground">
              No internal costs
            </p>
          )}
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
  showInternal = false,
  paymentSummary = null,
  onOpenPaymentSchedule,
  onOpenDetails,
  className,
}: EstimateBuilderSummaryProps): React.ReactElement {
  return (
    <section
      className={cn("eb-pricing-summary-strip", className)}
      aria-label="Estimate pricing summary"
      data-estimate-inspector="pricing"
    >
      <header className="eb-pricing-inspector-header">
        <h2>Pricing overview</h2>
      </header>

      <nav className="eb-pricing-inspector-tabs" aria-label="Pricing inspector sections">
        <span aria-current="page">Overview</span>
        {onOpenPaymentSchedule ? (
          <button type="button" onClick={onOpenPaymentSchedule}>
            Payment
          </button>
        ) : null}
        {onOpenDetails ? (
          <button type="button" onClick={onOpenDetails}>
            Details
          </button>
        ) : null}
      </nav>

      <div className="eb-pricing-summary-main">
        <CompactAmount label="Subtotal" value={summary?.subtotal ?? null} />
        <CompactAmount
          label="Discount"
          value={summary ? (summary.discount > 0 ? -summary.discount : 0) : null}
        />
        <CompactAmount label="Tax" value={summary?.tax ?? null} />
        <CompactAmount label="Total" value={summary?.grandTotal ?? null} total />
      </div>

      {showInternal ? (
        <section className="eb-pricing-allocation" aria-labelledby="estimate-price-allocation">
          <h3 id="estimate-price-allocation">Estimate price allocation</h3>
          {summary ? (
            <div className="eb-pricing-allocation-list">
              <InternalLine label="Material" value={summary.materialCost} />
              <InternalLine label="Labor" value={summary.laborCost} />
              <InternalLine label="Subcontract" value={summary.subcontractorCost} />
            </div>
          ) : (
            <p className="text-hh-metadata text-muted-foreground">No internal costs</p>
          )}
        </section>
      ) : null}

      <section className="eb-pricing-payment-card" aria-labelledby="estimate-payment-summary">
        <div className="eb-pricing-payment-card-header">
          <h3 id="estimate-payment-summary">Payment summary</h3>
          {paymentSummary && paymentSummary.milestoneCount > 0 ? (
            <span className="eb-pricing-payment-status">Scheduled</span>
          ) : null}
        </div>
        {paymentSummary && paymentSummary.milestoneCount > 0 ? (
          <div className="eb-pricing-payment-card-body">
            <p>
              {paymentSummary.milestoneCount} milestone
              {paymentSummary.milestoneCount === 1 ? "" : "s"}
            </p>
            <p className="eb-pricing-payment-scheduled">
              <span>Scheduled</span>
              <strong>{fmt(paymentSummary.scheduledTotal)}</strong>
            </p>
          </div>
        ) : (
          <p className="eb-pricing-payment-empty">No milestones scheduled.</p>
        )}
      </section>
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
    <div className={cn("eb-pricing-summary-cell", total && "is-total")}>
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
