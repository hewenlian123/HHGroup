"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { WorkerPaymentReceiptPreviewModal } from "@/components/labor/worker-payment-receipt-preview-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import {
  deleteWorkerPayment,
  getProjects,
  getWorkerPayments,
  getLaborWorkersList,
  type WorkerPayment,
} from "@/lib/data";
import { dispatchClientDataSync } from "@/lib/sync-router-client";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function WorkerPaymentsPage() {
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getLaborWorkersList>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerPayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 12;
  const [sort, setSort] = React.useState<{
    key: "paymentDate" | "amount" | "method";
    dir: "asc" | "desc";
  }>({
    key: "paymentDate",
    dir: "desc",
  });
  const [receiptPreviewId, setReceiptPreviewId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [w, p, list] = await Promise.all([
        getLaborWorkersList(),
        getProjects(),
        getWorkerPayments({ limit: 500 }),
      ]);
      setWorkers(w);
      setProjects(p);
      setRows(list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const workerNameById = React.useMemo(
    () => new Map(workers.map((w) => [w.id, w.name] as const)),
    [workers]
  );
  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name] as const)),
    [projects]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          const worker = workerNameById.get(r.workerId) ?? r.workerId;
          const project = r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : "";
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            String(r.amount ?? "")
              .toLowerCase()
              .includes(q) ||
            (r.paymentMethod ?? "").toLowerCase().includes(q) ||
            (r.notes ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "method")
        return (
          (String(a.paymentMethod ?? "").localeCompare(String(b.paymentMethod ?? "")) || 0) * dir
        );
      return (String(a.paymentDate).localeCompare(String(b.paymentDate)) || 0) * dir;
    });
  }, [rows, query, workerNameById, projectNameById, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => setPage(1), [query, sort]);

  const toggleSort = (key: "paymentDate" | "amount" | "method") => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this payment record?")) return;
    let snapshot: WorkerPayment[] | undefined;
    setRows((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });
    try {
      await deleteWorkerPayment(id);
      dispatchClientDataSync({ reason: "worker-payment-deleted" });
      void load();
    } catch (e) {
      if (snapshot) setRows(snapshot);
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  return (
    <div className="page-container page-stack py-6">
      <WorkerPaymentReceiptPreviewModal
        paymentId={receiptPreviewId}
        open={receiptPreviewId != null}
        onOpenChange={(o) => {
          if (!o) setReceiptPreviewId(null);
        }}
      />
      <PageHeader
        title="Worker Payments"
        subtitle="Payment history for worker payouts."
        actions={
          <Link
            href="/labor/payroll"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Payroll Summary
          </Link>
        }
      />

      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search payments…"
          className="h-9 w-full min-w-0 sm:min-w-[220px]"
        />
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full sm:w-auto"
            onClick={load}
            disabled={loading}
          >
            <SubmitSpinner loading={loading} className="mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-sm border border-border/60 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <Skeleton className="mt-3 h-4 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          paged.map((r) => (
            <div
              key={r.id}
              className="rounded-sm border border-border/60 bg-background p-4 dark:bg-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {workerNameById.get(r.workerId) ?? r.workerId}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : "—"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {fmtUsd(r.amount)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{r.paymentMethod ?? "—"}</span>
                <span className="tabular-nums">{r.paymentDate}</span>
              </div>
              {r.notes ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.notes}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="btn-outline-ghost min-h-11 flex-1 sm:min-h-8 sm:flex-none"
                  onClick={() => setReceiptPreviewId(r.id)}
                >
                  View Receipt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="btn-outline-ghost min-h-11 flex-1 text-red-600 sm:min-h-8 sm:flex-none"
                  onClick={() => handleDelete(r.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full min-w-[560px] text-sm lg:min-w-0">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Worker
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Project
                </th>
                <th
                  className="h-8 cursor-pointer select-none px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums"
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                </th>
                <th
                  className="h-8 cursor-pointer select-none px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]"
                  onClick={() => toggleSort("method")}
                >
                  Payment method
                </th>
                <th
                  className="h-8 cursor-pointer select-none px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]"
                  onClick={() => toggleSort("paymentDate")}
                >
                  Payment date
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Notes
                </th>
                <th className="h-8 w-40 px-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="h-11 px-3 py-1" colSpan={7}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-xs text-muted-foreground"
                  >
                    No payments yet.
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className={listTableRowStaticClassName}>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                      {workerNameById.get(r.workerId) ?? r.workerId}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] font-medium tabular-nums">
                      {fmtUsd(r.amount)}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                      {r.paymentMethod ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums text-muted-foreground">
                      {r.paymentDate}
                    </td>
                    <td
                      className="h-11 min-h-[44px] max-w-[240px] truncate px-3 py-0 align-middle text-[13px] text-muted-foreground"
                      title={r.notes ?? undefined}
                    >
                      {r.notes ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-[13px]">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="text-sm text-muted-foreground hover:text-foreground"
                          onClick={() => setReceiptPreviewId(r.id)}
                        >
                          View Receipt
                        </button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="btn-outline-ghost h-8 text-red-600"
                          onClick={() => handleDelete(r.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="tabular-nums">
          {filtered.length === 0
            ? "0"
            : String(Math.min(filtered.length, (page - 1) * pageSize + 1))}
          –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
        </span>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-11 min-h-11 flex-1 sm:h-8 sm:min-h-0 sm:flex-none"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-11 min-h-11 flex-1 sm:h-8 sm:min-h-0 sm:flex-none"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
