import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptActions } from "./receipt-actions";
import { getProjectById, getWorkerById, getWorkerPaymentById } from "@/lib/data";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";

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

/** Map AM/PM session to contractor-friendly wording. */
function sessionReceiptLabel(session: string): string {
  if (session === "Full day") return "Full day";
  if (session === "Morning") return "Half day (AM)";
  if (session === "Afternoon") return "Half day (PM)";
  return session;
}

export default async function WorkerPaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const payment = await getWorkerPaymentById(id);
  if (!payment) notFound();

  const [worker, project, receiptData, receiptNo] = await Promise.all([
    getWorkerById(payment.workerId),
    payment.projectId ? getProjectById(payment.projectId) : Promise.resolve(undefined),
    getWorkerPaymentReceiptPayload(payment.id, payment.workerId, payment.amount, {
      laborEntryIdsFromPayment: payment.laborEntryIds,
    }),
    computeWorkerPaymentReceiptNo(payment.id, payment.paymentDate),
  ]);
  if (!worker) notFound();

  const projectName = project?.name ?? (payment.projectId ? payment.projectId : null);
  const laborLines = receiptData?.laborLines ?? [];
  const reimbLines = receiptData?.reimbLines ?? [];
  const laborSubtotal = receiptData?.laborSubtotal ?? 0;
  const reimbSubtotal = receiptData?.reimbSubtotal ?? 0;
  const bal = receiptData?.balance;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <style>{`
        @page { size: letter; margin: 0.65in; }
        @media print {
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mx-auto px-6 py-8 print:py-6" style={{ maxWidth: "8.25in" }}>
        {/* Top bar */}
        <div className="flex flex-col gap-4 border-b border-zinc-900/20 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">HH Construction Inc</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950 sm:text-[26px]">Worker Payment Receipt</h1>
            <p className="mt-1 text-xs text-zinc-500">Contractor payout record for payroll &amp; accounting</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 print:hidden">
            <Link href="/labor/payments" className="text-sm text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline">
              Back
            </Link>
            <ReceiptActions paymentId={payment.id} />
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-8 grid gap-6 border-b border-zinc-200 pb-8 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Receipt No</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-950">{receiptNo}</p>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">System reference</p>
            <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-zinc-500 break-all">{payment.id}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Payment date</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-zinc-950">{fmtDate(payment.paymentDate)}</p>
          </div>
        </div>

        {/* Payee */}
        <section className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Payee</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Worker name</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">{worker.name}</p>
              {worker.trade?.trim() ? (
                <p className="mt-2 text-sm text-zinc-600">
                  <span className="text-zinc-400">Trade / role:</span> {worker.trade}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Reference project</p>
              <p className="mt-1 text-sm text-zinc-800">{projectName ?? "—"}</p>
              <p className="mt-3 text-xs text-zinc-500">
                Line-item projects for labor appear in the breakdown below when available.
              </p>
            </div>
          </div>
        </section>

        {/* Payment method & amount */}
        <section className="mt-10 border-t border-zinc-200 pt-8">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Payment</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Method</dt>
              <dd className="mt-1 text-sm font-medium text-zinc-900">{payment.paymentMethod ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Amount paid</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-zinc-950">{fmtUsd(payment.amount)}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Notes</dt>
              <dd className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap">{payment.notes?.trim() ? payment.notes : "—"}</dd>
            </div>
          </dl>
        </section>

        {/* Labor breakdown */}
        <section className="mt-10 border-t border-zinc-200 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Labor included in this payment</h2>
            <span className="text-xs text-zinc-400">{laborLines.length} line{laborLines.length === 1 ? "" : "s"}</span>
          </div>

          {laborLines.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              No labor entries are linked to this payment (e.g. reimbursement-only payout, or legacy record). Labor detail
              appears when entries are settled with a payment link.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-900/25">
                    <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Date
                    </th>
                    <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Project
                    </th>
                    <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Session
                    </th>
                    <th className="py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {laborLines.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-900">{fmtDate(row.workDate)}</td>
                      <td className="py-2.5 pr-4 text-zinc-700">{row.projectName ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-zinc-700">{sessionReceiptLabel(row.session)}</td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-zinc-950">{fmtUsd(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-900/20">
                    <td colSpan={3} className="py-3 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">
                      Labor subtotal
                    </td>
                    <td className="py-3 text-right text-base font-bold tabular-nums text-zinc-950">{fmtUsd(laborSubtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Reimbursements */}
        {reimbLines.length > 0 ? (
          <section className="mt-10 border-t border-zinc-200 pt-8">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Reimbursements included</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-900/25">
                    <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Vendor / description
                    </th>
                    <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Project
                    </th>
                    <th className="py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reimbLines.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2.5 pr-4 text-zinc-800">{row.vendor ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-zinc-700">{row.projectName ?? "—"}</td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-zinc-950">{fmtUsd(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-900/20">
                    <td colSpan={2} className="py-3 text-right text-xs font-bold uppercase tracking-wide text-zinc-600">
                      Reimbursement subtotal
                    </td>
                    <td className="py-3 text-right text-base font-bold tabular-nums text-zinc-950">{fmtUsd(reimbSubtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : null}

        {/* Balance summary */}
        {bal != null ? (
          <section className="mt-10 border-t border-zinc-200 pt-8">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Account balance summary</h2>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500">
              Estimated worker account position after this payment. &ldquo;Previous balance&rdquo; is derived as remaining
              balance plus this payment amount for this document.
            </p>
            <div className="mt-6 max-w-md border border-zinc-200">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr className="border-b border-zinc-100">
                    <td className="px-4 py-3 text-zinc-600">Previous balance (before this payment)</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-zinc-950">{fmtUsd(bal.previousBalance)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100 border-t border-zinc-900/15">
                    <td className="px-4 py-3 font-medium text-zinc-800">This payment</td>
                    <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-zinc-950">
                      {fmtUsd(-payment.amount)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-zinc-900/25">
                    <td className="px-4 py-3.5 font-bold text-zinc-900">Remaining balance</td>
                    <td className="px-4 py-3.5 text-right text-lg font-bold tabular-nums text-zinc-950">
                      {fmtUsd(bal.remainingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
              Components: unpaid labor {fmtUsd(bal.laborOwed)} · unpaid reimbursements {fmtUsd(bal.reimbursementsUnpaid)} · total
              payments applied {fmtUsd(bal.totalPayments)} · advances {fmtUsd(bal.advances)}.
            </p>
          </section>
        ) : null}

        {/* Signatures */}
        <section className="mt-14 border-t border-zinc-200 pt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Authorization</h2>
          <div className="mt-8 grid gap-10 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-zinc-700">Worker signature</p>
              <div className="mt-10 border-b border-zinc-900/40" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-700">Paid by (company representative)</p>
              <div className="mt-10 border-b border-zinc-900/40" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-700">Date signed</p>
              <div className="mt-10 border-b border-zinc-900/40" />
            </div>
          </div>
        </section>

        <footer className="mt-12 border-t border-zinc-200 pt-6 text-[11px] leading-relaxed text-zinc-500">
          <p>Retain this receipt for payroll, 1099, and general accounting records. Questions: contact your project office.</p>
        </footer>
      </div>
    </div>
  );
}
