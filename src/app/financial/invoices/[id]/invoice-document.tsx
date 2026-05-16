import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import type { InvoiceWithDerived } from "@/lib/invoices-db";
import { formatDate } from "@/lib/formatters";
import type { ReactNode } from "react";
import { Building2, CalendarDays, FileText, Globe2, Mail, Phone } from "lucide-react";

type InvoiceDocumentProps = {
  invoice: InvoiceWithDerived;
  projectName: string;
  company: DocumentCompanyProfileDTO;
};

function fmtMoney(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function splitLineDescription(value: string): { title: string; detail: string } {
  const parts = value
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { title: value.trim(), detail: "" };
  return {
    title: parts[0],
    detail: parts.slice(1).join("\n"),
  };
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium leading-none text-zinc-600 print:bg-white">
      {status}
    </span>
  );
}

function ContactLine({ icon: Icon, children }: { icon: typeof Building2; children: ReactNode }) {
  return (
    <p className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function MetaRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <span className="text-[11px] font-medium uppercase leading-none text-zinc-500">{label}</span>
      <span
        data-testid={testId}
        className="break-words text-right text-[13px] font-medium leading-none text-zinc-950 tabular-nums"
      >
        {value}
      </span>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "strong";
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-5 text-[13px] leading-none"
    >
      <span className="font-medium text-zinc-500">{label}</span>
      <span
        className={
          tone === "positive"
            ? "font-semibold tabular-nums text-emerald-700"
            : tone === "strong"
              ? "font-semibold tabular-nums text-zinc-950"
              : "font-medium tabular-nums text-zinc-800"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function InvoiceDocument({ invoice, projectName, company }: InvoiceDocumentProps) {
  const contact = [company.phone, company.email, company.website].filter(Boolean).join(" / ");
  const statusLabel = invoice.computedStatus === "Void" ? "Void" : invoice.computedStatus;
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = formatDate(invoice.dueDate);
  const termsText =
    invoice.notes?.trim() || company.defaultTerms || `Payment is due by ${dueDate}.`;
  const footerText = company.invoiceFooter || "Thank you for your business.";
  const addressText = company.addressLines.join(", ");

  return (
    <article
      data-testid="invoice-preview-document"
      className="financial-nums bg-white px-5 py-7 text-zinc-950 transition-colors duration-150 sm:px-9 sm:py-9 print:px-0 print:py-0 print:transition-none"
    >
      <header
        data-testid="document-company-header"
        className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_280px] sm:gap-10"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- print/PDF-safe external company logo
              <img
                data-testid="document-company-logo"
                src={company.logoUrl}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-xl object-contain"
              />
            ) : null}
            <div className="min-w-0">
              <p
                data-testid="document-company-name"
                className="truncate text-[17px] font-semibold leading-tight text-zinc-950"
              >
                {company.companyName}
              </p>
            </div>
          </div>
          <div className="mt-4 max-w-[390px] space-y-1.5 text-[11.5px] leading-5 text-zinc-500">
            {addressText ? <ContactLine icon={Building2}>{addressText}</ContactLine> : null}
            {company.phone ? <ContactLine icon={Phone}>{company.phone}</ContactLine> : null}
            {company.email ? <ContactLine icon={Mail}>{company.email}</ContactLine> : null}
            {company.website ? <ContactLine icon={Globe2}>{company.website}</ContactLine> : null}
            {contact && !company.phone && !company.email && !company.website ? (
              <ContactLine icon={FileText}>{contact}</ContactLine>
            ) : null}
            {company.licenseNumber ? (
              <ContactLine icon={FileText}>License {company.licenseNumber}</ContactLine>
            ) : null}
            {company.taxId ? (
              <ContactLine icon={FileText}>Tax ID {company.taxId}</ContactLine>
            ) : null}
          </div>
        </div>

        <div className="w-full rounded-lg border border-zinc-200/80 bg-white p-4 shadow-[0_6px_18px_rgba(24,24,27,0.035)] print:shadow-none">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase leading-none text-zinc-500">
              Invoice
            </p>
            <StatusPill status={statusLabel} />
          </div>
          <p
            data-testid="invoice-preview-number"
            className="mt-3 break-words text-right text-[22px] font-semibold leading-tight tracking-[0.055em] text-zinc-950 tabular-nums"
          >
            {invoice.invoiceNo}
          </p>
          <div className="mt-3 space-y-2.5 border-t border-zinc-100 pt-3">
            <MetaRow label="Issued" value={issueDate} testId="invoice-preview-issue-date" />
            <MetaRow label="Due" value={dueDate} testId="invoice-preview-due-date" />
          </div>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-4 text-sm sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-8 print:break-inside-avoid">
        <div className="min-w-0 border-b border-zinc-200/70 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-8">
          <p className="text-[11px] font-semibold uppercase leading-none text-zinc-500">Bill to</p>
          <p
            data-testid="invoice-preview-client"
            className="mt-2 font-semibold leading-snug text-zinc-950"
          >
            {invoice.clientName}
          </p>
          <p
            data-testid="invoice-preview-project"
            className="mt-1 break-words text-[13px] leading-5 text-zinc-600 sm:truncate"
          >
            {projectName}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-none text-zinc-500">Payment</p>
          <p className="mt-2 font-semibold leading-snug text-zinc-950">Due {dueDate}</p>
          <p className="mt-1 break-words text-[13px] leading-5 text-zinc-600">
            Ref {invoice.invoiceNo}
          </p>
        </div>
      </section>

      <section className="mt-7 print:break-inside-avoid">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-zinc-200 text-[10.5px] uppercase leading-none text-zinc-500">
              <th className="pb-3 pr-2 text-left font-semibold sm:pr-3">Description</th>
              <th className="w-10 px-1 pb-3 text-right font-semibold tabular-nums sm:w-16 sm:px-2">
                Qty
              </th>
              <th className="w-20 px-1 pb-3 text-right font-semibold tabular-nums sm:w-24 sm:px-2">
                Rate
              </th>
              <th className="w-24 pb-3 pl-2 text-right font-semibold tabular-nums sm:w-28 sm:pl-3">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((line, index) => {
              const lineText = splitLineDescription(line.description);
              return (
                <tr
                  key={`${line.description}-${index}`}
                  data-testid={`invoice-preview-line-${index + 1}`}
                  className="border-b border-zinc-100/90 transition-colors duration-150 hover:bg-zinc-50/70 print:break-inside-avoid print:hover:bg-transparent"
                >
                  <td
                    data-testid={`invoice-preview-line-${index + 1}-description`}
                    className="whitespace-pre-wrap break-words py-4 pr-2 align-top sm:pr-3"
                  >
                    <span className="block font-semibold leading-5 text-zinc-950">
                      {lineText.title}
                    </span>
                    {lineText.detail ? (
                      <span className="mt-1 block whitespace-pre-wrap text-[12px] leading-5 text-zinc-500">
                        {lineText.detail}
                      </span>
                    ) : null}
                  </td>
                  <td
                    data-testid={`invoice-preview-line-${index + 1}-qty`}
                    className="px-1 py-4 text-right align-top font-medium tabular-nums text-zinc-600 sm:px-2"
                  >
                    {line.qty}
                  </td>
                  <td
                    data-testid={`invoice-preview-line-${index + 1}-rate`}
                    className="px-1 py-4 text-right align-top font-medium tabular-nums text-zinc-600 sm:px-2"
                  >
                    {fmtMoney(line.unitPrice)}
                  </td>
                  <td
                    data-testid={`invoice-preview-line-${index + 1}-amount`}
                    className="py-4 pl-2 text-right align-top text-[14px] font-semibold tabular-nums text-zinc-950 sm:pl-3"
                  >
                    {fmtMoney(line.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_300px] sm:gap-8">
        <div className="rounded-lg border border-zinc-200/75 bg-white p-4 text-[13px] leading-6 text-zinc-600 shadow-[0_6px_18px_rgba(24,24,27,0.03)] print:break-inside-avoid print:shadow-none">
          <p className="font-semibold text-zinc-950">Terms</p>
          <p className="mt-1.5 whitespace-pre-wrap">{termsText}</p>
        </div>

        <div className="rounded-lg bg-zinc-50 p-4 shadow-[0_8px_24px_rgba(24,24,27,0.055)] ring-1 ring-zinc-200/75 sm:p-5 print:break-inside-avoid print:shadow-none">
          <div className="space-y-3">
            <SummaryLine
              label="Subtotal"
              value={fmtMoney(invoice.subtotal)}
              testId="invoice-preview-subtotal"
            />
            {invoice.taxAmount != null && invoice.taxAmount > 0 ? (
              <SummaryLine
                label={invoice.taxPct != null ? `Tax (${invoice.taxPct}%)` : "Tax"}
                value={fmtMoney(invoice.taxAmount)}
                testId="invoice-preview-tax"
              />
            ) : null}
            <SummaryLine
              label="Total"
              value={fmtMoney(invoice.total)}
              tone="strong"
              testId="invoice-preview-total"
            />
            <SummaryLine
              label="Paid"
              value={fmtMoney(invoice.paidTotal)}
              tone="positive"
              testId="invoice-preview-paid"
            />
          </div>
          <div
            data-testid="invoice-preview-balance"
            className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_6px_18px_rgba(24,24,27,0.035)]"
          >
            <p className="text-[11px] font-semibold uppercase leading-none text-zinc-500">
              Balance due
            </p>
            <p className="mt-3 text-right text-[28px] font-semibold leading-none text-zinc-950 tabular-nums sm:text-[32px]">
              {fmtMoney(invoice.balanceDue)}
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-10 grid gap-4 border-t border-zinc-200/80 pt-5 text-[11.5px] text-zinc-500 sm:grid-cols-[minmax(0,1fr)_auto] print:break-inside-avoid">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-800">Thank you</p>
          <p className="mt-1 max-w-[520px] whitespace-pre-wrap leading-5">{footerText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-medium tabular-nums text-zinc-600">
            <CalendarDays className="h-3 w-3 text-zinc-400" />
            {invoice.invoiceNo}
          </span>
        </div>
      </footer>
    </article>
  );
}
