import {
  getCostCodes,
  estimateLineTotal,
  groupEstimateItemsByCategoryId,
  type EstimateItemRow,
  type CostCode,
} from "@/lib/data";
import { ChevronRight } from "lucide-react";
import { formatEstimateCurrency } from "../_components/estimate-currency";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import { LineItemOrScopeBodyPreview } from "@/app/estimates/_components/proposal-scope-preview";

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

  return (
    <>
      <div className="grid grid-cols-1 gap-8 border-b border-border/15 pb-8 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/50">
            Client
          </h3>
          <p className="text-sm font-medium text-foreground">{payload.clientName}</p>
          {payload.clientPhone ? (
            <p className="text-sm text-muted-foreground/70">{payload.clientPhone}</p>
          ) : null}
          {payload.clientEmail ? (
            <p className="text-sm text-muted-foreground/70">{payload.clientEmail}</p>
          ) : null}
          <p className="text-sm text-muted-foreground/70">{payload.clientAddress}</p>
        </div>
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/50">
            Project
          </h3>
          <p className="text-sm font-medium text-foreground">{payload.projectName}</p>
          <p className="text-sm text-muted-foreground/70">{payload.projectAddress}</p>
        </div>
      </div>

      <section className="border-b border-border/15 py-8">
        <h2 className="mb-6 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/50">
          Scope of work
        </h2>
        <div className="space-y-8">
          {costSections.map(({ categoryId, title, rows, sectionTotal }) => (
            <EstimateSectionReadOnly
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

      <div className="ml-auto max-w-sm pt-8">
        <div className="space-y-1">
          <SummaryRow label="Subtotal" value={subtotal} />
        </div>
        <div className="mt-6 border-t border-border/15 pt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/45">
            Total
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatEstimateCurrency(subtotal)}
          </p>
        </div>
      </div>
    </>
  );
}

function EstimateSectionReadOnly({
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
  const headerLabel = (title.trim() || cc?.name || "Section").trim();

  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border/10 py-2.5 hover:bg-transparent [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-open:rotate-90" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            {headerLabel}
          </span>
        </div>
        <span className="text-xs font-normal tabular-nums text-muted-foreground/45">
          {formatEstimateCurrency(sectionSubtotal)}
        </span>
      </summary>
      <div className="overflow-x-auto pt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/10 text-[10px] font-normal text-muted-foreground/45">
              <th className="pb-2 pr-4 text-left font-normal">Description</th>
              <th className="w-16 pb-2 pr-2 text-right font-normal tabular-nums">Qty</th>
              <th className="w-14 pb-2 pr-2 text-left font-normal">Unit</th>
              <th className="w-28 pb-2 pr-2 text-right font-normal tabular-nums">Unit price</th>
              <th className="w-28 pb-2 text-right font-normal tabular-nums">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
              return (
                <tr key={row.id} className="border-b border-border/[0.07] last:border-0">
                  <td className="py-2.5 pr-4 align-top">
                    <p className="font-medium text-foreground">{itemTitle || row.desc}</p>
                    {body.trim() ? (
                      <div className="mt-0.5 text-xs text-muted-foreground/60">
                        <LineItemOrScopeBodyPreview body={body} variant="compact" maxBullets={4} />
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground/80">
                    {row.qty}
                  </td>
                  <td className="py-2.5 pr-2 text-muted-foreground/70">{row.unit}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground/80">
                    {formatEstimateCurrency(row.unitCost)}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-foreground">
                    {formatEstimateCurrency(estimateLineTotal(row))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-muted-foreground/50">{label}</span>
      <span className="tabular-nums text-muted-foreground/70">{formatEstimateCurrency(value)}</span>
    </div>
  );
}
