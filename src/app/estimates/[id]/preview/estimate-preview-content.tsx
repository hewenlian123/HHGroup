import Link from "next/link";
import { estimateLineTotal, paymentMilestoneAmount, type EstimateItemRow, type EstimateSummaryResult, type PaymentScheduleItem } from "@/lib/data";
import type { EstimateMetaRecord } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type EstimatePreviewProps = {
  estimateId: string;
  estimate: { number: string; status: string; updatedAt: string };
  meta: EstimateMetaRecord | null;
  categories: { costCode: string; displayName: string }[];
  itemsByCode: Record<string, EstimateItemRow[]>;
  paymentSchedule: PaymentScheduleItem[];
  summary: EstimateSummaryResult | null;
};

export function EstimatePreviewContent({
  estimateId,
  estimate,
  meta,
  categories,
  itemsByCode,
  paymentSchedule,
  summary,
}: EstimatePreviewProps) {
  const estimateTotal = summary?.grandTotal ?? 0;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-[8.5in] px-6 py-8">
      {/* Back / Print controls - hidden when printing */}
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" className="rounded-lg" asChild>
          <Link href={`/estimates/${estimateId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to estimate
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg" asChild>
          <a href={`/estimates/${estimateId}/print`} target="_blank" rel="noopener noreferrer">
            Print
          </a>
        </Button>
        <span className="text-xs text-muted-foreground">Use your browser&apos;s Print or Save as PDF from the print view.</span>
      </div>

      <article className="min-h-screen bg-white text-zinc-900 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden print:shadow-none print:rounded-none">
        <div className="px-8 py-8 print:px-6 print:py-6">

          {/* A. Company header */}
          <header className="border-b border-zinc-200 pb-6 mb-6">
            <div className="flex justify-between items-start gap-6">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-zinc-900 tracking-tight">HH Group</p>
                <p className="text-sm text-zinc-500 mt-0.5">Construction Proposal</p>
                <p className="text-xs text-zinc-400 mt-2">
                  Prepared for {meta?.client.name || "Client"} • {meta?.project.name || "Project"}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="font-medium text-zinc-900">Estimate {estimate.number}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Date: {meta?.estimateDate ?? estimate.updatedAt}</p>
                <p className="text-xs text-zinc-500">Valid until: {meta?.validUntil ?? "—"}</p>
              </div>
            </div>
          </header>

          {/* B. Client / Project / Estimate Info */}
          {meta && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Client & Estimate</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Client / Customer</p>
                  <p className="font-medium text-zinc-900">{meta.client.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Project</p>
                  <p className="font-medium text-zinc-900">{meta.project.name || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-zinc-500 mb-1">Address</p>
                  <p className="text-zinc-700">{meta.client.address || meta.project.siteAddress || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Estimate Date</p>
                  <p className="text-zinc-900">{meta.estimateDate ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Valid Until</p>
                  <p className="text-zinc-900">{meta.validUntil ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Sales Person</p>
                  <p className="text-zinc-900">{meta.salesPerson ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Status</p>
                  <p className="text-zinc-900">{estimate.status === "Converted" ? "Converted to Project" : estimate.status}</p>
                </div>
              </div>
            </section>
          )}

          {/* C. Cost Breakdown */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Cost Breakdown</h2>
            {categories.length === 0 && Object.keys(itemsByCode).length === 0 ? (
              <p className="text-sm text-zinc-500 py-6">No line items.</p>
            ) : (
              <>
                {categories.map((cat) => {
                  const rows = itemsByCode[cat.costCode] ?? [];
                  if (rows.length === 0) return null;
                  const sectionTotal = rows.reduce((s, r) => s + estimateLineTotal(r), 0);
                  return (
                    <div key={cat.costCode} className="mb-8">
                      <p className="text-sm font-semibold text-zinc-900 mb-3">
                        {cat.displayName || cat.costCode}
                      </p>
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-600">
                            <th className="text-left py-2 pr-4 font-medium">Title</th>
                            <th className="text-right py-2 px-2 font-medium tabular-nums">Qty</th>
                            <th className="text-left py-2 px-2 font-medium">Unit</th>
                            <th className="text-right py-2 px-2 font-medium tabular-nums">Unit Price</th>
                            <th className="text-left py-2 px-2 font-medium">Cost Code</th>
                            <th className="text-right py-2 pl-4 font-medium tabular-nums">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} className="border-b border-zinc-100">
                              <td className="py-3 pr-4">
                                {(() => {
                                  const [title, ...rest] = (row.desc ?? "").split("\n");
                                  const desc = rest.join("\n").trim();
                                  return (
                                    <>
                                      <p className="font-medium text-zinc-900">{title || row.desc}</p>
                                      {desc ? (
                                        <p className="mt-0.5 text-xs text-zinc-500 whitespace-pre-wrap">{desc}</p>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </td>
                              <td className="py-3 px-2 text-right tabular-nums text-zinc-900">{row.qty}</td>
                              <td className="py-3 px-2 text-zinc-700">{row.unit}</td>
                              <td className="py-3 px-2 text-right tabular-nums text-zinc-900">${fmt(row.unitCost)}</td>
                              <td className="py-3 px-2 text-zinc-600 text-xs">{row.costCode}</td>
                              <td className="py-3 pl-4 text-right tabular-nums font-medium text-zinc-900">
                                ${fmt(estimateLineTotal(row))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-right text-sm font-medium tabular-nums text-zinc-900 mt-2">
                        Section total: ${fmt(sectionTotal)}
                      </p>
                    </div>
                  );
                })}
                {/* Items whose cost code is not in categories */}
                {Object.entries(itemsByCode).filter(([code]) => !categories.some((c) => c.costCode === code)).map(([code, rows]) => {
                  const sectionTotal = rows.reduce((s, r) => s + estimateLineTotal(r), 0);
                  return (
                    <div key={code} className="mb-8">
                      <p className="text-sm font-semibold text-zinc-900 mb-3">{code}</p>
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-600">
                            <th className="text-left py-2 pr-4 font-medium">Title</th>
                            <th className="text-right py-2 px-2 font-medium tabular-nums">Qty</th>
                            <th className="text-left py-2 px-2 font-medium">Unit</th>
                            <th className="text-right py-2 px-2 font-medium tabular-nums">Unit Price</th>
                            <th className="text-left py-2 px-2 font-medium">Cost Code</th>
                            <th className="text-right py-2 pl-4 font-medium tabular-nums">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} className="border-b border-zinc-100">
                              <td className="py-3 pr-4">
                                {(() => {
                                  const [title, ...rest] = (row.desc ?? "").split("\n");
                                  const desc = rest.join("\n").trim();
                                  return (
                                    <>
                                      <p className="font-medium text-zinc-900">{title || row.desc}</p>
                                      {desc ? (
                                        <p className="mt-0.5 text-xs text-zinc-500 whitespace-pre-wrap">{desc}</p>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </td>
                              <td className="py-3 px-2 text-right tabular-nums text-zinc-900">{row.qty}</td>
                              <td className="py-3 px-2 text-zinc-700">{row.unit}</td>
                              <td className="py-3 px-2 text-right tabular-nums text-zinc-900">${fmt(row.unitCost)}</td>
                              <td className="py-3 px-2 text-zinc-600 text-xs">{row.costCode}</td>
                              <td className="py-3 pl-4 text-right tabular-nums font-medium text-zinc-900">
                                ${fmt(estimateLineTotal(row))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-right text-sm font-medium tabular-nums text-zinc-900 mt-2">
                        Section total: ${fmt(sectionTotal)}
                      </p>
                    </div>
                  );
                })}
              </>
            )}
          </section>

          {/* D. Payment Schedule */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Payment Schedule</h2>
            {paymentSchedule.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4">No payment milestones.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="text-left py-2 pr-4 font-medium">Payment Name</th>
                    <th className="text-right py-2 px-2 font-medium tabular-nums">Amount</th>
                    <th className="text-left py-2 px-2 font-medium">Payment Terms</th>
                    <th className="text-left py-2 pl-4 font-medium">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentSchedule.map((item) => {
                    const amount = paymentMilestoneAmount(item, estimateTotal);
                    return (
                      <tr key={item.id} className="border-b border-zinc-100">
                        <td className="py-3 pr-4 font-medium text-zinc-900">{item.title}</td>
                        <td className="py-3 px-2 text-right tabular-nums font-medium text-zinc-900">${fmt(amount)}</td>
                        <td className="py-3 px-2 text-zinc-700">{item.dueRule || "—"}</td>
                        <td className="py-3 pl-4 text-zinc-700 tabular-nums">{item.dueDate ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* E. Summary */}
          {summary && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Totals</h2>
              <div className="max-w-sm ml-auto border border-zinc-200 rounded-lg p-5 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Subtotal</span>
                  <span className="tabular-nums text-zinc-900 font-medium">${fmt(summary.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Tax</span>
                  <span className="tabular-nums text-zinc-900">${fmt(summary.tax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Discount</span>
                  <span className="tabular-nums text-zinc-900">-${fmt(summary.discount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Markup</span>
                  <span className="tabular-nums text-zinc-900">${fmt(summary.markup)}</span>
                </div>
                <div className="flex justify-between pt-3 mt-2 border-t border-zinc-300 font-semibold text-zinc-900">
                  <span>Total</span>
                  <span className="tabular-nums">${fmt(summary.grandTotal)}</span>
                </div>
              </div>
            </section>
          )}

          {/* F. Notes */}
          {meta?.notes && meta.notes.trim() !== "" && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Notes</h2>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-700 whitespace-pre-wrap">
                {meta.notes}
              </div>
            </section>
          )}

          <footer className="text-xs text-zinc-400 border-t border-zinc-100 pt-6 mt-8">
            Estimate preview — HH Group
          </footer>
        </div>
      </article>
    </div>
  );
}
