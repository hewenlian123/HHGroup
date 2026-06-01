import { notFound } from "next/navigation";
import { getWorkerById } from "@/lib/data";
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
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
import { getWorkerReimbursementsByWorkerId } from "@/lib/worker-reimbursements-db";
import { getWorkerAdvances } from "@/lib/worker-advances-db";

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
  searchParams?: Promise<{ start?: string; end?: string; project?: string }>;
}) {
  const { id } = await params;
  const qs = (await searchParams) ?? {};
  const start = qs.start ?? new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = qs.end ?? new Date().toISOString().slice(0, 10);
  const project = qs.project || undefined;

  let worker: Awaited<ReturnType<typeof getWorkerById>> | undefined;
  let company: Awaited<ReturnType<typeof fetchDocumentCompanyProfile>>;
  try {
    [worker, company] = await Promise.all([getWorkerById(id), fetchDocumentCompanyProfile()]);
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

  return (
    <div className="min-h-screen bg-white text-black p-8 mx-auto" style={{ maxWidth: "8.5in" }}>
      <SetBreadcrumbEntityTitle label={worker.name} />
      <DocumentCompanyHeader
        company={company}
        documentTitle="Worker Statement"
        documentNo={`WS-${id.replace(/-/g, "").slice(0, 12)}`}
        documentDate={end}
        documentNoLabel="Statement No"
      />
      <section className="mb-6 text-sm text-zinc-800">
        <p className="font-medium text-zinc-900">
          {worker.name}
          {worker.trade?.trim() ? ` · ${worker.trade.trim()}` : ""}
          {worker.phone?.trim() ? ` · ${worker.phone.trim()}` : ""}
        </p>
        <p className="text-zinc-600 tabular-nums mt-1">
          Period: {start} to {end}
        </p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 text-sm">
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Gross Labor</p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(earningsTotal)}</p>
        </div>
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Reimbursements</p>
          <p className="text-lg font-semibold tabular-nums">
            ${formatCurrency(reimbursementTotal)}
          </p>
        </div>
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Advance Deductions</p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(advanceTotal)}</p>
        </div>
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Payments</p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(paymentTotal)}</p>
        </div>
        <div className="border border-zinc-300 rounded-lg p-3">
          <p className="text-zinc-500">Balance</p>
          <p className="text-lg font-semibold tabular-nums">${formatCurrency(balance)}</p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Earnings detail
        </h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-300">
              <th className="text-left py-2 font-semibold">Date</th>
              <th className="text-left py-2 font-semibold">Project</th>
              <th className="text-left py-2 font-semibold">Shift</th>
              <th className="text-right py-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {earningsRows.map((row, idx) => (
              <tr
                key={`${row.date}-${row.projectId}-${row.shift}-${idx}`}
                className="border-b border-zinc-200"
              >
                <td className="py-2">{row.date}</td>
                <td className="py-2">{row.projectName}</td>
                <td className="py-2">{row.shift}</td>
                <td className="py-2 text-right tabular-nums">${formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Payments
        </h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-300">
              <th className="text-left py-2 font-semibold">Payment Date</th>
              <th className="text-left py-2 font-semibold">Method</th>
              <th className="text-right py-2 font-semibold">Amount</th>
              <th className="text-left py-2 font-semibold">Memo</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-zinc-200">
                <td className="py-2">{p.paymentDate}</td>
                <td className="py-2">{p.paymentMethod ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">${formatCurrency(p.amount)}</td>
                <td className="py-2">{p.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-10 pt-6 border-t border-zinc-200 text-xs text-zinc-500">
        <p>This statement is for internal payroll tracking.</p>
      </footer>
    </div>
  );
}
