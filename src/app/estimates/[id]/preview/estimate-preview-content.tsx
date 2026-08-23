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
import {
  DEFAULT_ESTIMATE_DOCUMENT_STYLE,
  type EstimateDocumentStyle,
} from "@/lib/estimate-document-style";
import {
  buildEstimatePageIdentity,
  estimateDocumentIdentity,
  paginateEstimatePaymentSchedule,
  type EstimateDocumentIdentity,
} from "@/app/estimates/_components/estimate-document-pagination";

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
  documentIdentity,
}: {
  company: DocumentCompanyProfileDTO;
  estimateNumber: string;
  estimateDate: string;
  validUntil: string | null | undefined;
  statusLabel: string;
  projectName: string | null;
  clientName: string | null;
  location: string | null;
  documentIdentity: EstimateDocumentIdentity;
}) {
  return (
    <header className="estimate-minimal-header mb-5 text-zinc-900 print:break-after-avoid">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
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
            {documentIdentity.title}
          </p>
          <div className="mt-2.5 space-y-1 text-[12px] leading-tight">
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
          <span className="mt-2 inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.04em] text-zinc-600">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 max-w-[34rem]">
        <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-zinc-500">
          {documentIdentity.descriptor}
        </p>
        <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.045em] text-zinc-950">
          {projectName ?? documentIdentity.title}
        </h1>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-2 border-y border-zinc-200/55 py-2 sm:grid-cols-4">
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
      <p className="mt-0.5 break-words text-[12.5px] font-medium leading-[1.25] text-zinc-900">
        {children}
      </p>
    </div>
  );
}

function ScopeLineItems({
  rows,
  fmt,
  showLineAmounts,
}: {
  rows: EstimateItemRow[];
  fmt: (n: number) => string;
  showLineAmounts: boolean;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const { title: itemTitle, body } = splitLineItemDesc(row.desc ?? "");
        const unitPrice = formatPdfLineUnitPrice(row, (n) => `$${fmt(n)}`);
        const lineTotal = formatPdfLineTotal(row, (n) => `$${fmt(n)}`);
        return (
          <article
            key={row.id}
            data-testid="estimate-line-item-output"
            className={`estimate-scope-item${
              body.trim().length > 700 ? " estimate-scope-item--flow" : ""
            }`}
          >
            {showLineAmounts ? (
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
                    <div className="mt-1.5 max-w-[34rem] text-[13px] leading-[1.5] text-zinc-600">
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
            ) : (
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
                  <div className="mt-1.5 max-w-[34rem] text-[13px] leading-[1.5] text-zinc-600">
                    <LineItemOrScopeBodyPreview body={body} variant="default" />
                  </div>
                ) : null}
              </div>
            )}
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
    <div className="mt-1 space-y-0.5 text-[13px] leading-[1.5] text-zinc-600">
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
    <article className="estimate-payment-row relative py-1.5">
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
            <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
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

function EstimatePageFooter({
  estimateNumber,
  pageNumber,
  pageCount,
}: {
  estimateNumber: string;
  pageNumber: number;
  pageCount: number;
}) {
  if (pageNumber <= 1) return null;
  const identity = buildEstimatePageIdentity(estimateNumber, pageNumber, pageCount);
  return (
    <footer className="estimate-page-footer" aria-label={identity}>
      <span>{estimateNumber}</span>
      <span className="tabular-nums">
        Page {pageNumber} of {pageCount}
      </span>
    </footer>
  );
}

type ScopeSection = ReturnType<typeof groupEstimateItemsByCategoryId>[number];
type PaginatedScopeSection = ScopeSection & { isContinuation?: boolean };
type FinalPacketPage = {
  kind: "complete" | "payment" | "acceptance";
  milestones: PaymentScheduleItem[];
  continuation: boolean;
};

function estimateLineItemPageWeight(row: EstimateItemRow): number {
  const { title, body } = splitLineItemDesc(row.desc ?? "");
  const printableBody = body
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(?:p|div|li|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u2028/g, "\n");
  const titleLines = Math.max(1, Math.ceil(title.trim().length / 60));
  const bodyLines = printableBody
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.trim().length / 70)), 0);

  // A row's base accounts for its title line, bullet/grid spacing, and the inter-row gap.
  // Text is deliberately measured against the narrower Itemized description column, not a
  // whole-sheet character count, so Proposal and Itemized output share a safe page boundary.
  return 2 + titleLines + bodyLines;
}

function scopePageRowCount(page: PaginatedScopeSection[]): number {
  return page.reduce((count, section) => count + section.rows.length, 0);
}

