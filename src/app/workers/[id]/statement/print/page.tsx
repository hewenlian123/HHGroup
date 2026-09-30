import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { Button } from "@/components/ui/button";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { getProjects } from "@/lib/projects-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getWorkerByIdWithClient } from "@/lib/labor-db";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
import { getWorkerReimbursementsByWorkerId } from "@/lib/worker-reimbursements-db";
import { getWorkerAdvances } from "@/lib/worker-advances-db";
import { safeWorkerReturnPath, workerDetailReturnPath } from "@/lib/worker-return-path";

type WorkerStatementEarningRow = {
  date: string;
  projectId: string;
  projectName: string;
  shift: "AM" | "PM" | "OT";
  amount: number;
  notes: string | null;
};

function formatCurrency(amount: number): string {
  const clean = Math.abs(amount) < 0.005 ? 0 : amount;
  return clean.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function inStatementRange(date: string | null | undefined, start: string, end: string): boolean {
  const ymd = String(date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymd >= start && ymd <= end;
}

export default async function WorkerStatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ start?: string; end?: string; project?: string; returnTo?: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;
  const qs = (await searchParams) ?? {};
  const returnHref = safeWorkerReturnPath(qs.returnTo, workerDetailReturnPath(id, "statements"));
  const start = qs.start ?? new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = qs.end ?? new Date().toISOString().slice(0, 10);
  const project = qs.project || undefined;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return (
      <ServerDataLoadFallback
        message={SUPABASE_MISSING_SERVER_ENV_MESSAGE}
        backHref={`/workers/${id}`}
        backLabel="Back to worker"
      />
    );
  }

  let worker: Awaited<ReturnType<typeof getWorkerByIdWithClient>> | undefined;
  let company: Awaited<ReturnType<typeof fetchDocumentCompanyProfile>>;
  try {
    [worker, company] = await Promise.all([
      getWorkerByIdWithClient(supabase, id),
      fetchDocumentCompanyProfile(),
    ]);
  } catch (e) {
    logServerPageDataError(`workers/${id}/statement/print`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "worker statement")}
        backHref={`/workers/${id}`}
        backLabel="Back to worker"
      />
    );
  }
  if (!worker) notFound();

  let earningsRows: WorkerStatementEarningRow[] = [];
  let payments: Awaited<ReturnType<typeof getWorkerPaymentsWithClient>> = [];
  let reimbursementTotal = 0;
  let advanceTotal = 0;
  try {
    const [projects, entries, paymentRows, reimbursementRows, advanceRows] = await Promise.all([
      getProjects(supabase),
      getLaborEntriesWithJoins(
        { worker_id: id, date_from: start, date_to: end, project_id: project },
        supabase
      ),
      getWorkerPaymentsWithClient(supabase, { workerId: id, fromDate: start, toDate: end }),
      getWorkerReimbursementsByWorkerId(id, supabase),
      getWorkerAdvances({ workerId: id, fromDate: start, toDate: end }, supabase),
    ]);

    const projectMap = new Map(projects.map((p) => [p.id, p.name] as const));
    earningsRows = entries
      .map((row): WorkerStatementEarningRow | null => {
        if (!row.project_id) return null;
        const amount =
          Number(row.labor_cost_snapshot ?? row.amount_snapshot ?? row.cost_amount) || 0;
        if (amount <= 0) return null;
        return {
          date: row.work_date,
          projectId: row.project_id,
          projectName: projectMap.get(row.project_id) ?? row.project_name ?? row.project_id,
          shift: "OT",
          amount,
          notes: row.notes || null,
        };
      })
      .filter((row): row is WorkerStatementEarningRow => row != null)
      .sort((a, b) =>
        a.date === b.date ? a.shift.localeCompare(b.shift) : a.date.localeCompare(b.date)
      );
    payments = paymentRows;
    const paymentIdsInRange = new Set(paymentRows.map((row) => row.id));
    reimbursementTotal = reimbursementRows.reduce((sum, row) => {
      if (project && row.projectId !== project) return sum;
      const reimbDate = (row.reimbursementDate || row.createdAt.slice(0, 10)).slice(0, 10);
      const paidInRange = inStatementRange(row.paidAt, start, end);
      const settledByPaymentInRange = row.paymentId ? paymentIdsInRange.has(row.paymentId) : false;
      if (!inStatementRange(reimbDate, start, end) && !paidInRange && !settledByPaymentInRange) {
        return sum;
      }
      return sum + Math.max(0, Number(row.amount) || 0);
    }, 0);
    advanceTotal = advanceRows
      .filter((row) => String(row.status).toLowerCase() !== "cancelled")
      .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
  } catch (e) {
    logServerPageDataError(`workers/${id}/statement/print rows`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "statement data")}
        backHref={`/workers/${id}`}
        backLabel="Back to worker"
      />
    );
  }
  const earningsTotal = earningsRows.reduce((s, r) => s + r.amount, 0);
  const paymentTotal = payments.reduce((s, p) => s + p.amount, 0);
  const paidTotal = paymentTotal + advanceTotal;
  const totalOwed = earningsTotal + reimbursementTotal;
  const balance = totalOwed - paidTotal;

  const balanceIsSettled = Math.abs(balance) < 0.005;

  return (
    <div
      className="payroll-statement-print-root mx-auto min-h-screen bg-[var(--hh-surface)] px-6 py-8 text-[var(--hh-ink)] print:min-h-0 print:bg-white print:p-0"
      data-hh-context="document-route"
      data-hh-theme="document-light"
      style={{ maxWidth: "8.5in" }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild variant="outline" size="sm" className="min-h-11 rounded-hh-standard">
          <Link href={returnHref}>Back to Worker</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="min-h-11 rounded-hh-standard">
          <Link href="/workers">All workers</Link>
        </Button>
      </div>
      <SetBreadcrumbEntityTitle label={worker.name} />
      <DocumentCompanyHeader
        company={company}
        documentTitle="Worker Statement"
        documentNo={`WS-${id.replace(/-/g, "").slice(0, 12)}`}
        documentDate={end}
        documentNoLabel="Statement No"
      />
      <section className="mb-6 rounded-card border border-[var(--hh-line)] bg-[var(--hh-l0-canvas)] p-4 text-sm text-[var(--hh-text)] print:bg-white">
        <p className="font-semibold text-[var(--hh-ink)]">
          {worker.name}
          {worker.trade?.trim() ? ` · ${worker.trade.trim()}` : ""}
          {worker.phone?.trim() ? ` · ${worker.phone.trim()}` : ""}
        </p>
        <p className="mt-1 tabular-nums text-[var(--hh-muted)]">
          Period: {start} to {end}
        </p>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5 [break-inside:avoid]">
        <div className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-l0-canvas)] p-3 print:bg-white">
          <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Earned
          </p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(earningsTotal)}</p>
        </div>
        <div className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-l0-canvas)] p-3 print:bg-white">
          <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Reimbursements
          </p>
          <p className="text-lg font-semibold tabular-nums">
            ${formatCurrency(reimbursementTotal)}
          </p>
        </div>
        <div className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-l0-canvas)] p-3 print:bg-white">
          <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Advance Deductions
          </p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(advanceTotal)}</p>
        </div>
        <div className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-l0-canvas)] p-3 print:bg-white">
          <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Cash Paid
          </p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(paymentTotal)}</p>
        </div>
        <div
          className={`rounded-card border p-3 print:bg-white ${
            balanceIsSettled
              ? "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)]"
              : "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]"
          }`}
        >
          <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Balance
          </p>
          <p
            className={`text-lg font-semibold tabular-nums ${
              balanceIsSettled ? "text-[var(--hh-success)]" : "text-[var(--hh-danger)]"
            }`}
          >
            ${formatCurrency(balance)}
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
          Earnings detail
        </h2>
        <div className="overflow-hidden rounded-card border border-[var(--hh-line)]">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--hh-l0-canvas)] print:bg-white">
              <tr className="border-b border-[var(--hh-line)]">
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Project</th>
                <th className="px-3 py-2 text-left font-semibold">Shift</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {earningsRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-[var(--hh-muted)]">
                    No earnings for this period.
                  </td>
                </tr>
              ) : (
                earningsRows.map((row, idx) => (
                  <tr
                    key={`${row.date}-${row.projectId}-${row.shift}-${idx}`}
                    className="border-b border-[var(--hh-line)] last:border-b-0"
                  >
                    <td className="px-3 py-2 tabular-nums">{row.date}</td>
                    <td className="px-3 py-2">{row.projectName}</td>
                    <td className="px-3 py-2 text-[var(--hh-muted)]">{row.shift}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      ${formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
          Payments
        </h2>
        <div className="overflow-hidden rounded-card border border-[var(--hh-line)]">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--hh-l0-canvas)] print:bg-white">
              <tr className="border-b border-[var(--hh-line)]">
                <th className="px-3 py-2 text-left font-semibold">Payment Date</th>
                <th className="px-3 py-2 text-left font-semibold">Method</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Memo</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-[var(--hh-muted)]">
                    No cash payments for this period.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--hh-line)] last:border-b-0">
                    <td className="px-3 py-2 tabular-nums">{p.paymentDate}</td>
                    <td className="px-3 py-2">{p.paymentMethod ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      ${formatCurrency(p.amount)}
                    </td>
                    <td className="px-3 py-2 text-[var(--hh-muted)]">{p.notes ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 border-t border-[var(--hh-line)] pt-6 text-xs text-[var(--hh-muted)]">
        <p>This statement is for internal payroll tracking.</p>
      </footer>
    </div>
  );
}
