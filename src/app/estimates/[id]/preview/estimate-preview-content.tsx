import {
  groupEstimateItemsByCategoryId,
  paymentMilestoneAmount,
  type EstimateItemRow,
  type EstimateMetaRecord,
  type PaymentScheduleItem,
} from "@/lib/estimates-db";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import {
  LineItemOrScopeBodyPreview,
  ProposalScopePreview,
} from "@/app/estimates/_components/proposal-scope-preview";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { cn } from "@/lib/utils";
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

type EstimatePreviewProps = {
  company: DocumentCompanyProfileDTO;
  estimate: { number: string; status: string; updatedAt: string };
  meta: EstimateMetaRecord | null;
  categories: { costCode: string; displayName: string; orderIndex?: number }[];
  items: EstimateItemRow[];
  /** Master catalog names for codes not in estimate_categories (optional). */
  catalogNameByCode?: Record<string, string>;
  paymentSchedule: PaymentScheduleItem[];
  /** Matches getEstimateSummary shape; kept local to avoid importing the full @/lib/data barrel in this RSC. */
  summary: {
    subtotal: number;
    tax: number;
    discount: number;
    grandTotal: number;
  } | null;
};

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

function ClientEstimateField({
  label,
  children,
  valueMode = "break-words",
}: {
  label: string;
  children: ReactNode;
  valueMode?: "break-all" | "break-words";
}) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_1fr] gap-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <div
        className={cn(
          "min-w-0 text-sm font-medium text-zinc-900",
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
        <tr className="border-y border-zinc-300 bg-zinc-50/70 text-[11px] uppercase tracking-wide text-zinc-500">
          <th className="py-2.5 pr-3 text-left font-semibold">Description</th>
          <th className="w-14 px-2 py-2.5 text-right font-semibold tabular-nums">Qty</th>
          <th className="w-16 px-2 py-2.5 text-left font-semibold">Unit</th>
          <th className="w-28 px-2 py-2.5 text-right font-semibold tabular-nums">Unit Price</th>
          <th className="w-28 py-2.5 pl-3 text-right font-semibold tabular-nums">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
          return (
            <tr key={row.id} className="break-inside-avoid border-b border-zinc-100">
              <td className="py-3 pr-3 align-top">
                <p className="font-medium text-zinc-900">{itemTitle || row.desc}</p>
                {row.status && row.status !== DEFAULT_LINE_ITEM_STATUS ? (
                  <span className="mt-1.5 inline-flex rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                    {LINE_ITEM_STATUS_LABELS[row.status] ?? row.status}
                  </span>
                ) : null}
                {body.trim() ? (
                  <div className="mt-1.5 text-sm text-zinc-600">
                    <LineItemOrScopeBodyPreview body={body} variant="default" />
                  </div>
                ) : null}
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-zinc-900">{row.qty}</td>
              <td className="px-2 py-3 text-zinc-800">{row.unit}</td>
              <td className="px-2 py-3 text-right tabular-nums text-zinc-900">
                {formatPdfLineUnitPrice(row, (n) => `$${fmt(n)}`)}
              </td>
              <td className="py-3 pl-3 text-right tabular-nums font-medium text-zinc-900">
                {formatPdfLineTotal(row, (n) => `$${fmt(n)}`)}
              </td>
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
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const estimateDateStr =
    meta?.estimateDate ?? (estimate.updatedAt ? estimate.updatedAt.slice(0, 10) : "—");
  const statusLabel = estimate.status === "Converted" ? "Converted to Project" : estimate.status;

  const costSections = groupEstimateItemsByCategoryId(items, categories, catalogNameByCode);
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
      className="bg-[#fffdf8] text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 print:bg-white print:shadow-none print:ring-0"
    >
      <div className="px-8 py-8 print:px-0 print:py-4">
        <DocumentCompanyHeader
          company={company}
          documentTitle="Estimate"
          documentNo={estimate.number}
          documentDate={estimateDateStr}
          documentNoLabel="Estimate No"
          className="border-zinc-900/80 pb-5"
          extraRight={
            <>
              <span className="inline-block rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                {statusLabel}
              </span>
              {meta?.validUntil ? (
                <p className="text-xs text-zinc-500 tabular-nums">Valid until: {meta.validUntil}</p>
              ) : null}
            </>
          }
        />

        {/* Client / Project — formal proposal blocks */}
        {meta && (
          <section className="print:break-inside-avoid">
            <div className="grid gap-6 sm:grid-cols-3">
              <DocumentInfoBlock title="Bill To">
                <p className="font-semibold text-zinc-950">{clientName ?? "—"}</p>
                {clientPhone ? <p className="tabular-nums text-zinc-700">{clientPhone}</p> : null}
                {clientEmail ? <p className="break-all text-zinc-700">{clientEmail}</p> : null}
                {clientAddress ? (
                  <p className="break-words text-zinc-700">{clientAddress}</p>
                ) : null}
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

        <div className="my-7 border-b border-zinc-300" />

        {/* Scope sections */}
        <section className="print:break-inside-auto">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Scope of work
          </h2>
          {costSections.length === 0 ? (
            <p className="text-sm text-zinc-500 py-2">No line items.</p>
          ) : (
            <>
              {costSections.map(({ categoryId, title, rows, sectionTotal }) => (
                <div key={categoryId} className="mb-7 break-inside-avoid last:mb-0">
                  <div className="mb-2 flex items-end justify-between gap-4">
                    <p className="text-[15px] font-semibold text-zinc-950">{title}</p>
                    <p className="text-xs tabular-nums text-zinc-500">
                      Section total:{" "}
                      <span className="font-semibold text-zinc-900">${fmt(sectionTotal)}</span>
                    </p>
                  </div>
                  <LineItemsTable rows={rows} fmt={fmt} />
                </div>
              ))}
            </>
          )}
        </section>

        {meta?.documentNotes.length ? (
          <>
            <div className="my-7 border-b border-zinc-300" />
            <EstimateNotesPreview notes={meta.documentNotes} className="mb-6" />
          </>
        ) : null}

        {/* Payment schedule */}
        {paymentSchedule.length > 0 ? (
          <>
            <div className="my-7 border-b border-zinc-300" />
            <section className="mb-7 print:break-inside-avoid">
              <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
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
                            variant="default"
                            maxBullets={3}
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
          </>
        ) : null}

        {/* Totals — invoice style, no card */}
        {summary && (
          <section className="border-t border-zinc-900 pt-5 print:break-inside-avoid">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
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
              <div className="mt-3 flex justify-between gap-6 border-t border-zinc-300 pt-3 text-base font-semibold text-zinc-950">
                <span>Grand Total</span>
                <span className="tabular-nums">${fmt(summary.grandTotal)}</span>
              </div>
            </div>
          </section>
        )}

        {company.defaultTerms ? (
          <>
            <div className="my-7 border-b border-zinc-300" />
            <section className="print:break-inside-avoid">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Terms
              </h2>
              <p className="whitespace-pre-wrap break-words border-b border-zinc-200 pb-3 text-sm leading-relaxed text-zinc-800">
                {company.defaultTerms}
              </p>
            </section>
          </>
        ) : null}

        <div className="my-7 border-t border-zinc-300" />

        <section
          className="mt-16 text-left print:break-inside-avoid w-full"
          aria-label="Signatures"
        >
          <h2 className="mb-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Signature
          </h2>
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

        <footer className="mt-10 whitespace-pre-wrap border-t border-zinc-200 pt-3 text-[11px] text-zinc-400">
          {company.invoiceFooter || `${company.companyName} · Estimate ${estimate.number}`}
        </footer>
      </div>
    </article>
  );
}
