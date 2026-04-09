"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWorkers,
  getProjects,
  getDailyWorkEntriesInRange,
  getWorkerReimbursements,
  getWorkerInvoices,
  getLaborInvoices,
  getWorkerPayments,
  getWorkerAdvances,
  includeLaborInvoicesInProjectLabor,
  type DailyWorkEntry,
  type WorkerReimbursement,
  type WorkerInvoice,
} from "@/lib/data";
import {
  balanceStatusLabel,
  buildPayrollSummaryRows,
  type PayrollSummaryComputeRow,
} from "./compute-payroll-summary-rows";
import { PayWorkerModal } from "./pay-worker-modal";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { deleteWorkerAction } from "@/app/workers/actions";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import { useToast } from "@/components/toast/toast-provider";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type Row = PayrollSummaryComputeRow;

export default function PayrollSummaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const defaultFrom = startOfMonth.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = React.useState(defaultFrom);
  const [toDate, setToDate] = React.useState(today);
  const [projectId, setProjectId] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: keyof Omit<Row, "workerId">; dir: "asc" | "desc" }>(
    {
      key: "balance",
      dir: "desc",
    }
  );
  const [page, setPage] = React.useState(1);
  const pageSize = 12;

  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [payTarget, setPayTarget] = React.useState<Row | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [
        w,
        p,
        laborEntries,
        reimbursementsAll,
        invoicesAll,
        laborInvoicesAll,
        paymentsAll,
        advancesAll,
      ] = await Promise.all([
        getWorkers(),
        getProjects(),
        getDailyWorkEntriesInRange(fromDate, toDate),
        getWorkerReimbursements(),
        getWorkerInvoices(),
        getLaborInvoices(),
        getWorkerPayments({ fromDate, toDate }),
        getWorkerAdvances({ fromDate, toDate }),
      ]);
      setProjects(p);

      const projectFilter = projectId || null;

      const out = buildPayrollSummaryRows({
        fromDate,
        toDate,
        projectFilter,
        includeLaborInvoices: includeLaborInvoicesInProjectLabor,
        workers: w,
        laborEntries: laborEntries as DailyWorkEntry[],
        reimbursementsAll: reimbursementsAll as WorkerReimbursement[],
        workerInvoicesAll: invoicesAll as WorkerInvoice[],
        laborInvoicesAll,
        paymentsAll,
        advancesAll,
      });

      setRows(out);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.workerName.toLowerCase().includes(q)) : rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "workerName") return a.workerName.localeCompare(b.workerName) * dir;
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
    });
  }, [rows, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sort, fromDate, toDate, projectId]);

  const toggleSort = (key: keyof Omit<Row, "workerId">) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Payroll Summary"
        subtitle="Earned (labor + invoices) + reimbursements vs payments + advances in range."
        actions={
          <Link
            href="/labor"
            className="text-sm text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center"
          >
            Labor
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 border-b border-border/60 pb-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            From
          </label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 max-md:min-h-11 w-full sm:w-[152px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            To
          </label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 max-md:min-h-11 w-full sm:w-[152px]"
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Project
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 max-md:min-h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm lg:w-auto lg:min-w-[180px]"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1 lg:flex-1">
          <label className="sr-only">Search worker</label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search worker…"
            className="h-9 max-md:min-h-11 w-full min-w-0 lg:min-w-[180px]"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-1 lg:flex lg:justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-9 max-md:min-h-11 w-full lg:w-auto"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 md:hidden">
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No results.</p>
        ) : (
          paged.map((r) => (
            <div
              key={r.workerId}
              className="min-w-0 overflow-hidden rounded-sm border border-border/60 p-4"
            >
              <button
                type="button"
                className="w-full min-w-0 text-left"
                onClick={() => router.push(`/workers/${r.workerId}`)}
              >
                <span className="block min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline">
                  {r.workerName}
                </span>
              </button>
              <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs tabular-nums">
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Earned
                  </dt>
                  <dd className="min-w-0 break-words">{fmtUsd(r.earned)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Reimb.
                  </dt>
                  <dd className="min-w-0 break-words">{fmtUsd(r.reimbursements)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Should pay
                  </dt>
                  <dd className="min-w-0 break-words">{fmtUsd(r.shouldPay)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Paid
                  </dt>
                  <dd className="min-w-0 break-words">{fmtUsd(r.paid)}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Balance
                  </dt>
                  <dd className="min-w-0 font-medium text-foreground leading-snug">
                    <span className="block break-words">{fmtUsd(r.balance)}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                      {balanceStatusLabel(r.balance)}
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 max-md:min-h-11"
                  onClick={() => {
                    setPayTarget(r);
                    setPayOpen(true);
                  }}
                >
                  Pay Worker
                </Button>
                <RowActionsMenu
                  appearance="list"
                  ariaLabel={`Actions for ${r.workerName}`}
                  actions={[
                    { label: "View", onClick: () => router.push(`/workers/${r.workerId}`) },
                    { label: "Edit", onClick: () => router.push("/workers") },
                    {
                      label: "Delete",
                      onClick: async () => {
                        if (deletingId) return;
                        if (
                          !window.confirm(`Delete worker "${r.workerName}"? This cannot be undone.`)
                        )
                          return;
                        setDeletingId(r.workerId);
                        const res = await deleteWorkerAction(r.workerId);
                        if (!res.ok) {
                          toast({
                            title: "Delete failed",
                            description: res.error,
                            variant: "error",
                          });
                        } else {
                          toast({ title: "Deleted", variant: "success" });
                        }
                        setDeletingId(null);
                        await load();
                      },
                      destructive: true,
                      disabled: deletingId === r.workerId,
                    },
                  ]}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden border-b border-border/60 md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-x-0 border-spacing-y-1.5 text-sm lg:min-w-0">
            <thead>
              <tr className="border-b border-border/60">
                <th
                  className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => toggleSort("workerName")}
                >
                  Worker
                </th>
                <th
                  className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                  onClick={() => toggleSort("earned")}
                >
                  Earned
                </th>
                <th
                  className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                  onClick={() => toggleSort("reimbursements")}
                >
                  Reimbursements
                </th>
                <th
                  className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                  onClick={() => toggleSort("shouldPay")}
                >
                  Should Pay
                </th>
                <th
                  className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                  onClick={() => toggleSort("paid")}
                >
                  Paid
                </th>
                <th
                  className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                  onClick={() => toggleSort("balance")}
                >
                  Balance
                </th>
                <th className="w-28 px-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pay
                </th>
                <th className="w-12 px-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-b border-border/40">
                  <td colSpan={8} className="py-6 px-4 text-center text-muted-foreground text-xs">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr className="border-b border-border/40">
                  <td colSpan={8} className="py-6 px-4 text-center text-muted-foreground text-xs">
                    No results.
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr
                    key={r.workerId}
                    className={listTableRowClassName}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open ${r.workerName}`}
                    onClick={() => router.push(`/workers/${r.workerId}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/workers/${r.workerId}`);
                      }
                    }}
                  >
                    <td
                      className={cn(
                        "first:rounded-l-xl py-2 px-4 font-medium",
                        listTablePrimaryCellClassName
                      )}
                    >
                      {r.workerName}
                    </td>
                    <td
                      className={cn(
                        "py-2 px-4 text-right tabular-nums",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd(r.earned)}
                    </td>
                    <td
                      className={cn(
                        "py-2 px-4 text-right tabular-nums",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd(r.reimbursements)}
                    </td>
                    <td
                      className={cn(
                        "py-2 px-4 text-right tabular-nums",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd(r.shouldPay)}
                    </td>
                    <td
                      className={cn(
                        "py-2 px-4 text-right tabular-nums",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd(r.paid)}
                    </td>
                    <td
                      className={cn(
                        "py-2 px-3 text-right tabular-nums font-medium",
                        listTableAmountCellClassName
                      )}
                    >
                      <div>{fmtUsd(r.balance)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                        {balanceStatusLabel(r.balance)}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          setPayTarget(r);
                          setPayOpen(true);
                        }}
                      >
                        Pay Worker
                      </Button>
                    </td>
                    <td
                      className="last:rounded-r-xl py-2 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionsMenu
                        appearance="list"
                        ariaLabel={`Actions for ${r.workerName}`}
                        actions={[
                          { label: "View", onClick: () => router.push(`/workers/${r.workerId}`) },
                          { label: "Edit", onClick: () => router.push("/workers") },
                          {
                            label: "Delete",
                            onClick: async () => {
                              if (deletingId) return;
                              if (
                                !window.confirm(
                                  `Delete worker "${r.workerName}"? This cannot be undone.`
                                )
                              )
                                return;
                              setDeletingId(r.workerId);
                              const res = await deleteWorkerAction(r.workerId);
                              if (!res.ok) {
                                toast({
                                  title: "Delete failed",
                                  description: res.error,
                                  variant: "error",
                                });
                              } else {
                                toast({ title: "Deleted", variant: "success" });
                              }
                              setDeletingId(null);
                              await load();
                            },
                            destructive: true,
                            disabled: deletingId === r.workerId,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 text-sm text-muted-foreground max-md:[&_button]:min-h-11 sm:flex-row sm:items-center sm:justify-between">
        <span className="tabular-nums">
          {filtered.length === 0
            ? "0"
            : Math.min(filtered.length, (page - 1) * pageSize + 1).toString()}
          –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 sm:flex-none"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 sm:flex-none"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {payTarget ? (
        <PayWorkerModal
          open={payOpen}
          onOpenChange={setPayOpen}
          workerId={payTarget.workerId}
          workerName={payTarget.workerName}
          defaultAmount={Math.max(0, payTarget.balance)}
          onSuccess={load}
        />
      ) : null}
    </div>
  );
}
