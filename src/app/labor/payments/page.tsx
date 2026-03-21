"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteWorkerPayment, getProjects, getWorkerPayments, getWorkers, type WorkerPayment } from "@/lib/data";
import { dispatchClientDataSync } from "@/lib/sync-router-client";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function WorkerPaymentsPage() {
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerPayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 12;
  const [sort, setSort] = React.useState<{ key: "paymentDate" | "amount" | "method"; dir: "asc" | "desc" }>({
    key: "paymentDate",
    dir: "desc",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [w, p, list] = await Promise.all([getWorkers(), getProjects(), getWorkerPayments({ limit: 500 })]);
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

  const workerNameById = React.useMemo(() => new Map(workers.map((w) => [w.id, w.name] as const)), [workers]);
  const projectNameById = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          const worker = workerNameById.get(r.workerId) ?? r.workerId;
          const project = r.projectId ? projectNameById.get(r.projectId) ?? r.projectId : "";
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            String(r.amount ?? "").toLowerCase().includes(q) ||
            (r.paymentMethod ?? "").toLowerCase().includes(q) ||
            (r.notes ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "method") return (String(a.paymentMethod ?? "").localeCompare(String(b.paymentMethod ?? "")) || 0) * dir;
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
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
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
      <PageHeader
        title="Worker Payments"
        subtitle="Payment history for worker payouts."
        actions={
          <Link href="/labor/payroll" className="text-sm text-muted-foreground hover:text-foreground">
            Payroll Summary
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search payments…"
          className="h-9 min-w-[220px]"
        />
        <div className="flex items-center gap-2">
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button size="sm" variant="outline" className="h-9" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="table-responsive border-b border-border/60">
        <table className="w-full min-w-[560px] text-sm border-collapse md:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
              <th
                className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                onClick={() => toggleSort("amount")}
              >
                Amount
              </th>
              <th
                className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                onClick={() => toggleSort("method")}
              >
                Payment method
              </th>
              <th
                className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                onClick={() => toggleSort("paymentDate")}
              >
                Payment date
              </th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
              <th className="w-40" />
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
                  No payments yet.
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-4">{workerNameById.get(r.workerId) ?? r.workerId}</td>
                  <td className="py-2 px-4 text-muted-foreground">
                    {r.projectId ? projectNameById.get(r.projectId) ?? r.projectId : "—"}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">{fmtUsd(r.amount)}</td>
                  <td className="py-2 px-4">{r.paymentMethod ?? "—"}</td>
                  <td className="py-2 px-4 tabular-nums text-muted-foreground">{r.paymentDate}</td>
                  <td className="py-2 px-4 text-muted-foreground max-w-[240px] truncate" title={r.notes ?? undefined}>
                    {r.notes ?? "—"}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/labor/payments/${r.id}/receipt`}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        View Receipt
                      </Link>
                      <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => handleDelete(r.id)}>
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

      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {filtered.length === 0 ? "0" : String(Math.min(filtered.length, (page - 1) * pageSize + 1))}–
          {Math.min(filtered.length, page * pageSize)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <Button size="sm" variant="outline" className="h-8" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

