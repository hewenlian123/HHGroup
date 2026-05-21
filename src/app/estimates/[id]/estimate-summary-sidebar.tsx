import type { EstimateSummaryResult } from "@/lib/data";
import { formatEstimateCurrency } from "../_components/estimate-currency";

const fmt = formatEstimateCurrency;

export function EstimateSummarySidebar({ summary }: { summary: EstimateSummaryResult | null }) {
  if (!summary) {
    return (
      <div className="border border-zinc-200 dark:border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Estimate Summary</h3>
        <p className="text-sm text-muted-foreground">Add line items to see totals.</p>
      </div>
    );
  }
  const { subtotal, grandTotal, tax, discount } = summary;

  return (
    <div className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-border">
        <h3 className="text-sm font-semibold text-foreground">Estimate Summary</h3>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-border">
        <div className="flex justify-between items-center py-2.5 px-4 text-sm">
          <span className="text-foreground font-medium">Subtotal</span>
          <span className="tabular-nums font-medium text-foreground">{fmt(subtotal)}</span>
        </div>
        {tax > 0 ? (
          <div className="flex justify-between items-center py-2.5 px-4 text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="tabular-nums font-medium text-foreground">{fmt(tax)}</span>
          </div>
        ) : null}
        {discount > 0 ? (
          <div className="flex justify-between items-center py-2.5 px-4 text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="tabular-nums font-medium text-foreground">{fmt(-discount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between items-center py-3 px-4 bg-muted/30 dark:bg-muted/20">
          <span className="font-semibold text-foreground">Total</span>
          <span className="tabular-nums font-semibold text-foreground">{fmt(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
