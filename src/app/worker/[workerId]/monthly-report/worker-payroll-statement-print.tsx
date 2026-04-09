import type { WorkerMonthlyReportResult } from "@/lib/worker-monthly-report";
import "./payroll-statement-print.css";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSignedUsd(n: number): string {
  if (n < 0) return `-$${fmtUsd(Math.abs(n))}`;
  return `$${fmtUsd(n)}`;
}

/**
 * Professional payroll statement layout — visible only when printing / saving as PDF.
 */
export function WorkerPayrollStatementPrint({ report }: { report: WorkerMonthlyReportResult }) {
  const ps = report.payrollStatement;
  const { summary } = report;

  return (
    <div className="payroll-statement-print-root hidden print:block text-black">
      <header className="mb-8 flex flex-col justify-between gap-6 border-b border-black pb-6 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-neutral-600">
            {ps.companyName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Payroll Statement</h1>
        </div>
        <div className="min-w-0 text-right text-sm leading-relaxed sm:max-w-[14rem]">
          <div className="font-medium">{report.workerName || "Worker"}</div>
          <div className="mt-1 text-neutral-700">
            <span className="text-neutral-500">Period </span>
            {ps.monthLabel}
            <span className="text-neutral-500"> ({ps.monthYm})</span>
          </div>
          <div className="mt-1 text-neutral-600">
            <span className="text-neutral-500">Generated </span>
            {ps.generatedAtDisplay}
          </div>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-600">
          Summary
        </h2>
        <dl className="grid max-w-xl grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
            <dt className="text-neutral-600">Total days</dt>
            <dd className="tabular-nums font-medium">{ps.totalDays}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
            <dt className="text-neutral-600">Daily rate</dt>
            <dd className="tabular-nums font-medium">
              ${fmtUsd(ps.dailyRate)}
              {ps.dailyRateFromWorker ? (
                <span className="ml-1 text-[10px] font-normal normal-case text-neutral-500">
                  (from profile)
                </span>
              ) : ps.totalDays > 0 ? (
                <span className="ml-1 text-[10px] font-normal normal-case text-neutral-500">
                  (implied)
                </span>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
            <dt className="text-neutral-600">Earned</dt>
            <dd className="tabular-nums font-medium">${fmtUsd(summary.earned)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
            <dt className="text-neutral-600">Reimbursements</dt>
            <dd className="tabular-nums font-medium">${fmtUsd(summary.reimbursements)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
            <dt className="text-neutral-600">Total owed</dt>
            <dd className="tabular-nums font-semibold">${fmtUsd(summary.totalOwed)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
            <dt className="text-neutral-600">Paid</dt>
            <dd className="tabular-nums font-medium">${fmtUsd(summary.paid)}</dd>
          </div>
          <div className="col-span-2 flex justify-between gap-4 border-b border-black py-2">
            <dt className="font-medium">Balance</dt>
            <dd className="tabular-nums font-semibold">${fmtUsd(summary.balance)}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-600">
          Activity
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-neutral-600">
                Date
              </th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-neutral-600">
                Type
              </th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-neutral-600">
                Project
              </th>
              <th className="py-2 pl-2 text-right text-xs font-medium uppercase tracking-wide text-neutral-600 tabular-nums">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-xs text-neutral-500">
                  No activity this period.
                </td>
              </tr>
            ) : (
              report.rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-4 tabular-nums">{r.date}</td>
                  <td className="py-1.5 pr-4">{r.type}</td>
                  <td className="py-1.5 pr-4 text-neutral-700">{r.projectLabel}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{fmtSignedUsd(r.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <footer className="mt-auto grid grid-cols-1 gap-10 border-t border-black pt-8 sm:grid-cols-2 sm:gap-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
            {ps.companyName}
          </p>
          <div className="mt-12 border-b border-black" />
          <p className="mt-2 text-xs text-neutral-600">Authorized signature</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">Worker</p>
          <div className="mt-12 border-b border-black" />
          <p className="mt-2 text-xs text-neutral-600">Worker signature</p>
        </div>
      </footer>
    </div>
  );
}
