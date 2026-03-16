"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorkerBalanceRow } from "@/lib/data";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FinancialWorkersPage() {
  const [balances, setBalances] = React.useState<WorkerBalanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [ledgerWorker, setLedgerWorker] = React.useState<{ workerId: string; workerName: string | null } | null>(null);
  const [ledgerRows, setLedgerRows] = React.useState<WorkerReimbursement[]>([]);
  const [ledgerLoading, setLedgerLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/worker-reimbursements/balances?t=${Date.now()}`, { cache: "no-store", headers: { Pragma: "no-cache" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load");
      setBalances(data.balances ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const openLedger = React.useCallback(async (row: WorkerBalanceRow) => {
    setLedgerWorker({ workerId: row.workerId, workerName: row.workerName });
    setLedgerRows([]);
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/worker-reimbursements/ledger/${row.workerId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load ledger");
      setLedgerRows(data.reimbursements ?? []);
    } catch {
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Worker Balances"
        subtitle="Reimbursement balances by worker. Click a worker to open their ledger."
        actions={
          <Link href="/labor/reimbursements" className="text-sm text-muted-foreground hover:text-foreground">
            Reimbursements
          </Link>
        }
      />
      {message && <p className="text-sm text-destructive border-b border-border/60 pb-3">{message}</p>}

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {loading ? (
          <p className="py-6 text-center text-muted-foreground text-xs">Loading…</p>
        ) : balances.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">No worker balances.</p>
        ) : (
          balances.map((row) => (
            <div
              key={row.workerId}
              className="rounded-sm border border-border/60 p-3 space-y-2"
            >
              <div className="flex justify-between items-start">
                <button
                  type="button"
                  onClick={() => openLedger(row)}
                  className="font-medium text-left hover:underline"
                >
                  {row.workerName ?? row.workerId}
                </button>
                <span className="text-sm font-medium tabular-nums">${fmtUsd(row.balance)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Pending ${fmtUsd(row.pendingAmount)}</span>
                <span>Paid ${fmtUsd(row.paidAmount)}</span>
              </div>
              <Button size="sm" variant="outline" className="h-8 rounded-sm w-full mt-2" onClick={() => openLedger(row)}>
                View Ledger
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="table-responsive hidden border-b border-border/60 md:block">
        <table className="w-full min-w-[520px] text-sm border-collapse table-row-compact md:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Worker</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Pending</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Paid</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Balance</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40"><td colSpan={5} className="py-6 px-3 text-center text-muted-foreground text-xs">Loading…</td></tr>
            ) : balances.length === 0 ? (
              <tr className="border-b border-border/40"><td colSpan={5} className="py-6 px-3 text-center text-muted-foreground text-xs">No worker balances.</td></tr>
            ) : (
              balances.map((row) => (
                <tr key={row.workerId} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-3">
                    <button type="button" onClick={() => openLedger(row)} className="font-medium text-left hover:underline">
                      {row.workerName ?? row.workerId}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">${fmtUsd(row.pendingAmount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">${fmtUsd(row.paidAmount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">${fmtUsd(row.balance)}</td>
                  <td className="py-2 px-3">
                    <Button size="sm" variant="ghost" className="h-7 text-xs rounded-sm" onClick={() => openLedger(row)}>Ledger</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Ledger modal */}
      <Dialog open={!!ledgerWorker} onOpenChange={(open) => !open && setLedgerWorker(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] border-border/60 rounded-sm flex flex-col">
          <DialogHeader>
            <DialogTitle>Ledger · {ledgerWorker?.workerName ?? ledgerWorker?.workerId ?? "Worker"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto border-t border-border/60 mt-2">
            {ledgerLoading ? (
              <p className="py-6 text-center text-muted-foreground text-xs">Loading…</p>
            ) : (
              <table className="w-full text-sm border-collapse table-row-compact">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Project</th>
                    <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Vendor</th>
                    <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums">Amount</th>
                    <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 px-3 text-center text-muted-foreground text-xs">No reimbursements.</td></tr>
                  ) : (
                    ledgerRows.map((r) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="py-2 px-3 text-muted-foreground tabular-nums">{(r.createdAt ?? "").slice(0, 10)}</td>
                        <td className="py-2 px-3 text-muted-foreground">{r.projectName ?? r.projectId ?? "—"}</td>
                        <td className="py-2 px-3 text-muted-foreground max-w-[120px] truncate">{r.vendor ?? "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">${fmtUsd(r.amount)}</td>
                        <td className="py-2 px-3 text-muted-foreground">{r.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
