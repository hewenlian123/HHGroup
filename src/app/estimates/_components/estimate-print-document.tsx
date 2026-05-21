import {
  groupEstimateItemsByCategoryId,
  paymentMilestoneAmount,
  type EstimateItemRow,
  type EstimateSummaryResult,
  type PaymentScheduleItem,
} from "@/lib/data";
import type { EstimateMetaRecord } from "@/lib/data";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import {
  LineItemOrScopeBodyPreview,
  ProposalScopePreview,
} from "@/app/estimates/_components/proposal-scope-preview";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import {
  formatPdfLineTotal,
  formatPdfLineUnitPrice,
} from "@/app/estimates/_components/estimate-pdf-line-amounts";
import { EstimateNotesPreview } from "@/app/estimates/_components/estimate-notes-preview";
import {
  DEFAULT_LINE_ITEM_STATUS,
  LINE_ITEM_STATUS_LABELS,
} from "@/app/estimates/_components/estimate-line-item-status";
import type { ReactNode } from "react";

export type EstimatePrintDocumentProps = {
  company: DocumentCompanyProfileDTO;
  estimate: { number: string; status: string; updatedAt: string };
  meta: EstimateMetaRecord | null;
  categories: { costCode: string; displayName: string; orderIndex?: number }[];
  items: EstimateItemRow[];
  catalogNameByCode?: Record<string, string>;
  paymentSchedule: PaymentScheduleItem[];
  summary: EstimateSummaryResult | null;
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function DocumentInfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-zinc-200 pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {title}
      </h3>
      <div className="mt-2 space-y-1 text-sm leading-relaxed text-zinc-800">{children}</div>
    </div>
  );
}

