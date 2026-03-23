"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type WorkerBalanceRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
  deletable?: boolean;
};

export default function WorkerBalancesPage() {
  const [rows, setRows] = React.useState<WorkerBalanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkerBalanceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/worker-balances?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load.");
      setRows(data.balances ?? []);
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

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/labor/worker-balances/${encodeURIComponent(deleteTarget.workerId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Delete failed.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, load]);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Worker Balances"
        subtitle="Labor owed, reimbursements, payments, and balance per worker."
        actions={
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-9 w-full sm:w-auto"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />
      {message ? (
        <p className="text-sm text-muted-foreground border-b border-border/60 pb-3">{message}</p>
      ) : null}
      <div className="table-responsive border-b border-border/60">
        <table className="w-full text-sm border-collapse min-w-[480px] sm:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Labor Owed
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Reimbursements
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Payments
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Advances
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Balance
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                <span className="sr-only">Actions</span>
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
            ) : rows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  No workers yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.workerId} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-4 font-medium text-foreground">
                    <Link href={`/labor/workers/${r.workerId}/balance`} className="hover:underline">
                      {r.workerName}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.laborOwed)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.reimbursements)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.payments)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.advances)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">
                    {fmtUsd(r.balance)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {r.deletable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${r.workerName}`}
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && !deleteBusy && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete worker?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Remove <span className="font-medium text-foreground">{deleteTarget?.workerName}</span>{" "}
              from workers. Only allowed when balance is $0.00 with no labor entries or payments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3 border-t border-border/60 gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
