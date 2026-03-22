import Link from "next/link";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getLaborEntriesWithJoins, getLaborPaymentsByDateRange, getWorkers } from "@/lib/data";
import { MonthlyLaborMonthSelect } from "./monthly-month-select";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthBounds(month: string): { dateFrom: string; dateTo: string } {
  const [y, m] = month.split("-").map(Number);
  const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { dateFrom, dateTo };
}

type Props = { searchParams: Promise<{ month?: string }> };

export default async function MonthlyLaborPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : getDefaultMonth();
  const { dateFrom, dateTo } = monthBounds(month);

  const [entries, payments, workersList] = await Promise.all([
    getLaborEntriesWithJoins({ date_from: dateFrom, date_to: dateTo }),
    getLaborPaymentsByDateRange(dateFrom, dateTo),
    getWorkers(),
  ]);
  const workerNameMap = new Map(workersList.map((w) => [w.id, w.name]));
  const hourlyRateMap = new Map(workersList.map((w) => [w.id, (w.halfDayRate ?? 0) / 4]));
  const entryAmount = (workerId: string, hours: number) =>
    (hourlyRateMap.get(workerId) ?? 0) * hours;

  const totalEarned = entries.reduce((s, e) => s + entryAmount(e.worker_id, e.hours), 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = totalEarned - totalPaid;

  const earnedByWorker = entries.reduce(
    (acc, e) => {
      const k = e.worker_id;
      if (!acc[k]) acc[k] = { worker_name: e.worker_name ?? "—", earned: 0 };
      acc[k].earned += entryAmount(e.worker_id, e.hours);
      return acc;
    },
    {} as Record<string, { worker_name: string; earned: number }>
  );
  const paidByWorker = payments.reduce(
    (acc, p) => {
      acc[p.worker_id] = (acc[p.worker_id] ?? 0) + p.amount;
      return acc;
    },
    {} as Record<string, number>
  );
  const workerIds = new Set([...Object.keys(earnedByWorker), ...Object.keys(paidByWorker)]);
  const byWorkerRows = Array.from(workerIds)
    .map((worker_id) => {
      const e = earnedByWorker[worker_id];
      const paid = paidByWorker[worker_id] ?? 0;
      const earned = e?.earned ?? 0;
      const worker_name = e?.worker_name ?? workerNameMap.get(worker_id) ?? "—";
      return {
        worker_id,
        worker_name,
        earned,
        paid,
        balance: earned - paid,
      };
    })
    .sort((a, b) => a.worker_name.localeCompare(b.worker_name));

  const byProject = entries.reduce(
    (acc, e) => {
      if (e.project_id) {
        const id = e.project_id;
        const name = e.project_name ?? "—";
        if (!acc[id]) acc[id] = { project_name: name, total: 0 };
        acc[id].total += entryAmount(e.worker_id, e.hours);
      }
      return acc;
    },
    {} as Record<string, { project_name: string; total: number }>
  );
  const byProjectRows = Object.entries(byProject)
    .map(([project_id, v]) => ({
      project_id,
      project_name: v.project_name,
      total: v.total,
    }))
    .sort((a, b) => a.project_name.localeCompare(b.project_name));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Monthly Labor"
          description="Earnings, payments, and outstanding by month."
          actions={
            <Link href="/labor" className="text-sm text-muted-foreground hover:text-foreground">
              Labor
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Month" action={<MonthlyLaborMonthSelect value={month} />} />
      <Divider />

      {/* Summary */}
      <div className="space-y-0 border-b border-border/60">
        <div className="flex items-baseline justify-between py-3 border-b border-border/40">
          <span className="text-sm text-muted-foreground">Total Earned</span>
          <span className="text-xl font-medium tabular-nums">${fmtUsd(totalEarned)}</span>
        </div>
        <div className="flex items-baseline justify-between py-3 border-b border-border/40">
          <span className="text-sm text-muted-foreground">Total Paid</span>
          <span className="text-xl font-medium tabular-nums">${fmtUsd(totalPaid)}</span>
        </div>
        <div className="flex items-baseline justify-between py-3 border-b border-border/40">
          <span className="text-sm text-muted-foreground">Outstanding</span>
          <span
            className={`text-xl font-medium tabular-nums ${
              outstanding > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
            }`}
          >
            ${fmtUsd(outstanding)}
          </span>
        </div>
      </div>
      <Divider />

      {/* By Worker */}
      <SectionHeader label="By Worker" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Earned
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Paid
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {byWorkerRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No data for this month.
                </td>
              </tr>
            ) : (
              byWorkerRows.map((r) => (
                <tr key={r.worker_id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">{r.worker_name}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.earned)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.paid)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      {/* By Project */}
      <SectionHeader label="By Project" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Total Labor Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {byProjectRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={2} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No labor for this month.
                </td>
              </tr>
            ) : (
              byProjectRows.map((r) => (
                <tr key={r.project_id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">{r.project_name}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
