import {
  lineTotal,
  groupEstimateItemsByCategoryId,
  paymentMilestoneAmount,
  type EstimateItemRow,
  type EstimateMetaRecord,
  type PaymentScheduleItem,
} from "@/lib/estimates-db";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import { LineItemDescriptionBodyPreview } from "@/app/estimates/_components/line-item-description-body-preview";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type EstimatePreviewProps = {
  company: DocumentCompanyProfileDTO;
  estimate: { number: string; status: string; updatedAt: string };
  meta: EstimateMetaRecord | null;
  categories: { costCode: string; displayName: string }[];
  items: EstimateItemRow[];
  /** Master catalog names for codes not in estimate_categories (optional). */
  catalogNameByCode?: Record<string, string>;
  paymentSchedule: PaymentScheduleItem[];
  /** Matches getEstimateSummary shape; kept local to avoid importing the full @/lib/data barrel in this RSC. */
  summary: {
    subtotal: number;
    tax: number;
    discount: number;
    markup: number;
    grandTotal: number;
  } | null;
};

/** Responsive key/value row: flexible label + value, no fixed widths. */
function ClientEstimateField({
  label,
  children,
  valueMode = "truncate",
}: {
  label: string;
  children: ReactNode;
  /** truncate: single-line ellipsis; break-all: email; break-words: long address */
  valueMode?: "truncate" | "break-all" | "break-words";
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs uppercase whitespace-nowrap text-muted-foreground">{label}</span>
      <div
        className={cn(
          "min-w-0 flex-1 text-sm font-medium text-zinc-900",
          valueMode === "truncate" && "truncate",
          valueMode === "break-all" && "break-all",
          valueMode === "break-words" && "break-words"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function LineItemsTable({ rows, fmt }: { rows: EstimateItemRow[]; fmt: (n: number) => string }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-zinc-300 text-zinc-700">
          <th className="pb-2 pr-3 text-left font-medium">Item</th>
          <th className="w-14 pb-2 px-2 text-right font-medium tabular-nums">Qty</th>
          <th className="w-16 pb-2 px-2 text-left font-medium">Unit</th>
          <th className="w-28 pb-2 px-2 text-right font-medium tabular-nums">Unit Price</th>
          <th className="w-28 pb-2 pl-3 text-right font-medium tabular-nums">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
          return (
            <tr key={row.id} className="border-b border-zinc-200">
              <td className="py-2 pr-3 align-top">
                <p className="font-medium text-zinc-900">{itemTitle || row.desc}</p>
                {body.trim() ? (
                  <div className="mt-0.5 text-xs text-zinc-600">
                    <LineItemDescriptionBodyPreview body={body} />
                  </div>
                ) : null}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-900">{row.qty}</td>
              <td className="py-2 px-2 text-zinc-800">{row.unit}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-900">${fmt(row.unitCost)}</td>
              <td className="py-2 pl-3 text-right tabular-nums font-medium text-zinc-900">${fmt(lineTotal(row))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EstimatePreviewContent({
  company,
  estimate,
  meta,
  categories,
  items,
  catalogNameByCode,
  paymentSchedule,
  summary,
}: EstimatePreviewProps) {
  const estimateTotal = summary?.grandTotal ?? 0;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const estimateDateStr = meta?.estimateDate ?? (estimate.updatedAt ? estimate.updatedAt.slice(0, 10) : "—");
  const statusLabel = estimate.status === "Converted" ? "Converted to Project" : estimate.status;

  const costSections = groupEstimateItemsByCategoryId(items, categories, catalogNameByCode);

  return (
      <article className="bg-white text-zinc-900 print:shadow-none">
        <div className="px-4 py-5 print:px-0 print:py-4">
          <DocumentCompanyHeader
            company={company}
            documentTitle="Estimate"
            documentNo={estimate.number}
            documentDate={estimateDateStr}
            documentNoLabel="Estimate No"
            extraRight={
              <>
                <span className="inline-block rounded-sm border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-800">
                  {statusLabel}
                </span>
                {meta?.validUntil ? (
                  <p className="text-xs text-zinc-500 tabular-nums">Valid until: {meta.validUntil}</p>
                ) : null}
              </>
            }
          />

          {/* Client & estimate — compact invoice-style grid */}
          {meta && (
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Client &amp; estimate</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <ClientEstimateField label="Client">{meta.client.name || "—"}</ClientEstimateField>
                <ClientEstimateField label="Project">{meta.project.name || "—"}</ClientEstimateField>
                <div className="col-span-2">
                  <ClientEstimateField label="Address" valueMode="break-words">
                    {meta.client.address || meta.project.siteAddress || "—"}
                  </ClientEstimateField>
                </div>
                <ClientEstimateField label="Phone">
                  <span className="tabular-nums">{meta.client.phone?.trim() || "—"}</span>
                </ClientEstimateField>
                <ClientEstimateField label="Email" valueMode="break-all">
                  {meta.client.email?.trim() || "—"}
                </ClientEstimateField>
                <ClientEstimateField label="Status">{statusLabel}</ClientEstimateField>
              </div>
            </section>
          )}

          <div className="border-b border-zinc-300 my-4" />

          {/* Cost breakdown */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-3">Cost breakdown</h2>
            {costSections.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">No line items.</p>
            ) : (
              <>
                {costSections.map(({ categoryId, title, rows, sectionTotal }) => (
                  <div key={categoryId} className="mb-5 last:mb-0">
                    <p className="text-sm font-semibold text-zinc-900 mb-2">{title}</p>
                    <LineItemsTable rows={rows} fmt={fmt} />
                    <p className="text-right font-medium tabular-nums text-zinc-900 mt-2">Section total: ${fmt(sectionTotal)}</p>
                  </div>
                ))}
              </>
            )}
          </section>

          {/* Payment schedule */}
          <div className="border-b border-zinc-300 my-4" />
          <section className="mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-3">Payment schedule</h2>
            {paymentSchedule.length === 0 ? (
              <p className="text-sm text-zinc-500 py-1">No payment milestones.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-300 text-zinc-700">
                    <th className="pb-2 pr-3 text-left font-medium">Payment</th>
                    <th className="w-28 pb-2 px-2 text-right font-medium tabular-nums">Amount</th>
                    <th className="pb-2 px-2 text-left font-medium">Terms</th>
                    <th className="w-28 pb-2 pl-3 text-left font-medium tabular-nums">Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentSchedule.map((item) => {
                    const amount = paymentMilestoneAmount(item, estimateTotal);
                    return (
                      <tr key={item.id} className="border-b border-zinc-200">
                        <td className="py-2 pr-3 font-medium text-zinc-900">{item.title}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-zinc-900">${fmt(amount)}</td>
                        <td className="py-2 px-2 text-zinc-700">{item.dueRule || "—"}</td>
                        <td className="py-2 pl-3 text-zinc-700 tabular-nums">{item.dueDate ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* Totals — invoice style, no card */}
          {summary && (
            <section className="border-t border-zinc-300 pt-4">
              <div className="ml-auto max-w-xs text-sm space-y-1.5">
                <div className="flex justify-between gap-6">
                  <span className="text-zinc-600">Subtotal</span>
                  <span className="tabular-nums text-zinc-900">${fmt(summary.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-zinc-600">Tax</span>
                  <span className="tabular-nums text-zinc-900">${fmt(summary.tax)}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-zinc-600">Discount</span>
                  <span className="tabular-nums text-zinc-900">−${fmt(summary.discount)}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-zinc-600">Markup</span>
                  <span className="tabular-nums text-zinc-900">${fmt(summary.markup)}</span>
                </div>
              </div>
              <p className="text-right text-lg font-semibold tabular-nums text-zinc-900 mt-6">
                Total: ${fmt(summary.grandTotal)}
              </p>
            </section>
          )}

          {meta?.notes && meta.notes.trim() !== "" && (
            <>
              <div className="border-b border-zinc-300 my-4" />
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Notes</h2>
                <p className="text-sm text-zinc-800 whitespace-pre-wrap border-b border-zinc-200 pb-3">{meta.notes}</p>
              </section>
            </>
          )}

          <div className="border-t border-zinc-300 my-4" />

          <section
            className="mt-16 text-left print:break-inside-avoid w-full"
            aria-label="Signatures"
          >
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-6">Signature</h2>
            <div className="grid grid-cols-2 gap-12">
              <div className="min-w-0 flex flex-col gap-2">
                <div className="w-full border-b-2 border-zinc-900 min-h-[2.75rem]" aria-hidden />
                <p className="text-sm font-medium text-zinc-900">Client Signature</p>
                <div className="mt-5 w-full border-b border-zinc-900 min-h-[1.35rem]" aria-hidden />
                <p className="text-xs text-zinc-500">Date</p>
              </div>
              <div className="min-w-0 flex flex-col gap-2">
                <div className="w-full border-b-2 border-zinc-900 min-h-[2.75rem]" aria-hidden />
                <p className="text-sm font-medium text-zinc-900">Company Signature</p>
                <div className="mt-5 w-full border-b border-zinc-900 min-h-[1.35rem]" aria-hidden />
                <p className="text-xs text-zinc-500">Date</p>
              </div>
            </div>
          </section>

          <footer className="text-[11px] text-zinc-400 border-t border-zinc-200 pt-3 mt-10">
            {company.companyName} · Estimate {estimate.number}
          </footer>
        </div>
      </article>
  );
}
