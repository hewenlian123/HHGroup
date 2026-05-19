"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstimateSummaryResult } from "@/lib/data";
import { formatEstimateCurrency } from "./estimate-currency";
import { cn } from "@/lib/utils";

const fmt = formatEstimateCurrency;

export type EstimateBuilderSummaryProps = {
  summary: EstimateSummaryResult | null;
  /** Show material/labor/subcontractor + markup breakdown (internal only). */
  showInternal?: boolean;
  /** Editable tax / discount / markup (new estimate or meta form). */
  editable?: {
    tax: number;
    discount: number;
    markupPct: number;
    onTaxChange: (v: number) => void;
    onDiscountChange: (v: number) => void;
    onMarkupPctChange: (v: number) => void;
    onTaxTouched?: () => void;
  };
  className?: string;
};

export function EstimateBuilderSummary({
  summary,
  showInternal = false,
  editable,
  className,
}: EstimateBuilderSummaryProps): React.ReactElement {
  if (!summary) {
    return (
      <div className={cn("space-y-2 py-2", className)}>
        <p className="text-sm text-muted-foreground">Add line items to see totals.</p>
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
    <div className={cn("space-y-4", className)} aria-label="Estimate summary">
      {showInternal ? (
        <div className="space-y-1.5 border-b border-border/60 pb-3 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Internal
          </p>
          <SummaryLine label="Material" value={materialCost} muted />
          <SummaryLine label="Labor" value={laborCost} muted />
          <SummaryLine label="Subcontractor" value={subcontractorCost} muted />
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        <SummaryLine label="Subtotal" value={subtotal} />
        {editable ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="builder-summary-discount" className="text-muted-foreground text-sm">
                Discount
              </Label>
              <Input
                id="builder-summary-discount"
                type="number"
                step="0.01"
                value={editable.discount}
                onChange={(e) => editable.onDiscountChange(Number(e.target.value) || 0)}
                className="h-9 w-[7.5rem] text-right tabular-nums"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="builder-summary-tax" className="text-muted-foreground text-sm">
                Tax
              </Label>
              <Input
                id="builder-summary-tax"
                type="number"
                step="0.01"
                value={editable.tax}
                onChange={(e) => {
                  editable.onTaxTouched?.();
                  editable.onTaxChange(Number(e.target.value) || 0);
                }}
                className="h-9 w-[7.5rem] text-right tabular-nums"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="builder-summary-markup" className="text-muted-foreground text-sm">
                Markup %
              </Label>
              <Input
                id="builder-summary-markup"
                type="number"
                step="0.1"
                value={editable.markupPct}
                onChange={(e) => editable.onMarkupPctChange(Number(e.target.value) || 0)}
                className="h-9 w-[7.5rem] text-right tabular-nums"
              />
            </div>
          </>
        ) : (
          <>
            <SummaryLine label="Discount" value={-discount} muted />
            <SummaryLine label="Tax" value={tax} muted />
            {showInternal && markup > 0 ? (
              <SummaryLine label="Markup" value={markup} muted />
            ) : null}
          </>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-4">
        <span className="text-base font-semibold text-foreground">Total</span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {fmt(grandTotal)}
        </span>
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
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-sm", muted ? "text-muted-foreground" : "text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums text-sm font-medium",
          muted ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {fmt(value)}
      </span>
    </div>
  );
}