function balanceTrailingScopePage(pages: PaginatedScopeSection[][]): void {
  if (pages.length < 2) return;

  const previousPage = pages[pages.length - 2];
  const lastPage = pages[pages.length - 1];

  while (scopePageRowCount(lastPage) < 4 && scopePageRowCount(previousPage) > 5) {
    let donorIndex = previousPage.length - 1;
    while (donorIndex >= 0 && previousPage[donorIndex].rows.length === 0) donorIndex -= 1;
    if (donorIndex < 0) return;

    const donor = previousPage[donorIndex];
    const movedRow = donor.rows.at(-1);
    if (!movedRow) return;

    donor.rows = donor.rows.slice(0, -1);
    const donorRemainsOnPreviousPage = donor.rows.length > 0;
    const receiver = lastPage[0];

    if (receiver?.categoryId === donor.categoryId) {
      receiver.rows = [movedRow, ...receiver.rows];
      receiver.isContinuation = donorRemainsOnPreviousPage ? true : donor.isContinuation;
    } else {
      lastPage.unshift({
        ...donor,
        rows: [movedRow],
        isContinuation: donorRemainsOnPreviousPage ? true : donor.isContinuation,
      });
    }

    if (!donorRemainsOnPreviousPage) previousPage.splice(donorIndex, 1);
  }
}

