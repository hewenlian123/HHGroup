import {
  groupEstimateItemsByCategoryId,
  paymentMilestoneAmount,
  type EstimateItemRow,
  type EstimateMetaRecord,
  type PaymentScheduleItem,
} from "@/lib/estimates-db";
import { splitLineItemDesc } from "@/lib/sanitize-line-item-html";
import { LineItemOrScopeBodyPreview } from "@/app/estimates/_components/proposal-scope-preview";
import { parseProposalScopeLines } from "@/app/estimates/_components/proposal-scope-model";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import {
  formatPdfLineTotal,
  formatPdfLineUnitPrice,
} from "@/app/estimates/_components/estimate-pdf-line-amounts";
import { EstimateNotesPreview } from "@/app/estimates/_components/estimate-notes-preview";
import { formatEstimatePaymentDueDate } from "@/app/estimates/_components/estimate-payment-date";
import {
  DEFAULT_LINE_ITEM_STATUS,
  LINE_ITEM_STATUS_LABELS,
} from "@/app/estimates/_components/estimate-line-item-status";
import { EstimatePreviewSummaryPanel } from "@/app/estimates/_components/estimate-preview-summary-panel";

export type EstimatePreviewProps = {
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

function MinimalProposalHeader({
  company,
  estimateNumber,
  estimateDate,
  validUntil,
  statusLabel,
  projectName,
  clientName,
  location,
}: {
  company: DocumentCompanyProfileDTO;
  estimateNumber: string;
  estimateDate: string;
  validUntil: string | null | undefined;
  statusLabel: string;
  projectName: string | null;
  clientName: string | null;
  location: string | null;
}) {
  return (
    <header className="estimate-minimal-header mb-9 text-zinc-900 print:break-after-avoid">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div className="min-w-0 sm:max-w-[54%]">
          <div className="flex min-w-0 items-start gap-3">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- document/PDF-safe logo rendering
              <img
                src={company.logoUrl}
                alt=""
                width={38}
                height={38}
                className="h-9 w-9 shrink-0 object-contain"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-zinc-950">
                {company.companyName}
              </p>
              <div className="mt-2 space-y-0.5 text-[11.5px] leading-snug text-zinc-600">
                {company.addressLines.map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {company.phone ? <span className="tabular-nums">{company.phone}</span> : null}
                  {company.email ? <span className="break-all">{company.email}</span> : null}
                  {company.website ? <span className="break-all">{company.website}</span> : null}
                </div>
                {company.licenseNumber ? <p>License: {company.licenseNumber}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-[24px] font-semibold leading-none tracking-[-0.04em] text-zinc-950">
            Project Proposal
          </p>
          <div className="mt-4 space-y-1.5 text-[12px] leading-tight">
            <p className="tabular-nums">
              <span className="text-zinc-500">No.</span>{" "}
              <span className="font-semibold text-zinc-950">{estimateNumber}</span>
            </p>
            <p className="tabular-nums">
              <span className="text-zinc-500">Date</span>{" "}
              <span className="font-medium text-zinc-900">{estimateDate}</span>
            </p>
            {validUntil ? (
              <p className="tabular-nums">
                <span className="text-zinc-500">Valid until</span>{" "}
                <span className="font-medium text-zinc-900">{validUntil}</span>
              </p>
            ) : null}
          </div>
          <span className="mt-3 inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.04em] text-zinc-600">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="mt-10 max-w-[34rem]">
        <p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-zinc-500">
          Luxury Design-Build Proposal
        </p>
        <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.045em] text-zinc-950">
          {projectName ?? "Project Proposal"}
        </h1>
      </div>

      <div className="mt-7 grid gap-x-9 gap-y-3 border-y border-zinc-200/55 py-3 sm:grid-cols-4">
        <ProposalFact label="Prepared for">{clientName ?? "—"}</ProposalFact>
        <ProposalFact label="Project">{projectName ?? "—"}</ProposalFact>
        <ProposalFact label="Location">{location ?? "—"}</ProposalFact>
        <ProposalFact label="Date">{estimateDate}</ProposalFact>
      </div>
    </header>
  );
}

function ProposalFact({ label, children }: { label: string; children: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-[0.06em] text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-[12.5px] font-medium leading-snug text-zinc-900">
        {children}
      </p>
    </div>
  );
}

function ScopeLineItems({ rows, fmt }: { rows: EstimateItemRow[]; fmt: (n: number) => string }) {
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
        const unitPrice = formatPdfLineUnitPrice(row, (n) => `$${fmt(n)}`);
        const lineTotal = formatPdfLineTotal(row, (n) => `$${fmt(n)}`);
        return (
          <article
            key={row.id}
            data-testid="estimate-line-item-output"
            className="break-inside-avoid"
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9.25rem] sm:gap-8">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-zinc-950">
                    {itemTitle || row.desc}
                  </h4>
                  {row.status && row.status !== DEFAULT_LINE_ITEM_STATUS ? (
                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium tracking-[0.05em] text-zinc-600">
                      {LINE_ITEM_STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  ) : null}
                </div>
                {body.trim() ? (
                  <div className="mt-2 max-w-[34rem] text-[13px] leading-[1.62] text-zinc-600">
                    <LineItemOrScopeBodyPreview body={body} variant="default" />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 text-left sm:text-right">
                <p
                  data-testid="estimate-line-item-total"
                  className="tabular-nums text-[15px] font-semibold leading-none text-zinc-950"
                >
                  {lineTotal}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  <span className="tabular-nums">Qty {row.qty}</span>
                  {row.unit ? <span> · {row.unit}</span> : null}
                </p>
                <p
                  data-testid="estimate-line-item-unit-price"
                  className="text-[11px] leading-relaxed text-zinc-500"
                >
                  Unit {unitPrice}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PaymentMilestoneDescription({ text }: { text: string | null | undefined }) {
  const rows = parseProposalScopeLines(text);
  if (rows.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-0.5 text-[13px] leading-[1.58] text-zinc-600">
      {rows.map((row, index) => (
        <p
          key={`${row.text}-${index}`}
          className="whitespace-pre-wrap break-words"
          style={{ marginLeft: row.indent ? `${row.indent * 0.75}rem` : undefined }}
        >
          {row.text}
        </p>
      ))}
    </div>
  );
}

function PaymentMilestoneRow({
  item,
  amount,
  index,
  fmt,
}: {
  item: PaymentScheduleItem;
  amount: number;
  index: number;
  fmt: (n: number) => string;
}) {
  return (
    <article className="estimate-payment-row relative py-2">
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-4">
        <p className="pt-0.5 text-[12px] font-semibold tabular-nums tracking-[-0.01em] text-zinc-400">
          {String(index + 1).padStart(2, "0")}
        </p>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-zinc-950">
            {item.title}
          </p>
          {item.description ? <PaymentMilestoneDescription text={item.description} /> : null}
          {formatEstimatePaymentDueDate(item.dueDate) ? (
            <p className="mt-1.5 text-[11px] tabular-nums text-zinc-500">
              Due: {formatEstimatePaymentDueDate(item.dueDate)}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 pt-0.5 text-right tabular-nums text-[16px] font-semibold tracking-[-0.01em] text-zinc-950">
          ${fmt(amount)}
        </p>
      </div>
    </article>
  );
}

type ScopeSection = ReturnType<typeof groupEstimateItemsByCategoryId>[number];
type PaginatedScopeSection = ScopeSection & { isContinuation?: boolean };

function estimateLineItemPageWeight(row: EstimateItemRow): number {
  const { title, body } = splitLineItemDesc(row.desc ?? "");
  const titleWeight = title.trim().length > 64 ? 1 : 0;
  const bodyLines = body.trim() ? Math.ceil(body.trim().length / 105) : 0;
  return 3 + titleWeight + Math.min(bodyLines, 7);
}

function paginateScopeSections(sections: ScopeSection[]): PaginatedScopeSection[][] {
  if (sections.length === 0) return [[]];

  const pages: PaginatedScopeSection[][] = [];
  let currentPage: PaginatedScopeSection[] = [];
  let remaining = 24;

  const nextPage = () => {
    if (currentPage.length > 0) pages.push(currentPage);
    currentPage = [];
    remaining = 36;
  };

  for (const section of sections) {
    let rowIndex = 0;
    let isContinuation = false;

    if (section.rows.length === 0) {
      if (remaining < 4) nextPage();
      currentPage.push({ ...section, isContinuation });
      remaining -= 4;
      continue;
    }

    while (rowIndex < section.rows.length) {
      const headerWeight = 3;
      if (remaining < headerWeight + 3 && currentPage.length > 0) {
        nextPage();
      }

      const pageRows: EstimateItemRow[] = [];
      let used = headerWeight;

      while (rowIndex < section.rows.length) {
        const row = section.rows[rowIndex];
        const rowWeight = estimateLineItemPageWeight(row);
        const wouldOverflow = used + rowWeight > remaining;

        if (wouldOverflow && pageRows.length > 0) break;
        if (wouldOverflow && currentPage.length > 0) {
          nextPage();
          used = headerWeight;
          continue;
        }

        pageRows.push(row);
        used += rowWeight;
        rowIndex += 1;
      }

      currentPage.push({ ...section, rows: pageRows, isContinuation });
      remaining -= Math.max(used, headerWeight + 3);
      isContinuation = true;

      if (rowIndex < section.rows.length) nextPage();
    }
  }

  if (currentPage.length > 0) pages.push(currentPage);
  return pages.length ? pages : [[]];
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
  const scopePages = paginateScopeSections(costSections);
  const clientName = cleanText(meta?.client.name);
  const clientAddress = cleanText(meta?.client.address);
  const projectName = cleanText(meta?.project.name);
  const projectAddress = cleanText(meta?.project.siteAddress);
  const jobAddress = clientAddress ?? projectAddress;
  const finalPageNumber = scopePages.length + 1;

  return (
    <article
      data-testid="estimate-document"
      className="estimate-preview-paper-stack text-zinc-900 print:block"
    >
      {scopePages.map((pageSections, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastScopePage = pageIndex === scopePages.length - 1;

        return (
          <section
            key={`scope-page-${pageIndex}`}
            data-testid="estimate-preview-page"
            className="estimate-a4-page estimate-scope-page"
            aria-label={`Estimate preview page ${pageIndex + 1}`}
          >
            <div className="estimate-page-label" data-html2canvas-ignore="true">
              Page {pageIndex + 1}
            </div>

            {isFirstPage ? (
              <>
                <MinimalProposalHeader
                  company={company}
                  estimateNumber={estimate.number}
                  estimateDate={estimateDateStr}
                  validUntil={meta?.validUntil}
                  statusLabel={statusLabel}
                  projectName={projectName}
                  clientName={clientName}
                  location={jobAddress}
                />
              </>
            ) : null}

            <section className="print:break-inside-auto">
              <div className="mb-5 flex items-end justify-between gap-6">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">
                    Scope of Work{isFirstPage ? "" : " / Continued"}
                  </p>
                  {isFirstPage ? (
                    <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-600">
                      A clear outline of the included work, organized by proposal section.
                    </p>
                  ) : null}
                </div>
              </div>
              {costSections.length === 0 ? (
                <p className="text-sm text-zinc-500 py-2">No line items.</p>
              ) : (
                <>
                  {pageSections.map(({ categoryId, title, rows, sectionTotal, isContinuation }) => (
                    <div
                      key={`${categoryId}-${isContinuation ? "continued" : "start"}-${rows
                        .map((row) => row.id)
                        .join("-")}`}
                      className="estimate-scope-section mb-6 last:mb-0"
                    >
                      <div className="mb-3 flex items-baseline justify-between gap-4">
                        <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.025em] text-zinc-950">
                          {title}
                          {isContinuation ? (
                            <span className="ml-1 text-xs font-medium text-zinc-500">
                              continued
                            </span>
                          ) : null}
                        </h3>
                        <p className="shrink-0 text-[12px] tabular-nums text-zinc-500">
                          <span className="font-semibold text-zinc-900">${fmt(sectionTotal)}</span>
                        </p>
                      </div>
                      <ScopeLineItems rows={rows} fmt={fmt} />
                    </div>
                  ))}
                </>
              )}
            </section>

            {summary && isLastScopePage ? (
              <EstimatePreviewSummaryPanel
                subtotal={summary.subtotal}
                tax={summary.tax}
                discount={summary.discount}
                grandTotal={summary.grandTotal}
                isProposalStyle
                fmt={fmt}
              />
            ) : null}
          </section>
        );
      })}

      <section
        data-testid="estimate-preview-page"
        className="estimate-a4-page estimate-final-packet"
        aria-label={`Estimate preview page ${finalPageNumber}`}
      >
        <div className="estimate-page-label" data-html2canvas-ignore="true">
          Page {finalPageNumber}
        </div>

        {paymentSchedule.length > 0 ? (
          <section className="estimate-final-packet-section">
            <div className="mb-5 flex items-end justify-between gap-6 pb-2">
              <div>
                <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">
                  Payment Schedule
                </p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em] text-zinc-950">
                  Milestone agreement
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">
                  Customer payment milestones tied to this proposal.
                </p>
              </div>
              <div className="text-right text-[11px] text-zinc-500">
                <p>
                  Total scheduled:{" "}
                  <span className="font-semibold tabular-nums text-zinc-900">
                    $
                    {fmt(
                      paymentSchedule.reduce(
                        (total, item) => total + paymentMilestoneAmount(item, estimateTotal),
                        0
                      )
                    )}
                  </span>
                </p>
                <p>
                  Remaining balance:{" "}
                  <span className="font-semibold tabular-nums text-zinc-900">
                    $
                    {fmt(
                      Math.max(
                        0,
                        estimateTotal -
                          paymentSchedule.reduce(
                            (total, item) => total + paymentMilestoneAmount(item, estimateTotal),
                            0
                          )
                      )
                    )}
                  </span>
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {paymentSchedule.map((item, index) => {
                const amount = paymentMilestoneAmount(item, estimateTotal);
                return (
                  <PaymentMilestoneRow
                    key={item.id}
                    item={item}
                    amount={amount}
                    index={index}
                    fmt={fmt}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {meta?.documentNotes.length ? (
          <EstimateNotesPreview notes={meta.documentNotes} className="mt-4" />
        ) : null}

        {company.defaultTerms ? (
          <section className="estimate-final-packet-section mt-5">
            <h2 className="mb-2 text-[11px] font-medium tracking-[0.08em] text-zinc-500">Terms</h2>
            <p className="whitespace-pre-wrap break-words py-2 text-sm leading-relaxed text-zinc-700">
              {company.defaultTerms}
            </p>
          </section>
        ) : null}

        <section
          className="estimate-signature-block mt-6 w-full text-left"
          aria-label="Client acceptance"
        >
          <h2 className="mb-2 text-[20px] font-semibold tracking-[-0.035em] text-zinc-950">
            Client Acceptance
          </h2>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-600">
            By signing below, the client acknowledges review and acceptance of this estimate,
            payment schedule, and listed notes or clarifications.
          </p>
          <div className="grid gap-x-10 gap-y-6 text-sm text-zinc-900 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">Client Name</p>
              <div className="mt-5 border-b border-zinc-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">Date</p>
              <div className="mt-5 border-b border-zinc-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">Signature</p>
              <div className="mt-6 border-b border-zinc-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">
                Company Representative
              </p>
              <div className="mt-6 border-b border-zinc-400" aria-hidden />
            </div>
          </div>
        </section>
      </section>
    </article>
  );
}
