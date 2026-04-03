import {
  getCostCodes,
  estimateLineTotal,
  groupEstimateItemsByCategoryId,
  type EstimateItemRow,
  type CostCode,
} from "@/lib/data";
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
  const catalogNameByCode = Object.fromEntries(costCodes.map((c) => [c.code, c.name])) as Record<
    string,
    string
  >;
  const estimateCategories = payload.estimateCategories ?? [];
  const costSections = groupEstimateItemsByCategoryId(
    payload.items,
    estimateCategories,
    catalogNameByCode
  );

  const subtotal = payload.items.reduce((s, r) => s + estimateLineTotal(r), 0);
  const overheadPct = 0.05;
  const profitPct = 0.1;
  const overhead = subtotal * overheadPct;
  const profit = subtotal * profitPct;
  const grandTotal = subtotal + overhead + profit;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-sm border border-[#E5E7EB] dark:border-border">
          <div className="border-b border-[#E5E7EB] px-4 py-3 dark:border-border">
            <h3 className="text-base font-semibold text-foreground">Client Info</h3>
          </div>
          <div className="space-y-2 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">{payload.clientName}</p>
            {payload.clientPhone && <p className="text-muted-foreground">{payload.clientPhone}</p>}
            {payload.clientEmail && <p className="text-muted-foreground">{payload.clientEmail}</p>}
            <p className="text-muted-foreground">{payload.clientAddress}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-sm border border-[#E5E7EB] dark:border-border">
          <div className="border-b border-[#E5E7EB] px-4 py-3 dark:border-border">
            <h3 className="text-base font-semibold text-foreground">Project Info</h3>
          </div>
          <div className="space-y-2 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">{payload.projectName}</p>
            <p className="text-muted-foreground">{payload.projectAddress}</p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Cost Code Sections
        </h2>
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

      <div className="ml-auto max-w-md overflow-hidden rounded-sm border border-[#E5E7EB] p-6 dark:border-border">
        <div className="pb-2">
          <h3 className="text-base font-semibold text-foreground">Summary</h3>
        </div>
        <div className="space-y-3">
          <SummaryRow label="Subtotal" value={subtotal} />
          <SummaryRow label="Overhead (5%)" value={overhead} />
          <SummaryRow label="Profit (10%)" value={profit} />
          <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-3 dark:border-border">
            <span className="font-semibold text-foreground">Grand Total</span>
            <span className="font-semibold tabular-nums text-foreground">
              ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
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
    <div className="overflow-hidden rounded-sm border border-[#E5E7EB] dark:border-border">
      <details className="group" open>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-6 py-4 hover:bg-[#F9FAFB]/80 dark:hover:bg-muted/20">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            <span className="font-medium text-foreground">{headerLabel}</span>
          </div>
          <span className="text-sm font-medium tabular-nums text-foreground">
            ${sectionSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </summary>
        <div className="border-t border-[#E5E7EB] dark:border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-white dark:border-border/60 dark:bg-muted/20">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Unit Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Markup %
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#E5E7EB]/80 transition-colors hover:bg-[#F9FAFB] dark:border-border/30 dark:hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{row.desc}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.qty}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.unit}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      ${row.unitCost.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {(row.markupPct * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                      $
                      {estimateLineTotal(row).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">
        ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}