function paginateScopeSections(
  sections: ScopeSection[],
  preserveFinalSummarySpace: boolean
): PaginatedScopeSection[][] {
  if (sections.length === 0) return [[]];

  const pages: PaginatedScopeSection[][] = [];
  let currentPage: PaginatedScopeSection[] = [];
  let remaining = 36;

  const nextPage = () => {
    if (currentPage.length > 0) pages.push(currentPage);
    currentPage = [];
    // Itemized rows include a Qty / Unit / Rate block beneath each amount. When the financial
    // summary follows the final scope page, keep a small continuation-page reserve so the summary
    // cannot encroach on the shared footer clearance at the exact 50-unit boundary.
    remaining = preserveFinalSummarySpace ? 48 : 50;
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
      const headerWeight = 4;
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
  if (!preserveFinalSummarySpace) balanceTrailingScopePage(pages);
  return pages.length ? pages : [[]];
}

function estimateTextLineCount(text: string | null | undefined, charactersPerLine = 82): number {
  const normalized = text?.trim();
  if (!normalized) return 0;

  return normalized
    .split(/\r?\n/)
    .reduce((lines, row) => lines + Math.max(1, Math.ceil(row.length / charactersPerLine)), 0);
}

function shouldSplitFinalPacket({
  paymentSchedule,
  documentNotes,
  defaultTerms,
}: {
  paymentSchedule: PaymentScheduleItem[];
  documentNotes: EstimateMetaRecord["documentNotes"];
  defaultTerms: string | null | undefined;
}): boolean {
  const paymentWeight = paymentSchedule.reduce(
    (weight, item) => weight + 3 + estimateTextLineCount(item.description),
    paymentSchedule.length > 0 ? 5 : 0
  );
  const notesWeight = documentNotes.reduce(
    (weight, note) =>
      weight + 2 + estimateTextLineCount(note.title, 60) + estimateTextLineCount(note.body),
    documentNotes.length > 0 ? 4 : 0
  );
  const termsWeight = defaultTerms ? 2 + estimateTextLineCount(defaultTerms) : 0;
  const signatureWeight = 10;

  return paymentWeight + notesWeight + termsWeight + signatureWeight > 38;
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
  const documentStyle: EstimateDocumentStyle =
    meta?.documentStyle ?? DEFAULT_ESTIMATE_DOCUMENT_STYLE;
  const isProposalStyle = documentStyle === "proposal";
  const showLineAmounts = !isProposalStyle;
  const documentIdentity = estimateDocumentIdentity(documentStyle);

  // Builder persistence intentionally retains empty Sections. Customer documents normalize those
  // records out so historical placeholders cannot consume page capacity or render orphan headings.
  const costSections = groupEstimateItemsByCategoryId(items, categories, catalogNameByCode).filter(
    (section) => section.rows.length > 0
  );
  const scopePages = paginateScopeSections(costSections, Boolean(summary));
  const clientName = cleanText(meta?.client.name);
  const clientAddress = cleanText(meta?.client.address);
  const projectName = cleanText(meta?.project.name);
  const projectAddress = cleanText(meta?.project.siteAddress);
  const jobAddress = clientAddress ?? projectAddress;
  const finalPageNumber = scopePages.length + 1;
  const documentNotes = meta?.documentNotes ?? [];
  const splitFinalPacket = shouldSplitFinalPacket({
    paymentSchedule,
    documentNotes,
    defaultTerms: company.defaultTerms,
  });
  const paymentSchedulePages = paginateEstimatePaymentSchedule(paymentSchedule);
  const finalPacketPages: FinalPacketPage[] = splitFinalPacket
    ? [
        ...paymentSchedulePages.map((milestones, index) => ({
          kind: "payment" as const,
          milestones,
          continuation: index > 0,
        })),
        { kind: "acceptance", milestones: [], continuation: paymentSchedulePages.length > 0 },
      ]
    : [{ kind: "complete", milestones: paymentSchedule, continuation: false }];
  const totalPageCount = scopePages.length + finalPacketPages.length;

  const renderPaymentScheduleSection = (
    milestones: PaymentScheduleItem[],
    continuation: boolean
  ) =>
    milestones.length > 0 ? (
      <section className="estimate-final-packet-section">
        <div className="mb-4 flex items-end justify-between gap-6 pb-2">
          <div>
            <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">
              Payment Schedule{continuation ? " / Continued" : ""}
            </p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em] text-zinc-950">
              Milestone agreement{continuation ? " continued" : ""}
            </h2>
            {!continuation ? (
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">
                Customer payment milestones tied to this {documentIdentity.paymentContext}.
              </p>
            ) : null}
          </div>
          {!continuation ? (
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
          ) : null}
        </div>
        <div className="space-y-1 text-sm">
          {milestones.map((item) => (
            <PaymentMilestoneRow
              key={item.id}
              item={item}
              amount={paymentMilestoneAmount(item, estimateTotal)}
              index={paymentSchedule.findIndex((candidate) => candidate.id === item.id)}
              fmt={fmt}
            />
          ))}
        </div>
      </section>
    ) : null;

  const notesAndAcceptance = (
    <>
      {documentNotes.length ? (
        <EstimateNotesPreview notes={documentNotes} className={splitFinalPacket ? "" : "mt-4"} />
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
          By signing below, the client acknowledges review and acceptance of this estimate, payment
          schedule, and listed notes or clarifications.
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
    </>
  );

  return (
    <article
      data-testid="estimate-document"
      data-estimate-document-style={documentStyle}
      className="estimate-preview-paper-stack text-zinc-900 print:block"
    >
      {scopePages.map((pageSections, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastScopePage = pageIndex === scopePages.length - 1;

        return (
          <section
            key={`scope-page-${pageIndex}`}
            data-testid="estimate-preview-page"
            className={`estimate-a4-page estimate-scope-page${
              pageIndex > 0 ? " estimate-a4-page--continuation" : ""
            }`}
            aria-label={`Estimate preview page ${pageIndex + 1}`}
          >
            <div className="estimate-page-label" data-html2canvas-ignore="true">
              Page {pageIndex + 1} of {totalPageCount}
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
                  documentIdentity={documentIdentity}
                />
              </>
            ) : null}

            <section className="print:break-inside-auto">
              <div className="estimate-scope-intro mb-4 flex items-end justify-between gap-6">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">
                    Scope of Work{isFirstPage ? "" : " / Continued"}
                  </p>
                  {isFirstPage ? (
                    <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-600">
                      A clear outline of the included work, organized by{" "}
                      {documentIdentity.paymentContext} section.
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
                      className="estimate-scope-section mb-5 last:mb-0"
                    >
                      <div className="mb-2 flex items-baseline justify-between gap-4">
                        <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.025em] text-zinc-950">
                          {title}
                          {isContinuation ? (
                            <span className="ml-1 text-xs font-medium text-zinc-500">
                              {" continued"}
                            </span>
                          ) : null}
                        </h3>
                        {showLineAmounts ? (
                          <p className="shrink-0 text-[12px] tabular-nums text-zinc-500">
                            <span className="font-semibold text-zinc-900">
                              ${fmt(sectionTotal)}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <ScopeLineItems rows={rows} fmt={fmt} showLineAmounts={showLineAmounts} />
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
                isProposalStyle={isProposalStyle}
                fmt={fmt}
              />
            ) : null}
            <EstimatePageFooter
              estimateNumber={estimate.number}
              pageNumber={pageIndex + 1}
              pageCount={totalPageCount}
            />
          </section>
        );
      })}

      {finalPacketPages.map((packet, index) => {
        const pageNumber = finalPageNumber + index;
        const isContinuation = index > 0;
        return (
          <section
            key={`${packet.kind}-${pageNumber}`}
            data-testid="estimate-preview-page"
            className={`estimate-a4-page estimate-final-packet estimate-a4-page--continuation${
              isContinuation ? " estimate-final-packet-continuation" : ""
            }`}
            data-final-packet-part={
              packet.kind === "payment" && packet.continuation
                ? "payment-continuation"
                : packet.kind
            }
            aria-label={`Estimate preview page ${pageNumber}`}
          >
            <div className="estimate-page-label" data-html2canvas-ignore="true">
              Page {pageNumber} of {totalPageCount}
            </div>
            {packet.kind === "complete" || packet.kind === "payment"
              ? renderPaymentScheduleSection(packet.milestones, packet.continuation)
              : null}
            {packet.kind === "complete" || packet.kind === "acceptance" ? notesAndAcceptance : null}
            <EstimatePageFooter
              estimateNumber={estimate.number}
              pageNumber={pageNumber}
              pageCount={totalPageCount}
            />
          </section>
        );
      })}
    </article>
  );
}
