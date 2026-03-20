import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCostCodes, estimateLineTotal, groupEstimateItemsByCategoryId, type EstimateItemRow, type CostCode } from "@/lib/data";
import { ChevronRight } from "lucide-react";

export type EstimateReadOnlyPayload = {
  estimateId: string;
  number: string;
  status: string;
  date: string;
  clientName: string;
  clientAddress: string;
  clientPhone?: string;
  clientEmail?: string;
  projectName: string;
  projectAddress: string;
  items: EstimateItemRow[];
  /** When set, section order and titles follow estimate_categories + orphans (same as preview). */
  estimateCategories?: { costCode: string; displayName: string }[];
};

export function EstimateReadOnlyContent({ payload }: { payload: EstimateReadOnlyPayload }) {
  const costCodes = getCostCodes();
  const catalogNameByCode = Object.fromEntries(costCodes.map((c) => [c.code, c.name])) as Record<string, string>;
  const estimateCategories = payload.estimateCategories ?? [];
  const costSections = groupEstimateItemsByCategoryId(payload.items, estimateCategories, catalogNameByCode);

  const subtotal = payload.items.reduce((s, r) => s + estimateLineTotal(r), 0);
  const overheadPct = 0.05;
  const profitPct = 0.1;
  const overhead = subtotal * overheadPct;
  const profit = subtotal * profitPct;
  const grandTotal = subtotal + overhead + profit;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Client Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-foreground">{payload.clientName}</p>
            {payload.clientPhone && <p className="text-muted-foreground">{payload.clientPhone}</p>}
            {payload.clientEmail && <p className="text-muted-foreground">{payload.clientEmail}</p>}
            <p className="text-muted-foreground">{payload.clientAddress}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Project Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-foreground">{payload.projectName}</p>
            <p className="text-muted-foreground">{payload.projectAddress}</p>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Cost Code Sections</h2>
        <div className="space-y-4">
          {costSections.map(({ categoryId, title, rows, sectionTotal }) => (
            <CostCodeSectionReadOnly
              key={categoryId}
              categoryId={categoryId}
              title={title}
              costCodes={costCodes}
              rows={rows}
              sectionSubtotal={sectionTotal}
            />
          ))}
        </div>
      </section>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6 max-w-md ml-auto">
        <CardHeader className="pb-2 px-0">
          <CardTitle className="text-base font-semibold">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-0">
          <SummaryRow label="Subtotal" value={subtotal} />
          <SummaryRow label="Overhead (5%)" value={overhead} />
          <SummaryRow label="Profit (10%)" value={profit} />
          <div className="flex justify-between items-center pt-3 border-t border-zinc-200/60 dark:border-border">
            <span className="font-semibold text-foreground">Grand Total</span>
            <span className="tabular-nums font-semibold text-foreground">
              ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function CostCodeSectionReadOnly({
  categoryId,
  title,
  costCodes,
  rows,
  sectionSubtotal,
}: {
  categoryId: string;
  title: string;
  costCodes: CostCode[];
  rows: EstimateItemRow[];
  sectionSubtotal: number;
}) {
  const cc = costCodes.find((c) => c.code === categoryId);
  const headerLabel = cc ? `${cc.code} 00 00 – ${cc.name}` : `${categoryId} – ${title}`;

  return (
    <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
      <details className="group" open>
        <summary className="flex list-none flex-wrap items-center justify-between gap-2 cursor-pointer px-6 py-4 hover:bg-zinc-50/50 dark:hover:bg-muted/30">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform" />
            <span className="font-medium text-foreground">{headerLabel}</span>
          </div>
          <span className="tabular-nums text-sm font-medium text-foreground">
            ${sectionSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </summary>
        <div className="border-t border-zinc-200/60 dark:border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/20">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Qty</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Unit</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Unit Cost</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Markup %</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 font-medium text-foreground">{row.desc}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">{row.qty}</td>
                    <td className="py-3 px-4 text-muted-foreground">{row.unit}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">${row.unitCost.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{(row.markupPct * 100).toFixed(0)}%</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium text-foreground">
                      ${estimateLineTotal(row).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
    </div>
  );
}