function ClientEstimateField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_1fr] gap-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="min-w-0 break-words text-sm font-medium text-zinc-900">{children}</div>
    </div>
  );
}

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
  const clientName = cleanText(meta?.client.name);
  const clientPhone = cleanText(meta?.client.phone);
  const clientEmail = cleanText(meta?.client.email);
  const clientAddress = cleanText(meta?.client.address);
  const projectName = cleanText(meta?.project.name);
  const projectAddress = cleanText(meta?.project.siteAddress);
  const jobAddress = clientAddress ?? projectAddress;

  return (
    <article
      data-testid="estimate-document"
      className="mx-auto max-w-[8.5in] bg-white px-7 py-7 text-zinc-900 print:max-w-none print:px-0 print:py-0"
    >
      <DocumentCompanyHeader
        company={company}
        documentTitle="Estimate"
        documentNo={estimate.number}
        documentDate={estimateDateStr}
        documentNoLabel="Estimate No"
        className="border-zinc-900/80 pb-5"
        extraRight={
          <>
            <span className="inline-block rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 print:border-zinc-400">
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
          <div className="grid gap-6 sm:grid-cols-3">
            <DocumentInfoBlock title="Bill To">
              <p className="font-semibold text-zinc-950">{clientName ?? "—"}</p>
              {clientPhone ? <p className="tabular-nums text-zinc-700">{clientPhone}</p> : null}
              {clientEmail ? <p className="break-all text-zinc-700">{clientEmail}</p> : null}
              {clientAddress ? <p className="break-words text-zinc-700">{clientAddress}</p> : null}
            </DocumentInfoBlock>
            <DocumentInfoBlock title="Project / Job">
              <p className="font-semibold text-zinc-950">{projectName ?? "—"}</p>
              <ClientEstimateField label="Date">{estimateDateStr}</ClientEstimateField>
              <ClientEstimateField label="Valid">{meta.validUntil ?? "—"}</ClientEstimateField>
            </DocumentInfoBlock>
            <DocumentInfoBlock title="Job Address">
              <p className="break-words font-medium text-zinc-900">{jobAddress ?? "—"}</p>
              <ClientEstimateField label="Status">{statusLabel}</ClientEstimateField>
            </DocumentInfoBlock>
          </div>
        </section>
      )}

      {/* Scope sections */}
      <section className="mb-8 print:break-inside-auto">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Scope of work
        </h2>
        {costSections.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No line items.</p>
        ) : (
          <>
            {costSections.map(({ categoryId, title, rows, sectionTotal }) => (
              <div key={categoryId} className="mb-8 break-inside-avoid">
                <div className="mb-2 flex items-end justify-between gap-4">
                  <p className="text-[15px] font-semibold text-zinc-950">{title}</p>
                  <p className="text-xs tabular-nums text-zinc-500">
                    Section total:{" "}
                    <span className="font-semibold text-zinc-900">${fmt(sectionTotal)}</span>
                  </p>
                </div>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y border-zinc-300 bg-zinc-50/70 text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="py-2.5 pr-4 text-left font-semibold">Description</th>
                      <th className="w-16 px-2 py-2.5 text-right font-semibold tabular-nums">
                        Qty
                      </th>
                      <th className="w-14 px-2 py-2.5 text-left font-semibold">Unit</th>
                      <th className="px-2 py-2.5 text-right font-semibold tabular-nums">
                        Unit Price
                      </th>
                      <th className="py-2.5 pl-4 text-right font-semibold tabular-nums">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
                      return (
                        <tr key={row.id} className="break-inside-avoid border-b border-zinc-100">
                          <td className="py-3 pr-4 align-top">
                            <p className="font-medium text-zinc-900">{itemTitle || row.desc}</p>
                            {row.status && row.status !== DEFAULT_LINE_ITEM_STATUS ? (
                              <span className="mt-1.5 inline-flex rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                                {LINE_ITEM_STATUS_LABELS[row.status] ?? row.status}
                              </span>
                            ) : null}
                            {body.trim() ? (
                              <div className="mt-1.5 text-sm text-zinc-600">
                                <LineItemOrScopeBodyPreview body={body} variant="print" />
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums text-zinc-900">
                            {row.qty}
                          </td>
                          <td className="px-2 py-3 text-zinc-700">{row.unit}</td>
                          <td className="px-2 py-3 text-right tabular-nums text-zinc-900">
                            {formatPdfLineUnitPrice(row, (n) => `$${fmt(n)}`)}
                          </td>
                          <td className="py-3 pl-4 text-right tabular-nums font-medium text-zinc-900">
                            {formatPdfLineTotal(row, (n) => `$${fmt(n)}`)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}
      </section>

      {meta?.documentNotes.length ? (
        <EstimateNotesPreview notes={meta.documentNotes} variant="print" className="mb-8" />
      ) : null}

      {/* Payment schedule */}
      {paymentSchedule.length > 0 ? (
        <section className="mb-8 print:break-inside-avoid">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Payment Schedule
          </h2>
          <div className="divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
            {paymentSchedule.map((item) => {
              const amount = paymentMilestoneAmount(item, estimateTotal);
              return (
                <div key={item.id} className="break-inside-avoid py-3">
                  <div className="flex items-baseline justify-between gap-6">
                    <p className="font-semibold text-zinc-900">{item.title}</p>
                    <p className="shrink-0 tabular-nums font-semibold text-zinc-900">
                      ${fmt(amount)}
                    </p>
                  </div>
                  {item.description ? (
                    <div className="mt-1">
                      <ProposalScopePreview
                        text={item.description}
                        variant="print"
                        maxBullets={4}
                      />
                    </div>
                  ) : null}
                  {item.dueDate ? (
                    <p className="mt-1 text-xs tabular-nums text-zinc-500">
                      Due date: {item.dueDate}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Summary totals */}
      {summary && (
        <section className="mb-8 print:break-inside-avoid">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Summary
          </h2>
          <div className="ml-auto max-w-sm border-t border-zinc-900 pt-4 text-sm space-y-2">
            <div className="flex justify-between font-medium text-zinc-700">
              <span>Subtotal</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Tax</span>
              <span className="tabular-nums text-zinc-900">${fmt(summary.tax)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Discount</span>
              <span className="tabular-nums text-zinc-900">−${fmt(summary.discount)}</span>
            </div>
            <div className="mt-3 flex justify-between border-t border-zinc-300 pt-3 text-base font-semibold text-zinc-950">
              <span>Grand Total</span>
              <span className="tabular-nums">${fmt(summary.grandTotal)}</span>
            </div>
          </div>
        </section>
      )}

      {company.defaultTerms ? (
        <section className="mb-8 print:break-inside-avoid">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Terms
          </h2>
          <div className="whitespace-pre-wrap break-words border-y border-zinc-200 py-3 text-sm leading-relaxed text-zinc-700">
            {company.defaultTerms}
          </div>
        </section>
      ) : null}

      <section
        className="mb-8 mt-14 w-full text-left print:break-inside-avoid"
        aria-label="Signatures"
      >
        <h2 className="mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Signature
        </h2>
        <div className="grid grid-cols-2 gap-12">
          <div className="min-w-0">
            <div className="min-h-[2.75rem] border-b-2 border-zinc-900" aria-hidden />
            <p className="mt-2 text-sm font-medium text-zinc-900">Client Signature</p>
            <div className="mt-5 min-h-[1.35rem] border-b border-zinc-900" aria-hidden />
            <p className="mt-2 text-xs text-zinc-500">Date</p>
          </div>
          <div className="min-w-0">
            <div className="min-h-[2.75rem] border-b-2 border-zinc-900" aria-hidden />
            <p className="mt-2 text-sm font-medium text-zinc-900">Company Signature</p>
            <div className="mt-5 min-h-[1.35rem] border-b border-zinc-900" aria-hidden />
            <p className="mt-2 text-xs text-zinc-500">Date</p>
          </div>
        </div>
      </section>

      <footer className="text-xs text-zinc-400 border-t border-zinc-200 pt-6 mt-8 print:break-before-avoid whitespace-pre-wrap">
        {company.invoiceFooter || `Estimate — ${company.companyName}`}
      </footer>
    </article>
  );
}
