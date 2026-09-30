"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageLayout, PageHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { sectionCardClass } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/system-state";
import { LaborReadState } from "@/components/labor/labor-read-state";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";
import type { WorkerBalanceRow } from "@/lib/worker-balances-list";
import type { WorkerPayment } from "@/lib/worker-payments-db";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";

type Option = { id: string; name: string };
type TimeRead = { entries: LaborEntryWithJoins[]; workers: Option[]; projects: Option[] };
const panel = cn(sectionCardClass, "min-w-0 p-4");
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Labor records unavailable.");
  return response.json() as Promise<T>;
}
function WorkspaceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="hh-focus-ring inline-flex min-h-11 items-center text-sm font-medium text-[var(--hh-link)] underline underline-offset-4"
    >
      {children}
    </Link>
  );
}
export function LaborOverview() {
  const [data, setData] = React.useState<{
    workers: (Option & { status: string })[];
    time: TimeRead;
    balances: WorkerBalanceRow[];
    payments: WorkerPayment[];
    reimbursements: WorkerReimbursement[];
  } | null>(null);
  const [busy, setBusy] = React.useState(true);
  const generation = React.useRef(0);
  const today = workerRateLocalYmd();
  const from = `${today.slice(0, 7)}-01`;
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    setData(null);
    try {
      const [workers, time, balances, payments, reimbursements] = await Promise.all([
        read<(Option & { status: string })[]>("/api/labor/workers"),
        read<TimeRead>(`/api/labor/entries?view=joined&dateFrom=${from}&dateTo=${today}`),
        read<{ balances: WorkerBalanceRow[] }>("/api/labor/worker-balances"),
        read<{ payments: WorkerPayment[] }>("/api/labor/worker-payments?limit=5"),
        read<{ reimbursements: WorkerReimbursement[] }>("/api/worker-reimbursements"),
      ]);
      if (
        ![
          workers,
          time.entries,
          balances.balances,
          payments.payments,
          reimbursements.reimbursements,
        ].every(Array.isArray)
      )
        throw new Error("Incomplete Labor records.");
      if (generation.current === current)
        setData({
          workers,
          time,
          balances: balances.balances,
          payments: payments.payments,
          reimbursements: reimbursements.reimbursements,
        });
    } catch {
      if (generation.current === current) setData(null);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }, [from, today]);
  React.useEffect(() => {
    void load();
  }, [load]);
  useOnAppSync(load, [load]);
  const outstanding = data?.balances.filter((row) => row.balance > 0) ?? [];
  const pending = data?.reimbursements.filter((row) => row.status === "pending") ?? [];
  const recent = [...(data?.time.entries ?? [])]
    .sort((a, b) => b.work_date.localeCompare(a.work_date))
    .slice(0, 5);
  return (
    <PageLayout
      frame="list"
      header={
        <PageHeader
          variant="workspace"
          title="Labor Overview"
          description="Workers, recent time, outstanding balances, and work needing attention."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild className="min-h-11">
                <Link href="/workers">Workers</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/labor?addDaily=1">Add Time Entry</Link>
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => void load()}
                disabled={busy}
              >
                Refresh
              </Button>
            </div>
          }
        />
      }
    >
      {busy || !data ? (
        <LaborReadState title="Labor overview" busy={busy} retry={() => void load()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Active workers",
                value: String(
                  data.workers.filter((worker) => worker.status.toLowerCase() === "active").length
                ),
                href: "/workers",
              },
              {
                label: "Time entries this month",
                value: String(data.time.entries.length),
                href: "/labor/entries",
              },
              {
                label: "Outstanding balances",
                value: formatOverviewMoney(outstanding.reduce((sum, row) => sum + row.balance, 0)),
                href: "/labor/worker-balances",
              },
              {
                label: "Pending reimbursements",
                value: String(pending.length),
                href: "/labor/reimbursements",
              },
            ].map((item) => (
              <div className={panel} key={item.label}>
                <p className="text-sm text-[var(--hh-muted)]">{item.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
                <WorkspaceLink href={item.href}>Review</WorkspaceLink>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={panel}>
              <h2 className="text-base font-semibold">Needs attention</h2>
              {outstanding.length === 0 && pending.length === 0 ? (
                <p className="py-3 text-sm">No outstanding balances or pending reimbursements.</p>
              ) : (
                <ul className="divide-y divide-[var(--hh-line)]">
                  {outstanding.slice(0, 5).map((row) => (
                    <li
                      key={row.workerId}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <WorkspaceLink
                        href={`/workers/${row.workerId}?tab=balance&returnTo=%2Flabor%2Foverview`}
                      >
                        {row.workerName}
                      </WorkspaceLink>
                      <span className="tabular-nums">{formatOverviewMoney(row.balance)}</span>
                    </li>
                  ))}
                  {pending.length > 0 && (
                    <li>
                      <WorkspaceLink href="/labor/reimbursements">
                        Review {pending.length} pending reimbursements
                      </WorkspaceLink>
                    </li>
                  )}
                </ul>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hh-line)] pt-2">
                <WorkspaceLink href="/labor/advances">Open advances</WorkspaceLink>
                <span className="tabular-nums">
                  {formatOverviewMoney(data.balances.reduce((sum, row) => sum + row.advances, 0))}
                </span>
              </div>
            </section>
            <section className={panel}>
              <h2 className="text-base font-semibold">Recent time</h2>
              <p className="text-sm text-[var(--hh-muted)]">
                {formatDate(from)} – {formatDate(today)}
              </p>
              {recent.length === 0 ? (
                <p className="py-3 text-sm">No time entries this month.</p>
              ) : (
                <ul className="divide-y divide-[var(--hh-line)]">
                  {recent.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                      <WorkspaceLink
                        href={`/workers/${row.worker_id}?tab=work&entryId=${row.id}&projectId=${row.project_id ?? ""}&returnTo=%2Flabor%2Foverview`}
                      >
                        {row.worker_name ?? row.worker_id}
                      </WorkspaceLink>
                      <span className="text-sm">
                        {row.project_name ?? "Unattributed"} · {formatDate(row.work_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <WorkspaceLink href="/labor/entries">All time entries</WorkspaceLink>
            </section>
            <section className={panel}>
              <h2 className="text-base font-semibold">Recent labor payments</h2>
              {data.payments.length === 0 ? (
                <p className="py-3 text-sm">No labor payments recorded.</p>
              ) : (
                <ul className="divide-y divide-[var(--hh-line)]">
                  {data.payments.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                      <WorkspaceLink
                        href={`/workers/${row.workerId}?tab=payments&returnTo=%2Flabor%2Foverview`}
                      >
                        {data.workers.find((worker) => worker.id === row.workerId)?.name ??
                          row.workerId}
                      </WorkspaceLink>
                      <span className="text-sm tabular-nums">
                        {formatDate(row.paymentDate)} · {formatOverviewMoney(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <WorkspaceLink href="/labor/payments">Payment history</WorkspaceLink>
            </section>
            <section className={panel}>
              <h2 className="text-base font-semibold">Payroll summary</h2>
              <p className="mt-2 text-sm text-[var(--hh-muted)]">
                Review earned labor, reimbursements, paid amounts, and balances for the selected
                payroll period.
              </p>
              <WorkspaceLink href="/labor/payroll">Open Payroll Summary</WorkspaceLink>
            </section>
          </div>
        </>
      )}
    </PageLayout>
  );
}
export function LaborCosts() {
  const search = useSearchParams();
  const [data, setData] = React.useState<TimeRead | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [attempt, setAttempt] = React.useState(0);
  const [options, setOptions] = React.useState<{ workers: Option[]; projects: Option[] }>({
    workers: [],
    projects: [],
  });
  const [worker, setWorker] = React.useState(search.get("workerId") ?? "");
  const [project, setProject] = React.useState(
    search.get("projectId") ?? search.get("project_id") ?? ""
  );
  const [from, setFrom] = React.useState(`${workerRateLocalYmd().slice(0, 7)}-01`);
  const [to, setTo] = React.useState(workerRateLocalYmd());
  const routeWorker = search.get("workerId") ?? "";
  const routeProject = search.get("projectId") ?? search.get("project_id") ?? "";
  React.useEffect(() => {
    setWorker(routeWorker);
    setProject(routeProject);
  }, [routeWorker, routeProject]);
  const reload = React.useCallback(() => setAttempt((value) => value + 1), []);
  useOnAppSync(reload, [reload]);
  React.useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setData(null);
    const query = new URLSearchParams({ view: "joined", dateFrom: from, dateTo: to });
    if (worker) query.set("workerId", worker);
    if (project) query.set("projectId", project);
    read<TimeRead>(`/api/labor/entries?${query}`)
      .then((result) => {
        if (
          !Array.isArray(result.entries) ||
          !Array.isArray(result.workers) ||
          !Array.isArray(result.projects) ||
          result.entries.some((row) => row.cost_amount == null || !Number.isFinite(row.cost_amount))
        )
          throw new Error("Labor cost unavailable.");
        if (!cancelled) {
          setData(result);
          setOptions({ workers: result.workers, projects: result.projects });
        }
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, worker, project, attempt]);
  return (
    <PageLayout
      frame="list"
      header={
        <PageHeader
          variant="workspace"
          title="Labor Costs"
          description="Stored labor entry costs by worker, project, and period."
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          From
          <Input
            aria-label="Cost period from"
            className="min-h-11"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          To
          <Input
            aria-label="Cost period to"
            className="min-h-11"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Worker
          <Select
            aria-label="Cost worker"
            className="min-h-11"
            value={worker}
            onChange={(event) => setWorker(event.target.value)}
          >
            <option value="">All workers</option>
            {options.workers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Project
          <Select
            aria-label="Cost project"
            className="min-h-11"
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            <option value="">All projects</option>
            {options.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {busy || !data ? (
        <LaborReadState title="Labor costs" busy={busy} retry={reload} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={panel}>
              <p>Recorded cost · all entry statuses</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatOverviewMoney(data.entries.reduce((sum, row) => sum + row.cost_amount!, 0))}
              </p>
            </div>
            <div className={panel}>
              <p>Approved / Locked entry cost</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatOverviewMoney(
                  data.entries
                    .filter((row) => row.status === "Approved" || row.status === "Locked")
                    .reduce((sum, row) => sum + row.cost_amount!, 0)
                )}
              </p>
            </div>
          </div>
          {data.entries.length === 0 ? (
            <EmptyState
              title="No labor costs in this period"
              description="Choose another worker, project, or date range."
            />
          ) : (
            <ul className={cn(panel, "divide-y divide-[var(--hh-line)]")}>
              {data.entries.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <WorkspaceLink
                      href={`/workers/${row.worker_id}?tab=work&entryId=${row.id}&projectId=${row.project_id ?? ""}&returnTo=%2Flabor%2Fcosts`}
                    >
                      {row.worker_name ?? row.worker_id}
                    </WorkspaceLink>
                    <p className="break-words text-sm text-[var(--hh-muted)]">
                      {row.project_name ?? "Unattributed"} · {formatDate(row.work_date)} ·{" "}
                      {row.status}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatOverviewMoney(row.cost_amount!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-4">
        <WorkspaceLink href="/labor/entries">Time Entries</WorkspaceLink>
        <WorkspaceLink href="/labor/cost-allocation">Legacy project cost allocation</WorkspaceLink>
      </div>
    </PageLayout>
  );
}
