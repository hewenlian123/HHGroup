import type {
  ReceiptLaborLine,
  ReceiptReimbLine,
  WorkerBalanceSnapshot,
} from "@/lib/worker-payment-receipt-data";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  const s = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sessionReceiptLabel(session: string): string {
  if (session === "Full day") return "Full day";
  if (session === "Morning") return "Half day (AM)";
  if (session === "Afternoon") return "Half day (PM)";
  return session;
}

export type WorkerPaymentReceiptBodyProps = {
  company: DocumentCompanyProfileDTO;
  receiptNo: string;
  paymentDate: string;
  workerName: string;
  workerTrade?: string | null;
  projectName: string | null;
  paymentMethod: string | null;
  amount: number;
  notes: string | null;
  laborLines: ReceiptLaborLine[];
  reimbLines: ReceiptReimbLine[];
  laborSubtotal: number;
  reimbSubtotal: number;
  balance: WorkerBalanceSnapshot | null;
};

/**
 * Worker payment receipt — minimal / high-end invoice aesthetic.
 */
export function WorkerPaymentReceiptBody({
  company,
  receiptNo,
  paymentDate,
  workerName,
  workerTrade,
  projectName,
  paymentMethod,
  amount,
  notes,
  laborLines,
  reimbLines,
  laborSubtotal,
  reimbSubtotal,
  balance,
}: WorkerPaymentReceiptBodyProps) {
  const methodLabel = paymentMethod?.trim() || "—";
  const balanceDisplay = balance != null ? fmtUsd(balance.remainingBalance) : "—";

  return (
    <div className="receipt receipt-container">
      <DocumentCompanyHeader
        className="receipt-doc-header border-zinc-200 !mb-3 !pb-3"
        company={company}
        documentTitle="Worker Payment Receipt"
        documentNo={receiptNo}
        documentDate={fmtDate(paymentDate)}
        documentNoLabel="Receipt No"
        density="compact"
      />

      <div className="receipt-meta-grid">
        <div className="receipt-meta-left">
          <div className="receipt-field">
            <span className="receipt-label-text">Payee</span>
            <span className="receipt-value">
              {workerName}
              {workerTrade?.trim() ? (
                <span className="receipt-value-muted"> ({workerTrade.trim()})</span>
              ) : null}
            </span>
          </div>
          <div className="receipt-field">
            <span className="receipt-label-text">Project</span>
            <span className="receipt-value">{projectName ?? "—"}</span>
          </div>
          {notes?.trim() ? <div className="receipt-notes">{notes.trim()}</div> : null}
        </div>
        <div className="receipt-meta-right">
          <div className="receipt-field receipt-field--inline-end">
            <span className="receipt-label-text">Payment method</span>
            <span className="receipt-value">{methodLabel}</span>
          </div>
          <div className="receipt-total-block">
            <span className="receipt-total-label">Total</span>
            <span className="receipt-total-amount tabular-nums">{fmtUsd(amount)}</span>
          </div>
        </div>
      </div>

      <div className="receipt-table-wrap receipt-no-break">
        <p className="receipt-section-label">Labor</p>
        <table className="receipt-table receipt-table--labor">
          <colgroup>
            <col className="receipt-col-date" style={{ width: "12%" }} />
            <col className="receipt-col-project" style={{ width: "50%" }} />
            <col className="receipt-col-session" style={{ width: "22%" }} />
            <col className="receipt-col-amount" style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Session</th>
              <th className="receipt-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {laborLines.length === 0 ? (
              <tr className="receipt-empty-row">
                <td colSpan={4}>No labor lines linked (reimbursement-only or legacy record).</td>
              </tr>
            ) : (
              laborLines.map((row) => (
                <tr key={row.id}>
                  <td className="tabular-nums">{fmtDate(row.workDate)}</td>
                  <td>{row.projectName ?? "—"}</td>
                  <td>{sessionReceiptLabel(row.session)}</td>
                  <td className="receipt-num">{fmtUsd(row.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reimbLines.length > 0 ? (
        <div className="receipt-table-wrap receipt-no-break">
          <p className="receipt-section-label">Reimbursements</p>
          <table className="receipt-table receipt-table--reimb">
            <colgroup>
              <col style={{ width: "38%" }} />
              <col style={{ width: "46%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Vendor / description</th>
                <th>Project</th>
                <th className="receipt-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {reimbLines.map((row) => (
                <tr key={row.id}>
                  <td>{row.vendor ?? "—"}</td>
                  <td>{row.projectName ?? "—"}</td>
                  <td className="receipt-num">{fmtUsd(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="receipt-summary">
        <div className="receipt-summary-row">
          <span className="receipt-summary-label">Subtotal</span>
          <span className="receipt-summary-amount tabular-nums">{fmtUsd(laborSubtotal)}</span>
        </div>
        {reimbLines.length > 0 ? (
          <div className="receipt-summary-row">
            <span className="receipt-summary-label">Reimbursements</span>
            <span className="receipt-summary-amount tabular-nums">{fmtUsd(reimbSubtotal)}</span>
          </div>
        ) : null}
        <div className="receipt-summary-row receipt-summary-row--balance">
          <span className="receipt-summary-label">Balance</span>
          <span className="receipt-summary-amount tabular-nums">{balanceDisplay}</span>
        </div>
      </div>

      <div className="receipt-signature">
        <div className="receipt-signature-col">
          <span className="receipt-sig-label">Worker signature</span>
          <div className="receipt-line" aria-hidden />
        </div>
        <div className="receipt-signature-col">
          <span className="receipt-sig-label">Company representative</span>
          <div className="receipt-line" aria-hidden />
        </div>
        <div className="receipt-signature-col">
          <span className="receipt-sig-label">Date</span>
          <div className="receipt-line" aria-hidden />
        </div>
      </div>

      <footer className="receipt-footer">
        <p>
          Retain for payroll, 1099, accounting, and records. {company.companyName} — worker payment
          receipt.
        </p>
      </footer>
    </div>
  );
}
