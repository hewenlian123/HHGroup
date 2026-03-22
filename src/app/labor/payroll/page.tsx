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
  totalPayForEntry,
  type DailyWorkEntry,
  type WorkerReimbursement,
  type WorkerInvoice,
} from "@/lib/data";
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

type Row = {
  workerId: string;
  workerName: string;
  laborPay: number;
  reimbursements: number;
  invoices: number;
  totalPayable: number;
};

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
      key: "totalPayable",
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
      const [w, p, laborEntries, reimbursementsAll, invoicesAll] = await Promise.all([
        getWorkers(),
        getProjects(),
        getDailyWorkEntriesInRange(fromDate, toDate),
        getWorkerReimbursements(),
        getWorkerInvoices(),
      ]);
      setProjects(p);

      const projectFilter = projectId || null;

      const labor = (laborEntries as DailyWorkEntry[]).filter((e) =>
        projectFilter ? e.projectId === projectFilter : true
      );

      const reimbursements = (reimbursementsAll as WorkerReimbursement[]).filter((r) => {
        if (projectFilter && r.projectId !== projectFilter) return false;
        // createdAt is timestamptz; compare date prefix
        const d = r.createdAt?.slice(0, 10) ?? "";
        if (d && (d < fromDate || d > toDate)) return false;
        return String(r.status ?? "").toLowerCase() !== "paid";
      });

      const invoices = (invoicesAll as WorkerInvoice[]).filter((inv) => {
        if (projectFilter && inv.projectId !== projectFilter) return false;
        const d = inv.createdAt?.slice(0, 10) ?? "";
        if (d && (d < fromDate || d > toDate)) return false;
        return String(inv.status ?? "").toLowerCase() !== "paid";
      });

      const workerNameById = new Map(w.map((x) => [x.id, x.name] as const));

      const laborSum = new Map<string, number>();
      for (const e of labor) {
        laborSum.set(e.workerId, (laborSum.get(e.workerId) ?? 0) + totalPayForEntry(e));
      }

      const reimbSum = new Map<string, number>();
      for (const r of reimbursements) {
        reimbSum.set(r.workerId, (reimbSum.get(r.workerId) ?? 0) + (Number(r.amount) || 0));
      }

      const invSum = new Map<string, number>();
      for (const inv of invoices) {
        invSum.set(inv.workerId, (invSum.get(inv.workerId) ?? 0) + (Number(inv.amount) || 0));
      }

      const allWorkerIds = new Set<string>([
        ...Array.from(laborSum.keys()),
        ...Array.from(reimbSum.keys()),
        ...Array.from(invSum.keys()),
      ]);

      const out: Row[] = Array.from(allWorkerIds).map((workerId) => {
        const laborPay = laborSum.get(workerId) ?? 0;
        const reimbursementsAmt = reimbSum.get(workerId) ?? 0;
        const invoicesAmt = invSum.get(workerId) ?? 0;
        return {
          workerId,
          workerName: workerNameById.get(workerId) ?? workerId,
          laborPay,
          reimbursements: reimbursementsAmt,
          invoices: invoicesAmt,
          totalPayable: laborPay + reimbursementsAmt + invoicesAmt,
        };
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
        subtitle="Labor pay + unpaid reimbursements + unpaid worker invoices."
        actions={
          <Link href="/labor" className="text-sm text-muted-foreground hover:text-foreground">
            Labor
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          From
        </label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-9 w-[152px]"
        />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          To
        </label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-9 w-[152px]"
        />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Project
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[180px]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search worker…"
          className="h-9 min-w-[180px]"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-9 ml-auto"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="overflow-x-auto border-b border-border/60">
        <table className="w-full text-sm border-separate border-spacing-y-1.5 border-spacing-x-0">
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
                onClick={() => toggleSort("laborPay")}
              >
                Labor Pay
              </th>
              <th
                className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                onClick={() => toggleSort("reimbursements")}
              >
                Reimbursements
              </th>
              <th
                className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                onClick={() => toggleSort("invoices")}
              >
                Invoices
              </th>
              <th
                className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                onClick={() => toggleSort("totalPayable")}
              >
                Total Payable
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
                <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground text-xs">
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
                    {fmtUsd(r.laborPay)}
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
                    {fmtUsd(r.invoices)}
                  </td>
                  <td
                    className={cn(
                      "py-2 px-4 text-right tabular-nums font-medium",
                      listTableAmountCellClassName
                    )}
                  >
                    {fmtUsd(r.totalPayable)}
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

      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
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
            className="h-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
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
          defaultAmount={payTarget.totalPayable}
          onSuccess={load}
        />
      ) : null}
    </div>
  );
}
