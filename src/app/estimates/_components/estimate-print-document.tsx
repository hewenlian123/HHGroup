import {
  estimateLineTotal,
  groupEstimateItemsByCategoryId,
  paymentMilestoneAmount,
  type EstimateItemRow,
  type EstimateSummaryResult,
  type PaymentScheduleItem,
} from "@/lib/data";
import type { EstimateMetaRecord } from "@/lib/data";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import { LineItemDescriptionBodyPreview } from "@/app/estimates/_components/line-item-description-body-preview";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";

export type EstimatePrintDocumentProps = {
  company: DocumentCompanyProfileDTO;
  estimate: { number: string; status: string; updatedAt: string };
  meta: EstimateMetaRecord | null;
  categories: { costCode: string; displayName: string }[];
  items: EstimateItemRow[];
  catalogNameByCode?: Record<string, string>;
  paymentSchedule: PaymentScheduleItem[];
  summary: EstimateSummaryResult | null;
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Read-only, print-optimized estimate document. No navigation or buttons. */
export function EstimatePrintDocument({
  company,
  estimate,
  meta,
  categories,
  items,
  catalogNameByCode,
  paymentSchedule,
  summary,
}: EstimatePrintDocumentProps) {
  const estimateTotal = summary?.grandTotal ?? 0;
  const costSections = groupEstimateItemsByCategoryId(items, categories, catalogNameByCode);
  const estimateDateStr =
    meta?.estimateDate ?? (estimate.updatedAt ? estimate.updatedAt.slice(0, 10) : "—");
  const statusLabel = estimate.status === "Converted" ? "Converted to Project" : estimate.status;

  return (
    <article className="bg-white text-zinc-900 mx-auto max-w-[8.5in] px-6 py-6 print:px-0 print:py-0 print:max-w-none">
      <DocumentCompanyHeader
        company={company}
        documentTitle="Estimate"
        documentNo={estimate.number}
        documentDate={estimateDateStr}
        documentNoLabel="Estimate No"
        extraRight={
          <>
            <span className="inline-block rounded-sm border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-800 print:border-zinc-400">
              {statusLabel}
            </span>
            {meta?.validUntil ? (
              <p className="text-xs text-zinc-500 tabular-nums">Valid until: {meta.validUntil}</p>
            ) : null}
          </>
        }
      />

      {/* Client / Project / Dates / Status */}
      {meta && (
        <section className="mb-8 print:break-inside-avoid">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Client & Project
          </h2>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Client / Customer</p>
              <p className="font-medium text-zinc-900">{meta.client.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Project</p>
              <p className="font-medium text-zinc-900">{meta.project.name || "—"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-medium text-zinc-500 mb-1">Address</p>
              <p className="text-zinc-700">
                {meta.client.address || meta.project.siteAddress || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Estimate Date</p>
              <p className="text-zinc-900">{meta.estimateDate ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Valid Until</p>
              <p className="text-zinc-900">{meta.validUntil ?? "—"}</p>
            </div>
          </div>
        </section>
      )}

      {/* Cost breakdown by category */}
      <section className="mb-8 print:break-inside-avoid">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
          Cost Breakdown
        </h2>
        {costSections.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No line items.</p>
        ) : (
          <>
            {costSections.map(({ categoryId, title, rows, sectionTotal }) => (
              <div key={categoryId} className="mb-8 print:break-inside-avoid">
                <p className="text-sm font-semibold text-zinc-900 mb-3">{title}</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-600">
                      <th className="text-left py-2 pr-4 font-medium">Description</th>
                      <th className="text-right py-2 px-2 font-medium tabular-nums w-16">Qty</th>
                      <th className="text-left py-2 px-2 font-medium w-14">Unit</th>
                      <th className="text-right py-2 px-2 font-medium tabular-nums">Unit Price</th>
                      <th className="text-left py-2 px-2 font-medium text-zinc-600">Cost Code</th>
                      <th className="text-right py-2 pl-4 font-medium tabular-nums">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
                      return (
                        <tr key={row.id} className="border-b border-zinc-100">
                          <td className="py-2.5 pr-4">
                            <p className="font-medium text-zinc-900">{itemTitle || row.desc}</p>
                            {body.trim() ? (
                              <div className="mt-1 text-xs text-zinc-600">
                                <LineItemDescriptionBodyPreview body={body} />
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-zinc-900">
                            {row.qty}
                          </td>
                          <td className="py-2.5 px-2 text-zinc-700">{row.unit}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-zinc-900">
                            ${fmt(row.unitCost)}
                          </td>
                          <td className="py-2.5 px-2 text-zinc-600 text-xs">{row.costCode}</td>
                          <td className="py-2.5 pl-4 text-right tabular-nums font-medium text-zinc-900">
                            ${fmt(estimateLineTotal(row))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-right text-sm font-medium tabular-nums text-zinc-900 mt-2">
                  Section total: ${fmt(sectionTotal)}
                </p>
              </div>
            ))}
          </>
        )}
      </section>

      {/* Payment schedule */}
      <section className="mb-8 print:break-inside-avoid">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
          Payment Schedule
        </h2>
        {paymentSchedule.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No payment milestones.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600">
                <th className="text-left py-2 pr-4 font-medium">Title</th>
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-right py-2 px-2 font-medium tabular-nums">Value</th>
                <th className="text-right py-2 px-2 font-medium tabular-nums">Amount</th>
                <th className="text-left py-2 pl-4 font-medium">Due Rule</th>
              </tr>
            </thead>
            <tbody>
              {paymentSchedule.map((item) => {
                const amount = paymentMilestoneAmount(item, estimateTotal);
                return (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="py-2.5 pr-4 font-medium text-zinc-900">{item.title}</td>
                    <td className="py-2.5 px-2 text-zinc-600 capitalize">{item.amountType}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-zinc-900">
                      {item.amountType === "percent" ? `${item.value}%` : `$${fmt(item.value)}`}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-medium text-zinc-900">
                      ${fmt(amount)}
                    </td>
                    <td className="py-2.5 pl-4 text-zinc-700">{item.dueRule || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Summary totals */}
      {summary && (
        <section className="mb-8 print:break-inside-avoid">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Summary
          </h2>
          <div className="max-w-xs ml-auto border border-zinc-200 rounded-lg p-5 text-sm space-y-2">
            <div className="flex justify-between text-zinc-600">
              <span>Material Cost</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.materialCost)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Labor Cost</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.laborCost)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Subcontractor Cost</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.subcontractorCost)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-zinc-200 font-medium">
              <span className="text-zinc-700">Subtotal</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Tax</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.tax)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Discount</span>
              <span className="tabular-nums text-zinc-900">-${fmt(summary.discount)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Markup</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.markup)}</span>
            </div>
            <div className="flex justify-between pt-3 mt-2 border-t-2 border-zinc-300 font-semibold text-zinc-900">
              <span>Total</span>
              <span className="tabular-nums">${fmt(summary.grandTotal)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Notes */}
      {meta?.notes && meta.notes.trim() !== "" && (
        <section className="mb-8 print:break-inside-avoid">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Notes
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-700 whitespace-pre-wrap">
            {meta.notes}
          </div>
        </section>
      )}

      <footer className="text-xs text-zinc-400 border-t border-zinc-200 pt-6 mt-8 print:break-before-avoid">
        Estimate — {company.companyName}
      </footer>
    </article>
  );
}
