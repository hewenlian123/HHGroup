import type * as React from "react";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";

function InfoField({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={align === "right" ? "receipt-field receipt-field--inline-end" : "receipt-field"}
    >
      <span className="receipt-label-text">{label}</span>
      <span className="receipt-value">{value || "—"}</span>
    </div>
  );
}

export function PaymentReceiptBody({ data }: { data: PaymentReceiptPreviewDto }) {
  const method = data.payment.paymentMethod?.trim() || "—";
  const depositAccount = data.payment.depositAccount?.trim() || "—";
  const notes = data.payment.notes?.trim();

  return (
    <div className="receipt receipt-container">
      <DocumentCompanyHeader
        className="receipt-doc-header border-zinc-200 !mb-3 !pb-3"
        company={data.company}
        documentTitle="Payment Receipt"
        documentNo={data.receiptNo}
        documentDate={formatDate(data.payment.paymentDate)}
        documentNoLabel="Receipt No"
        density="compact"
      />

      <div className="receipt-meta-grid">
        <div className="receipt-meta-left">
          <InfoField label="Received from" value={data.customerName} />
          <InfoField label="Project" value={data.projectName ?? "—"} />
          <InfoField
            label="Invoice"
            value={data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8)}
          />
          {notes ? <div className="receipt-notes">{notes}</div> : null}
        </div>
        <div className="receipt-meta-right">
          <InfoField label="Payment method" value={method} align="right" />
          <InfoField label="Deposit account" value={depositAccount} align="right" />
          <div className="receipt-total-block">
            <span className="receipt-total-label">Amount received</span>
            <span className="receipt-total-amount tabular-nums">
              {formatCurrency(data.payment.amount)}
            </span>
          </div>
        </div>
      </div>

      <div className="receipt-table-wrap receipt-no-break">
        <p className="receipt-section-label">Invoice payment</p>
        <table className="receipt-table">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Method</th>
              <th className="receipt-num">Amount</th>
              <th className="receipt-num">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="tabular-nums">{formatDate(data.payment.paymentDate)}</td>
              <td>{data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8)}</td>
              <td>{method}</td>
              <td className="receipt-num">{formatCurrency(data.payment.amount)}</td>
              <td className="receipt-num">{formatCurrency(data.invoice.balanceAfterPayment)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="receipt-summary">
        <div className="receipt-summary-row">
          <span className="receipt-summary-label">Invoice total</span>
          <span className="receipt-summary-amount tabular-nums">
            {formatCurrency(data.invoice.total)}
          </span>
        </div>
        <div className="receipt-summary-row">
          <span className="receipt-summary-label">Payment received</span>
          <span className="receipt-summary-amount tabular-nums">
            {formatCurrency(data.payment.amount)}
          </span>
        </div>
        <div className="receipt-summary-row receipt-summary-row--balance">
          <span className="receipt-summary-label">Balance after payment</span>
          <span className="receipt-summary-amount tabular-nums">
            {formatCurrency(data.invoice.balanceAfterPayment)}
          </span>
        </div>
      </div>

      <footer className="receipt-footer">
        <p>
          Receipt issued by {data.company.companyName} for invoice{" "}
          {data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8)}.
        </p>
      </footer>
    </div>
  );
}
