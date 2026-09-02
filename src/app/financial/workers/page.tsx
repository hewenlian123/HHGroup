"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { NeoAmount, NeoMobileCard, NeoTable, PageLayout } from "@/components/base";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WorkerBalanceRow } from "@/lib/data";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default function FinancialWorkersPage() {
  const [balances, setBalances] = React.useState<WorkerBalanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [ledgerWorker, setLedgerWorker] = React.useState<{
    workerId: string;
    workerName: string | null;
  } | null>(null);
  const [ledgerRows, setLedgerRows] = React.useState<WorkerReimbursement[]>([]);
  const [ledgerLoading, setLedgerLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/worker-reimbursements/balances?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
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

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

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
    <PageLayout
      header={
        <PageHeader
          title="Worker Balances"
          subtitle="Reimbursement balances by worker. Click a worker to open their ledger."
          actions={
            <Button asChild variant="outline" size="sm" className="h-11 min-h-[44px]">
              <Link href="/labor/reimbursements">Reimbursements</Link>
            </Button>
          }
        />
      }
    >
      {message && (
        <p
          className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-hh-error text-[var(--hh-danger)]"
          role="alert"
        >
          {message}
        </p>
      )}

      <div className="space-y-2 md:hidden" aria-label="Worker balances">
        {loading ? (
          <p className="py-6 text-center text-hh-metadata text-[var(--hh-text-secondary)]">
            Loading…
          </p>
        ) : balances.length === 0 ? (
          <p className="py-6 text-center text-hh-metadata text-[var(--hh-text-secondary)]">
            No worker balances.
          </p>
        ) : (
          balances.map((row) => (
            <NeoMobileCard key={row.workerId} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openLedger(row)}
                  className="min-h-[44px] min-w-[44px] text-left text-hh-body font-semibold text-[var(--hh-text-primary)] hover:underline lg:min-h-0"
                >
                  {row.workerName ?? row.workerId}
                </button>
                <NeoAmount className="shrink-0 whitespace-nowrap text-hh-body font-semibold">
                  {formatCurrency(row.balance)}
                </NeoAmount>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-hh-metadata text-[var(--hh-text-secondary)]">
                <span>
                  Pending{" "}
                  <NeoAmount className="ml-1">{formatCurrency(row.pendingAmount)}</NeoAmount>
                </span>
                <span>
                  Paid <NeoAmount className="ml-1">{formatCurrency(row.paidAmount)}</NeoAmount>
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-11 min-h-[44px] w-full"
                onClick={() => openLedger(row)}
              >
                View Ledger
              </Button>
            </NeoMobileCard>
          ))
        )}
      </div>

      <NeoTable className="hidden md:block" tableClassName="min-w-[640px] lg:min-w-0">
        <TableHeader>
          <TableRow>
            <TableHead>Worker</TableHead>
            <TableHead className="text-right">Pending</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-6 px-3 text-center text-muted-foreground text-xs"
              >
                Loading…
              </TableCell>
            </TableRow>
          ) : balances.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-6 px-3 text-center text-muted-foreground text-xs"
              >
                No worker balances.
              </TableCell>
            </TableRow>
          ) : (
            balances.map((row) => (
              <TableRow key={row.workerId} className="hover:bg-muted/10">
                <TableCell className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => openLedger(row)}
                    className="min-h-[44px] min-w-[44px] text-left font-medium text-[var(--hh-text-primary)] hover:underline lg:min-h-0"
                  >
                    {row.workerName ?? row.workerId}
                  </button>
                </TableCell>
                <TableCell className="px-3 py-2 text-right">
                  <NeoAmount>{formatCurrency(row.pendingAmount)}</NeoAmount>
                </TableCell>
                <TableCell className="px-3 py-2 text-right">
                  <NeoAmount>{formatCurrency(row.paidAmount)}</NeoAmount>
                </TableCell>
                <TableCell className="px-3 py-2 text-right">
                  <NeoAmount className="font-semibold">{formatCurrency(row.balance)}</NeoAmount>
                </TableCell>
                <TableCell className="py-2 px-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-11 min-h-[44px] px-3 lg:h-9 lg:min-h-0"
                    onClick={() => openLedger(row)}
                  >
                    Ledger
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </NeoTable>

      <Dialog open={!!ledgerWorker} onOpenChange={(open) => !open && setLedgerWorker(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col border-[var(--hh-border)]">
          <DialogHeader>
            <DialogTitle>
              Ledger · {ledgerWorker?.workerName ?? ledgerWorker?.workerId ?? "Worker"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto border-t border-border/60 mt-2">
            {ledgerLoading ? (
              <p className="py-6 text-center text-muted-foreground text-xs">Loading…</p>
            ) : (
              <NeoTable
                data-testid="worker-ledger-table"
                className="border-0 shadow-none"
                scrollClassName="max-h-[60vh]"
                tableClassName="min-w-[640px]"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                      >
                        No reimbursements.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledgerRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-hh-metadata text-[var(--hh-text-secondary)]">
                          {formatDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-[var(--hh-text-secondary)]">
                          {r.projectName ?? r.projectId ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-[var(--hh-text-secondary)]">
                          {r.vendor ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <NeoAmount>{formatCurrency(r.amount)}</NeoAmount>
                        </TableCell>
                        <TableCell className="text-[var(--hh-text-secondary)]">
                          {r.status}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </NeoTable>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
