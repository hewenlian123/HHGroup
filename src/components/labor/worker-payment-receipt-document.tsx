import type { WorkerPaymentReceiptPreviewDto } from "@/lib/worker-payment-receipt-preview-dto";

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

/**
 * Receipt body markup aligned with `/receipt/print/[id]` (no print toolbar).
 * Keep visually in sync when editing the print page.
 */
export function WorkerPaymentReceiptDocument({ data }: { data: WorkerPaymentReceiptPreviewDto }) {
  const { receiptNo, payment, workerName, projectName, receipt } = data;
  const laborLines = receipt?.laborLines ?? [];
  const reimbLines = receipt?.reimbLines ?? [];
  const laborSubtotal = receipt?.laborSubtotal ?? 0;
  const reimbSubtotal = receipt?.reimbSubtotal ?? 0;
  const bal = receipt?.balance;
  const methodLabel = payment.paymentMethod?.trim() || "—";

  return (
    <div className="border border-[#eee] bg-white p-6 shadow-sm">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-wide text-gray-900">HH CONSTRUCTION INC</p>
          <h2 className="mt-1 text-[18px] font-bold text-gray-900">Worker Payment Receipt</h2>
        </div>
        <div className="text-[12px] text-gray-500 sm:text-right">
          <div>
            <span className="text-gray-400">Receipt No:</span>{" "}
            <span className="font-semibold tabular-nums text-gray-800">{receiptNo}</span>
          </div>
          <div className="mt-1">
            <span className="text-gray-400">Date:</span>{" "}
            <span className="tabular-nums text-gray-700">{fmtDate(payment.paymentDate)}</span>
          </div>
        </div>
      </header>

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase text-gray-400">Payee</div>
        <p className="text-[14px] font-bold text-gray-900">{workerName}</p>
        {projectName ? <p className="mt-1 text-[12px] text-gray-500">Reference: {projectName}</p> : null}
      </div>

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase text-gray-400">Payment</div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[13px] text-gray-800">{methodLabel}</span>
          <span className="text-right text-[18px] font-semibold tabular-nums text-gray-900">{fmtUsd(payment.amount)}</span>
        </div>
        {payment.notes?.trim() ? (
          <p className="mt-2 whitespace-pre-wrap text-[12px] leading-snug text-gray-500">{payment.notes}</p>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase text-gray-400">Labor</div>
        {laborLines.length === 0 ? (
          <p className="text-[12px] text-gray-500">
            No labor lines linked to this payment (e.g. reimbursement-only or legacy record).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#fafafa] text-gray-500">
                  <th className="px-2 py-2 text-left font-medium">Date</th>
                  <th className="px-2 py-2 text-left font-medium">Project</th>
                  <th className="px-2 py-2 text-left font-medium">Session</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {laborLines.map((row) => (
                  <tr key={row.id} className="border-b border-[#eee]">
                    <td className="px-2 py-2 tabular-nums text-gray-900">{fmtDate(row.workDate)}</td>
                    <td className="px-2 py-2 text-gray-700">{row.projectName ?? "—"}</td>
                    <td className="px-2 py-2 text-gray-700">{sessionReceiptLabel(row.session)}</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums text-gray-900">{fmtUsd(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {laborLines.length > 0 ? (
        <div className="mt-4 flex justify-end">
          <div className="flex min-w-[200px] items-baseline justify-between gap-8 text-[13px]">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-semibold tabular-nums text-gray-900">{fmtUsd(laborSubtotal)}</span>
          </div>
        </div>
      ) : null}

      {reimbLines.length > 0 ? (
        <div className="mt-6">
          <div className="mb-2 text-[11px] uppercase text-gray-400">Reimbursements</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#fafafa] text-gray-500">
                  <th className="px-2 py-2 text-left font-medium">Vendor / description</th>
                  <th className="px-2 py-2 text-left font-medium">Project</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {reimbLines.map((row) => (
                  <tr key={row.id} className="border-b border-[#eee]">
                    <td className="px-2 py-2 text-gray-800">{row.vendor ?? "—"}</td>
                    <td className="px-2 py-2 text-gray-700">{row.projectName ?? "—"}</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums text-gray-900">{fmtUsd(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <div className="flex min-w-[200px] items-baseline justify-between gap-8 text-[13px]">
              <span className="text-gray-600">Reimbursements subtotal</span>
              <span className="font-semibold tabular-nums text-gray-900">{fmtUsd(reimbSubtotal)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase text-gray-400">Balance Summary</div>
        <div className="max-w-md space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-6">
            <span className="text-gray-700">Previous Balance</span>
            <span className="shrink-0 text-right font-medium tabular-nums text-gray-900">
              {bal != null ? fmtUsd(bal.previousBalance) : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-gray-700">Payment Applied</span>
            <span className="shrink-0 text-right font-medium tabular-nums text-gray-900">{fmtUsd(-payment.amount)}</span>
          </div>
          <div className="flex justify-between gap-6 border-t border-[#eee] pt-1.5">
            <span className="font-semibold text-gray-900">Remaining Balance</span>
            <span className="shrink-0 text-right font-bold tabular-nums text-gray-900">
              {bal != null ? fmtUsd(bal.remainingBalance) : "—"}
            </span>
          </div>
        </div>
        {bal == null ? (
          <p className="mt-2 text-[11px] text-gray-400">Full balance snapshot unavailable for this receipt.</p>
        ) : null}
      </div>

      <div className="mt-8 border-t border-[#eee] pt-6">
        <div className="mb-2 text-[11px] uppercase text-gray-400">Signatures</div>
        <div className="grid gap-6 sm:grid-cols-3 sm:gap-4">
          <div>
            <p className="text-[13px] text-gray-700">Worker Signature</p>
            <div className="mt-8 border-b border-gray-400" />
          </div>
          <div>
            <p className="text-[13px] text-gray-700">Company</p>
            <div className="mt-8 border-b border-gray-400" />
          </div>
          <div>
            <p className="text-[13px] text-gray-700">Date</p>
            <div className="mt-8 border-b border-gray-400" />
          </div>
        </div>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-gray-400">
        Retain for payroll and accounting. HH Construction Inc — worker payment receipt.
      </p>
    </div>
  );
}
