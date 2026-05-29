import type { ReactElement } from "react";

import { resolveEstimatePreviewSummaryDisplay } from "@/lib/estimate-preview-summary-display";

export type EstimatePreviewSummaryPanelProps = {
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  isProposalStyle: boolean;
  fmt: (n: number) => string;
};

export function EstimatePreviewSummaryPanel({
  subtotal,
  tax,
  discount,
  grandTotal,
  isProposalStyle,
  fmt,
}: EstimatePreviewSummaryPanelProps): ReactElement {
  const display = resolveEstimatePreviewSummaryDisplay({
    subtotal,
    tax,
    discount,
    isProposalStyle,
  });

  return (
    <section className="mt-10 print:break-inside-avoid" data-testid="estimate-preview-summary">
      <div className="ml-auto max-w-[21rem] space-y-2.5 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-zinc-600">Subtotal</span>
          <span className="tabular-nums text-zinc-900">${fmt(subtotal)}</span>
        </div>
        {display.showTax ? (
          <div className="flex justify-between gap-6">
            <span className="text-zinc-600">{display.taxLabel}</span>
            <span className="tabular-nums text-zinc-900">${fmt(tax)}</span>
          </div>
        ) : null}
        {display.showDiscount ? (
          <div className="flex justify-between gap-6">
            <span className="text-zinc-600">Discount</span>
            <span className="tabular-nums text-zinc-900">−${fmt(discount)}</span>
          </div>
        ) : null}
        <div className="mt-4 flex justify-between gap-6 border-t border-zinc-200/80 pt-4 text-[18px] font-semibold tracking-[-0.025em] text-zinc-950">
          <span>{display.totalLabel}</span>
          <span className="tabular-nums">${fmt(grandTotal)}</span>
        </div>
      </div>
    </section>
  );
}
