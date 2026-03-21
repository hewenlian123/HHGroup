"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWorkers,
  getLaborEntriesWithJoins,
  getDailyWorkEntriesInRange,
  getWorkerInvoices,
  getWorkerPayments,
  totalPayForEntry,
  type WorkerInvoice,
} from "@/lib/data";

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
  earned: number;
  paid: number;
  outstanding: number;
};

export default function WorkerSummaryPage() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const defaultFrom = startOfMonth.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = React.useState(defaultFrom);
  const [toDate, setToDate] = React.useState(today);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: keyof Omit<Row, "workerId">; dir: "asc" | "desc" }>({
    key: "outstanding",
    dir: "desc",
  });
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [workers, laborEntries, invoicesAll, payments] = await Promise.all([
        getWorkers(),
        getLaborEntriesWithJoins({ date_from: fromDate, date_to: toDate }).catch(() => []),
        getWorkerInvoices().catch(() => [] as WorkerInvoice[]),
        getWorkerPayments({ fromDate, toDate, limit: 5000 }).catch(() => []),
      ]);

      const laborByWorker = new Map<string, number>();
      for (const e of laborEntries) {
        const wid = e.worker_id;
        if (!wid) continue;
        const amt = Number(e.cost_amount ?? 0) || 0;
        laborByWorker.set(wid, (laborByWorker.get(wid) ?? 0) + amt);
      }

      if (laborEntries.length === 0) {
        const daily = await getDailyWorkEntriesInRange(fromDate, toDate).catch(() => []);
        for (const e of daily) {
          laborByWorker.set(e.workerId, (laborByWorker.get(e.workerId) ?? 0) + totalPayForEntry(e));
        }
      }

      const invoiceByWorker = new Map<string, number>();
      for (const inv of invoicesAll as WorkerInvoice[]) {
        const d = inv.createdAt?.slice(0, 10) ?? "";
        if (d && (d < fromDate || d > toDate)) continue;
        invoiceByWorker.set(inv.workerId, (invoiceByWorker.get(inv.workerId) ?? 0) + (Number(inv.amount) || 0));
      }

      const paidByWorker = new Map<string, number>();
      for (const p of payments) {
        paidByWorker.set(p.workerId, (paidByWorker.get(p.workerId) ?? 0) + (Number(p.amount) || 0));
      }

      const nameById = new Map(workers.map((w) => [w.id, w.name] as const));

      const out: Row[] = workers.map((w) => {
        const labor = laborByWorker.get(w.id) ?? 0;
        const inv = invoiceByWorker.get(w.id) ?? 0;
        const earned = labor + inv;
        const paid = paidByWorker.get(w.id) ?? 0;
        const outstanding = earned - paid;
        return {
          workerId: w.id,
          workerName: nameById.get(w.id) ?? w.name ?? w.id,
          earned,
          paid,
          outstanding,
        };
      });

      setRows(out);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  React.useEffect(() => {
    void load();
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

  const totals = React.useMemo(() => {
    let earned = 0;
    let paid = 0;
    let outstanding = 0;
    for (const r of filtered) {
      earned += r.earned;
      paid += r.paid;
      outstanding += r.outstanding;
    }
    return { earned, paid, outstanding };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sort, fromDate, toDate]);

  const toggleSort = (key: keyof Omit<Row, "workerId">) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Worker Summary"
        subtitle="Earned (labor + worker invoices) vs paid (worker payments) in the selected range."
        actions={
          <Link href="/workers" className="text-sm text-muted-foreground hover:text-foreground">
            Worker Profile
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From</label>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-[152px]" />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-[152px]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search worker…"
          className="h-9 min-w-[180px]"
        />
        <Button size="sm" variant="outline" className="h-9 ml-auto" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="grid gap-4 border-b border-border/60 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Earned</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{fmtUsd(totals.earned)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Paid</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{fmtUsd(totals.paid)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Outstanding</p>
          <p
            className={
              totals.outstanding > 0.005
                ? "mt-1 text-lg font-semibold tabular-nums text-destructive"
                : "mt-1 text-lg font-semibold tabular-nums"
            }
          >
            {fmtUsd(totals.outstanding)}
          </p>
        </div>
      </div>

      <div className="table-responsive border-b border-border/60">
        <table className="w-full min-w-[520px] text-sm border-collapse md:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th
                className="cursor-pointer select-none py-2 px-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                onClick={() => toggleSort("workerName")}
              >
                Worker
              </th>
              <th
                className="cursor-pointer select-none py-2 px-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums"
                onClick={() => toggleSort("earned")}
              >
                Earned
              </th>
              <th
                className="cursor-pointer select-none py-2 px-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums"
                onClick={() => toggleSort("paid")}
              >
                Paid
              </th>
              <th
                className="cursor-pointer select-none py-2 px-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums"
                onClick={() => toggleSort("outstanding")}
              >
                Outstanding
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-4 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-4 text-center text-xs text-muted-foreground">
                  No workers.
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr
                  key={r.workerId}
                  className="cursor-pointer border-b border-border/40 hover:bg-muted/10"
                  onClick={() => router.push(`/workers/${r.workerId}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/workers/${r.workerId}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open ${r.workerName}`}
                >
                  <td className="py-2 px-4 font-medium">{r.workerName}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{fmtUsd(r.earned)}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{fmtUsd(r.paid)}</td>
                  <td
                    className={
                      r.outstanding > 0.005
                        ? "py-2 px-4 text-right tabular-nums font-medium text-destructive"
                        : "py-2 px-4 text-right tabular-nums font-medium"
                    }
                  >
                    {fmtUsd(r.outstanding)}
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
            : `${Math.min(filtered.length, (page - 1) * pageSize + 1)}–${Math.min(filtered.length, page * pageSize)}`}{" "}
          of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
    </div>
  );
}
