import { lineItemBodyLooksLikeHtml } from "@/lib/sanitize-line-item-html";
import {
  groupEstimateItemsByCategoryId,
  paymentMilestoneAmount,
  type EstimateItemRow,
  type EstimateMetaRecord,
  type PaymentScheduleItem,
} from "@/lib/estimates-db";
import { estimateLineItemText } from "@/lib/sanitize-line-item-html";
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
  estimateDocumentIdentity,
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
        const { title: itemTitle, body } = estimateLineItemText(row);
        const unitPrice = formatPdfLineUnitPrice(row, (n) => `$${fmt(n)}`);
        const lineTotal = formatPdfLineTotal(row, (n) => `$${fmt(n)}`);
        return (
          <article
            key={row.id}
            data-testid="estimate-line-item-output"
            className="estimate-scope-item"
          >
            {showLineAmounts ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9.25rem] sm:gap-8">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-zinc-950">
                      {itemTitle || "Line item"}
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
                    {itemTitle || "Line item"}
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
  if (text && lineItemBodyLooksLikeHtml(text)) {
    return (
      <LineItemOrScopeBodyPreview
        body={text}
        variant="print"
        className="mt-1 text-[13px] leading-[1.5] text-zinc-600"
      />
    );
  }
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
          <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
            Due: {formatEstimatePaymentDueDate(item.dueDate) ?? "Upon Completion"}
          </p>
        </div>
        <p className="shrink-0 pt-0.5 text-right tabular-nums text-[16px] font-semibold tracking-[-0.01em] text-zinc-950">
          ${fmt(amount)}
        </p>
      </div>
    </article>
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
  const clientName = cleanText(meta?.client.name);
  const clientAddress = cleanText(meta?.client.address);
  const projectName = cleanText(meta?.project.name);
  const projectAddress = cleanText(meta?.project.siteAddress);
  const jobAddress = clientAddress ?? projectAddress;
  const documentNotes = meta?.documentNotes ?? [];

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
        <EstimateNotesPreview notes={documentNotes} className="estimate-document-notes mt-4" />
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
      data-hh-context="paper"
      data-hh-theme="document-light"
      className="estimate-preview-paper-stack text-zinc-900 print:block"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
        @page {
          size: Letter;
          margin: 10mm 12mm 15mm;
          @bottom-left { content: ${JSON.stringify(estimate.number).replace(/</g, "\\3c ")}; font-size: 9.5px; color: #71717a; }
          @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9.5px; color: #71717a; }
        }
      }`,
        }}
      />
      <section
        data-testid="estimate-preview-page"
        className="estimate-flow-document estimate-a4-page"
        aria-label="Estimate document"
      >
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
        <section>
          <div className="estimate-scope-intro mb-4">
            <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">Scope of Work</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-600">
              A clear outline of the included work, organized by {documentIdentity.paymentContext}{" "}
              section.
            </p>
          </div>
          {costSections.length === 0 ? (
            <p className="text-sm text-zinc-500 py-2">No line items.</p>
          ) : (
            costSections.map(({ categoryId, title, rows, sectionTotal }) => (
              <section key={categoryId} className="estimate-scope-section mb-5 last:mb-0">
                <div className="estimate-section-heading mb-2 flex items-baseline justify-between gap-4">
                  <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.025em] text-zinc-950">
                    {title}
                  </h3>
                  {showLineAmounts ? (
                    <p className="shrink-0 text-[12px] tabular-nums text-zinc-500">
                      <span className="font-semibold text-zinc-900">${fmt(sectionTotal)}</span>
                    </p>
                  ) : null}
                </div>
                <ScopeLineItems rows={rows} fmt={fmt} showLineAmounts={showLineAmounts} />
              </section>
            ))
          )}
        </section>
        {summary ? (
          <EstimatePreviewSummaryPanel
            subtotal={summary.subtotal}
            tax={summary.tax}
            discount={summary.discount}
            grandTotal={summary.grandTotal}
            isProposalStyle={isProposalStyle}
            fmt={fmt}
          />
        ) : null}
        {renderPaymentScheduleSection(paymentSchedule, false)}
        {notesAndAcceptance}
        <footer className="estimate-flow-footer">{estimate.number}</footer>
      </section>
    </article>
  );
}
