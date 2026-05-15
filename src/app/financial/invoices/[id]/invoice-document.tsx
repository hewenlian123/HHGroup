import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import type { InvoiceWithDerived } from "@/lib/invoices-db";
import { formatDate } from "@/lib/formatters";

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

function SummaryRow({
  label,
  value,
  strong = false,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "default" | "positive";
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={
        strong
          ? "flex justify-between gap-4 border-t border-zinc-300 pt-4 text-base font-semibold sm:gap-8"
          : "flex justify-between gap-4 text-sm sm:gap-8"
      }
    >
      <span className="text-zinc-500">{label}</span>
      <span className={tone === "positive" ? "tabular-nums text-[#166534]" : "tabular-nums"}>
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

  return (
    <article
      data-testid="invoice-preview-document"
      className="financial-nums bg-white px-6 py-8 text-zinc-950 sm:px-10 sm:py-10 print:px-0 print:py-0"
    >
      <header
        data-testid="document-company-header"
        className="flex flex-col items-start justify-between gap-7 sm:flex-row sm:gap-10"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- print/PDF-safe external company logo
              <img
                data-testid="document-company-logo"
                src={company.logoUrl}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 object-contain"
              />
            ) : null}
            <p data-testid="document-company-name" className="text-lg font-semibold text-zinc-950">
              {company.companyName}
            </p>
          </div>
          <div className="mt-4 max-w-[340px] space-y-1 text-xs leading-5 text-zinc-500">
            {company.addressLines.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
            {contact ? <p className="break-words text-zinc-600">{contact}</p> : null}
            {company.licenseNumber ? <p>License {company.licenseNumber}</p> : null}
            {company.taxId ? <p>Tax ID {company.taxId}</p> : null}
          </div>
        </div>

        <div className="w-full shrink-0 text-left sm:w-auto sm:text-right">
          <p className="text-sm font-medium text-zinc-500">Invoice</p>
          <p
            data-testid="invoice-preview-number"
            className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950"
          >
            {invoice.invoiceNo}
          </p>
          <p className="mt-3 inline-flex rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
            {statusLabel}
          </p>
        </div>
      </header>

      <section className="mt-10 grid grid-cols-1 items-end gap-5 border-y border-zinc-200 py-6 sm:grid-cols-[minmax(0,1fr)_240px] sm:gap-8">
        <div>
          <p className="text-sm text-zinc-500">Amount due</p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums text-zinc-950 sm:text-4xl">
            {fmtMoney(invoice.balanceDue)}
          </p>
        </div>
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-left text-sm sm:grid-cols-[auto_auto] sm:text-right">
          <span className="text-zinc-500">Issued</span>
          <span data-testid="invoice-preview-issue-date" className="tabular-nums text-zinc-950">
            {issueDate}
          </span>
          <span className="text-zinc-500">Due</span>
          <span
            data-testid="invoice-preview-due-date"
            className="font-medium tabular-nums text-zinc-950"
          >
            {dueDate}
          </span>
          <span className="text-zinc-500">Total</span>
          <span data-testid="invoice-preview-total-top" className="tabular-nums text-zinc-950">
            {fmtMoney(invoice.total)}
          </span>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-5 border-b border-zinc-200 pb-6 text-sm sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-8">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-500">Bill to</p>
          <p data-testid="invoice-preview-client" className="mt-1.5 font-medium text-zinc-950">
            {invoice.clientName}
          </p>
          <p
            data-testid="invoice-preview-project"
            className="mt-0.5 break-words text-zinc-600 sm:truncate"
          >
            {projectName}
          </p>
        </div>
        <div className="min-w-0 text-left sm:text-right">
          <p className="text-xs font-medium text-zinc-500">Payment</p>
          <p className="mt-1.5 font-medium text-zinc-950">Due {dueDate}</p>
          <p className="mt-0.5 text-zinc-600">Ref {invoice.invoiceNo}</p>
        </div>
      </section>

      <section className="mt-8">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-zinc-500">
              <th className="pb-3 pr-2 text-left font-medium sm:pr-3">Description</th>
              <th className="w-10 px-1 pb-3 text-right font-medium tabular-nums sm:w-16 sm:px-2">
                Qty
              </th>
              <th className="w-20 px-1 pb-3 text-right font-medium tabular-nums sm:w-24 sm:px-2">
                Rate
              </th>
              <th className="w-24 pb-3 pl-2 text-right font-medium tabular-nums sm:w-28 sm:pl-3">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((line, index) => (
              <tr
                key={`${line.description}-${index}`}
                data-testid={`invoice-preview-line-${index + 1}`}
                className="border-b border-zinc-100"
              >
                <td
                  data-testid={`invoice-preview-line-${index + 1}-description`}
                  className="whitespace-pre-wrap break-words py-5 pr-2 align-top font-medium text-zinc-950 sm:pr-3"
                >
                  {line.description}
                </td>
                <td
                  data-testid={`invoice-preview-line-${index + 1}-qty`}
                  className="px-1 py-5 text-right align-top tabular-nums text-zinc-600 sm:px-2"
                >
                  {line.qty}
                </td>
                <td
                  data-testid={`invoice-preview-line-${index + 1}-rate`}
                  className="px-1 py-5 text-right align-top tabular-nums text-zinc-600 sm:px-2"
                >
                  {fmtMoney(line.unitPrice)}
                </td>
                <td
                  data-testid={`invoice-preview-line-${index + 1}-amount`}
                  className="py-5 pl-2 text-right align-top font-semibold tabular-nums text-zinc-950 sm:pl-3"
                >
                  {fmtMoney(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-[minmax(0,1fr)_280px] sm:gap-10">
        <div className="border-t border-zinc-200 pt-5 text-sm leading-6 text-zinc-600">
          <p className="font-medium text-zinc-950">Terms</p>
          <p className="mt-2 whitespace-pre-wrap">{termsText}</p>
        </div>

        <div className="space-y-3">
          <SummaryRow
            label="Subtotal"
            value={fmtMoney(invoice.subtotal)}
            testId="invoice-preview-subtotal"
          />
          {invoice.taxAmount != null && invoice.taxAmount > 0 ? (
            <SummaryRow
              label={invoice.taxPct != null ? `Tax (${invoice.taxPct}%)` : "Tax"}
              value={fmtMoney(invoice.taxAmount)}
              testId="invoice-preview-tax"
            />
          ) : null}
          <SummaryRow
            label="Total"
            value={fmtMoney(invoice.total)}
            testId="invoice-preview-total"
          />
          <SummaryRow
            label="Paid"
            value={fmtMoney(invoice.paidTotal)}
            tone="positive"
            testId="invoice-preview-paid"
          />
          <SummaryRow
            label="Balance due"
            value={fmtMoney(invoice.balanceDue)}
            strong
            testId="invoice-preview-balance"
          />
        </div>
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-5 text-xs text-zinc-500">
        <p className="whitespace-pre-wrap">{footerText}</p>
        <p className="tabular-nums">{invoice.invoiceNo}</p>
      </footer>
    </article>
  );
}
