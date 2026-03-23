"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getWorkerById,
  getWorkerUsage,
  getLaborEntriesWithJoins,
  getWorkerInvoices,
  getWorkerPayments,
  type WorkerInvoice,
} from "@/lib/data";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { formatLaborEntrySessionLabel } from "@/lib/daily-labor-db";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function monthKeyFromDate(workDate: string): string {
  return workDate.slice(0, 7);
}

function monthLabelEn(key: string): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function entryEarned(e: Pick<LaborEntryWithJoins, "cost_amount">): number {
  return Number(e.cost_amount ?? 0) || 0;
}

function buildMonthlyTotals(entries: LaborEntryWithJoins[]) {
  const map = new Map<string, { count: number; earned: number }>();
  for (const e of entries) {
    const k = monthKeyFromDate(e.work_date);
    const cur = map.get(k) ?? { count: 0, earned: 0 };
    cur.count += 1;
    cur.earned += entryEarned(e);
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([monthKey, v]) => ({
      monthKey,
      label: monthLabelEn(monthKey),
      workDays: v.count,
      earned: v.earned,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function buildProjectTotals(entries: LaborEntryWithJoins[]) {
  const map = new Map<string, { name: string; count: number; earned: number }>();
  for (const e of entries) {
    const pid = e.project_id ?? "";
    const name = e.project_name?.trim() ? e.project_name : pid ? "(Unknown project)" : "—";
    const cur = map.get(pid) ?? { name, count: 0, earned: 0 };
    cur.count += 1;
    cur.earned += entryEarned(e);
    if (cur.name === "—" && name !== "—") cur.name = name;
    map.set(pid, cur);
  }
  return Array.from(map.entries())
    .map(([projectId, v]) => ({
      projectId,
      projectName: v.name,
      workDays: v.count,
      earned: v.earned,
    }))
    .sort((a, b) => b.earned - a.earned);
}

function groupEntriesByProjectForMonth(entries: LaborEntryWithJoins[]) {
  const map = new Map<string, LaborEntryWithJoins[]>();
  for (const e of entries) {
    const pid = e.project_id ?? "";
    const list = map.get(pid) ?? [];
    list.push(e);
    map.set(pid, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.work_date.localeCompare(b.work_date) || a.id.localeCompare(b.id));
  }
  return Array.from(map.entries())
    .map(([projectId, list]) => ({
      projectId,
      projectName: list[0]?.project_name?.trim()
        ? list[0].project_name!
        : projectId
          ? "(Unknown project)"
          : "—",
      entries: list,
      earned: list.reduce((s, x) => s + entryEarned(x), 0),
    }))
    .sort((a, b) => b.earned - a.earned);
}

export default function WorkerDashboardPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [worker, setWorker] = React.useState<Awaited<ReturnType<typeof getWorkerById>> | undefined>(
    undefined
  );
  const [usage, setUsage] = React.useState<Awaited<ReturnType<typeof getWorkerUsage>> | null>(null);
  const [laborLedgerEntries, setLaborLedgerEntries] = React.useState<LaborEntryWithJoins[] | null>(
    null
  );
  const [expandedMonthKey, setExpandedMonthKey] = React.useState<string | null>(null);

  const [financialSummary, setFinancialSummary] = React.useState<{
    totalLabor: number;
    totalReimbursements: number;
    totalWorkerInvoices: number;
    totalPayments: number;
    balance: number;
  } | null>(null);

  const [monthly, setMonthly] = React.useState<{
    earned: number;
    paid: number;
    outstanding: number;
    from: string;
    to: string;
  } | null>(null);

  const refreshAll = React.useCallback(async () => {
    if (!id) return;
    const [w, u] = await Promise.all([getWorkerById(id), getWorkerUsage(id)]);
    setWorker(w);
    setUsage(u);
    if (w) {
      const ledger = await getLaborEntriesWithJoins({ worker_id: id }).catch(
        () => [] as LaborEntryWithJoins[]
      );
      setLaborLedgerEntries(ledger);

      try {
        const r = await fetch(`/api/labor/workers/${id}/financial-summary`);
        const data = r.ok ? await r.json() : null;
        if (data && typeof data.totalLabor === "number") setFinancialSummary(data);
        else setFinancialSummary(null);
      } catch {
        setFinancialSummary(null);
      }

      const start = new Date();
      start.setDate(1);
      const from = start.toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      try {
        const [invoicesAll, payments] = await Promise.all([
          getWorkerInvoices().catch(() => [] as WorkerInvoice[]),
          getWorkerPayments({ workerId: id, fromDate: from, toDate: to, limit: 500 }).catch(
            () => []
          ),
        ]);
        let labor = 0;
        for (const e of ledger) {
          if (e.work_date < from || e.work_date > to) continue;
          labor += Number(e.cost_amount ?? 0) || 0;
        }
        let inv = 0;
        for (const x of invoicesAll as WorkerInvoice[]) {
          if (x.workerId !== id) continue;
          const d = x.createdAt?.slice(0, 10) ?? "";
          if (d < from || d > to) continue;
          inv += Number(x.amount) || 0;
        }
        let paid = 0;
        for (const p of payments) {
          paid += Number(p.amount) || 0;
        }
        const earned = labor + inv;
        setMonthly({ earned, paid, outstanding: earned - paid, from, to });
      } catch {
        setMonthly(null);
      }
    } else {
      setFinancialSummary(null);
      setMonthly(null);
      setLaborLedgerEntries(null);
    }
  }, [id]);

  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useOnAppSync(
    React.useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
    [refreshAll]
  );

  useBreadcrumbEntityLabel(worker?.name);

  const monthlyTotals = React.useMemo(() => {
    if (!laborLedgerEntries) return [];
    return buildMonthlyTotals(laborLedgerEntries);
  }, [laborLedgerEntries]);

  const projectTotalsAll = React.useMemo(() => {
    if (!laborLedgerEntries) return [];
    return buildProjectTotals(laborLedgerEntries);
  }, [laborLedgerEntries]);

  const expandedMonthEntries = React.useMemo(() => {
    if (!laborLedgerEntries || !expandedMonthKey) return [];
    const inMonth = laborLedgerEntries.filter(
      (e) => monthKeyFromDate(e.work_date) === expandedMonthKey
    );
    return groupEntriesByProjectForMonth(inMonth);
  }, [laborLedgerEntries, expandedMonthKey]);

  const toggleMonth = (key: string) => {
    setExpandedMonthKey((prev) => (prev === key ? null : key));
  };

  if (!id) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  if (worker === undefined) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <p className="text-muted-foreground">Loading…</p>
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  if (worker === null) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const usageRes = usage ?? { used: false };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        title={worker.name}
        description="Worker dashboard — labor ledger, financial overview, and quick links."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/workers">
              <Button variant="outline" size="sm" className="rounded-sm">
                Back
              </Button>
            </Link>
            <Link href={`/workers/${id}/edit`}>
              <Button size="sm" className="rounded-sm">
                Edit Profile
              </Button>
            </Link>
            <Link href={`/workers/${id}/statement`}>
              <Button variant="outline" size="sm" className="rounded-sm">
                Statement
              </Button>
            </Link>
          </div>
        }
      />

      <section className="border-b border-border/60 pb-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Profile
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="font-medium">{worker.phone?.trim() ? worker.phone : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trade</dt>
            <dd className="font-medium">{worker.trade?.trim() ? worker.trade : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Half-day rate</dt>
            <dd className="font-medium tabular-nums">{fmtUsd(worker.halfDayRate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium capitalize">{worker.status}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-foreground/90">
              {worker.notes?.trim() ? worker.notes : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            Created: {worker.createdAt}
            {usageRes.used ? " · Used in labor records" : " · Not used yet"}
          </div>
        </dl>
      </section>

      <section className="border-b border-border/60 pb-4">
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Labor ledger
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          From labor entries: work days = row count per period; earned = sum of{" "}
          <code className="text-[11px]">cost_amount</code>.
        </p>
        {laborLedgerEntries === null ? (
          <p className="text-sm text-muted-foreground">Loading labor…</p>
        ) : laborLedgerEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labor entries for this worker.</p>
        ) : (
          <div className="space-y-8">
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">Monthly totals</h3>
              <div className="table-responsive -mx-1">
                <table className="w-full min-w-[360px] border-collapse text-sm table-row-compact md:min-w-0">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Month
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Work days
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Earned
                      </th>
                      <th className="w-10 px-1" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTotals.map((row) => {
                      const open = expandedMonthKey === row.monthKey;
                      return (
                        <React.Fragment key={row.monthKey}>
                          <tr
                            className="cursor-pointer border-b border-border/40 hover:bg-muted/10"
                            onClick={() => toggleMonth(row.monthKey)}
                          >
                            <td className="px-2 py-1.5 font-medium">{row.label}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                              {row.workDays}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                              {fmtUsd(row.earned)}
                            </td>
                            <td className="px-1 py-1.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-sm p-0"
                                aria-expanded={open}
                                aria-label={open ? `Collapse ${row.label}` : `Expand ${row.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMonth(row.monthKey);
                                }}
                              >
                                <ChevronRight
                                  className={cn(
                                    "h-4 w-4 transition-transform",
                                    open && "rotate-90"
                                  )}
                                  aria-hidden
                                />
                              </Button>
                            </td>
                          </tr>
                          {open ? (
                            <tr className="border-b border-border/40">
                              <td colSpan={4} className="px-2 py-3 align-top">
                                <p className="mb-3 text-xs text-muted-foreground">
                                  By project — date, session (Full / Half / Absent; not raw hours),
                                  amount ({row.label})
                                </p>
                                {expandedMonthEntries.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No rows.</p>
                                ) : (
                                  <div className="space-y-4">
                                    {expandedMonthEntries.map((grp) => (
                                      <div
                                        key={grp.projectId || "none"}
                                        className="border-b border-border/50 pb-3 last:border-0 last:pb-0"
                                      >
                                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                          {grp.projectName}
                                        </p>
                                        <table className="w-full border-collapse text-sm table-row-compact">
                                          <thead>
                                            <tr className="border-b border-border/50">
                                              <th className="py-1.5 pr-3 text-left text-xs font-medium text-muted-foreground">
                                                Date
                                              </th>
                                              <th className="py-1.5 pr-3 text-left text-xs font-medium text-muted-foreground">
                                                Session
                                              </th>
                                              <th className="py-1.5 text-right text-xs font-medium text-muted-foreground">
                                                Amount
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {grp.entries.map((e) => (
                                              <tr key={e.id} className="border-b border-border/30">
                                                <td className="py-1 pr-3 tabular-nums text-muted-foreground">
                                                  {e.work_date}
                                                </td>
                                                <td className="py-1 pr-3">
                                                  {formatLaborEntrySessionLabel(e.notes, e.hours, {
                                                    costAmount: entryEarned(e),
                                                    dailyRate: worker.dailyRate,
                                                    halfDayRate: worker.halfDayRate,
                                                    morning: e.morning,
                                                    afternoon: e.afternoon,
                                                  })}
                                                </td>
                                                <td className="py-1 text-right tabular-nums">
                                                  {fmtUsd(entryEarned(e))}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium text-foreground">Project totals</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                All time, by project · sorted by earned (high → low).
              </p>
              {projectTotalsAll.length === 0 ? (
                <p className="text-sm text-muted-foreground">No project breakdown.</p>
              ) : (
                <div className="table-responsive -mx-1">
                  <table className="w-full min-w-[360px] border-collapse text-sm table-row-compact md:min-w-0">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Project
                        </th>
                        <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Work days
                        </th>
                        <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Earned
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectTotalsAll.map((row) => (
                        <tr
                          key={row.projectId || "none"}
                          className="border-b border-border/40 hover:bg-muted/10"
                        >
                          <td className="px-2 py-1.5 font-medium">{row.projectName}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {row.workDays}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {fmtUsd(row.earned)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {financialSummary !== null ? (
        <section className="border-b border-border/60 pb-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Financial summary
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            All-time totals (labor, reimbursements, invoices, payments).
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
            <div>
              <span className="text-muted-foreground">Total Labor</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.totalLabor)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Reimbursements</span>
              <p className="font-medium tabular-nums">
                {fmtUsd(financialSummary.totalReimbursements)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Worker Invoices</span>
              <p className="font-medium tabular-nums">
                {fmtUsd(financialSummary.totalWorkerInvoices)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Payments</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.totalPayments)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Balance</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.balance)}</p>
            </div>
          </div>
        </section>
      ) : null}

      {monthly ? (
        <section className="border-b border-border/60 pb-4">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            This month
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {monthly.from} — {monthly.to}: labor (entries) + worker invoices vs worker payments.
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Earned</span>
              <p className="font-medium tabular-nums">{fmtUsd(monthly.earned)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Paid</span>
              <p className="font-medium tabular-nums">{fmtUsd(monthly.paid)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Outstanding</span>
              <p
                className={
                  monthly.outstanding > 0.005
                    ? "font-medium tabular-nums text-destructive"
                    : "font-medium tabular-nums"
                }
              >
                {fmtUsd(monthly.outstanding)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/workers/summary" className="underline-offset-4 hover:underline">
              Worker Summary
            </Link>{" "}
            for all workers and custom date ranges.
          </p>
        </section>
      ) : null}
    </div>
  );
}
