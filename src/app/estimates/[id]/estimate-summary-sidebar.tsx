import type { EstimateSummaryResult } from "@/lib/data";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

export function EstimateSummarySidebar({ summary }: { summary: EstimateSummaryResult | null }) {
  if (!summary) {
    return (
      <div className="border border-zinc-200 dark:border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Estimate Summary</h3>
        <p className="text-sm text-muted-foreground">Add line items to see totals.</p>
      </div>
    );
  }
  const { subtotal, grandTotal, tax, discount, markup } = summary;
  const adjustments = grandTotal - subtotal;
  const adjustmentsLabel =
    adjustments < 0 ? `-$${fmt(Math.abs(adjustments))}` : `$${fmt(adjustments)}`;

  return (
    <div className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-border">
        <h3 className="text-sm font-semibold text-foreground">Estimate Summary</h3>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-border">
        <div className="flex justify-between items-center py-2.5 px-4 text-sm">
          <span className="text-foreground font-medium">Subtotal</span>
          <span className="tabular-nums font-medium text-foreground">${fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between items-center py-2.5 px-4 text-sm text-muted-foreground">
          <div className="min-w-0">
            <div className="text-muted-foreground">Adjustments</div>
            <div className="mt-0.5 text-xs text-muted-foreground/80 truncate">
              Tax ${fmt(tax)} • Discount -${fmt(discount)} • Markup ${fmt(markup)}
            </div>
          </div>
          <span className="tabular-nums font-medium text-foreground">{adjustmentsLabel}</span>
        </div>
        <div className="flex justify-between items-center py-3 px-4 bg-muted/30 dark:bg-muted/20">
          <span className="font-semibold text-foreground">Total</span>
          <span className="tabular-nums font-semibold text-foreground">${fmt(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
