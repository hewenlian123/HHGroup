"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkerReceipt } from "@/lib/worker-receipts-db";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusDot(status: string) {
  const s = status.toLowerCase();
  if (s === "approved") return "bg-emerald-500/80";
  if (s === "rejected") return "bg-red-500/70";
  if (s === "paid") return "bg-blue-500/70";
  return "bg-amber-500/70";
}

export type ReceiptRow = WorkerReceipt & { projectName: string };

export function ReceiptsClient({ initialRows }: { initialRows: ReceiptRow[] }) {
  const [rows, setRows] = React.useState(initialRows);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/worker-receipts");
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message ?? "Failed to refresh");
      return;
    }
    // Names not in API — reload page to get server-rendered names
    window.location.reload();
  }, []);

  const approve = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Approve failed");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (id: string) => {
    setRejectId(id);
    setRejectReason("");
    setRejectOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectId) return;
    setBusyId(rejectId);
    setMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${rejectId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Reject failed");
      setRejectOpen(false);
      setRejectId(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this receipt upload?")) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Delete failed");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-container py-6">
      <PageHeader
        title="Worker Receipt Uploads"
        description="Approve or reject uploaded receipts; approved items become reimbursements."
      />

      {message && (
        <p className="text-sm text-destructive border-b border-border/60 pb-3 mb-3">{message}</p>
      )}

      {/* Mobile: card layout */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No receipt uploads yet.</p>
        ) : (
        rows.map((r) => (
          <div key={r.id} className="rounded-sm border border-border/60 bg-background p-4">
            <p className="font-medium text-foreground truncate">{r.workerName}</p>
            <p className="text-sm text-muted-foreground truncate">{r.projectName || "—"} · {r.expenseType || "—"}</p>
            <p className="text-sm text-muted-foreground truncate">{r.vendor || "—"}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="tabular-nums font-medium">${fmtUsd(r.amount)}</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(r.status)}`} />
                {r.status}
              </span>
            </div>
            {r.receiptUrl && (
              <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">View receipt</a>
            )}
            {r.status === "Pending" && (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="touch"
                  variant="outline"
                  className="min-h-[44px] flex-1 rounded-sm"
                  disabled={busyId === r.id}
                  onClick={() => approve(r.id)}
                >
                  {busyId === r.id ? "…" : "Approve"}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  variant="ghost"
                  className="min-h-[44px] flex-1 rounded-sm"
                  disabled={busyId === r.id}
                  onClick={() => openReject(r.id)}
                >
                  Reject
                </Button>
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="touch"
                variant="ghost"
                className="min-h-[32px] text-xs text-destructive"
                disabled={busyId === r.id}
                onClick={() => handleDelete(r.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-sm border border-border/60 md:block">
        <table className="w-full text-sm border-collapse table-row-compact min-w-[800px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Worker</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Expense Type</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendor</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Amount</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Receipt</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
              <th className="w-40 text-right py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                  No receipt uploads yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                  <td className="py-2 px-3 font-medium text-foreground">{r.workerName}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.projectName || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.expenseType || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.vendor || "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(r.amount)}</td>
                  <td className="py-2 px-3">
                    {r.receiptUrl ? (
                      <a
                        href={r.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(r.status)}`} />
                      <span className="text-muted-foreground">{r.status}</span>
                    </span>
                    {r.status === "Rejected" && r.rejectionReason ? (
                      <span className="block text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]" title={r.rejectionReason}>
                        {r.rejectionReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground tabular-nums text-xs">
                    {r.createdAt.slice(0, 10)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {r.status === "Pending" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-sm"
                            disabled={busyId === r.id}
                            onClick={() => approve(r.id)}
                          >
                            {busyId === r.id ? "…" : "Approve"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs rounded-sm"
                            disabled={busyId === r.id}
                            onClick={() => openReject(r.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs rounded-sm text-destructive"
                        disabled={busyId === r.id}
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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md border-border/60 rounded-sm gap-3">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Reject receipt</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter className="border-t border-border/60 pt-3 gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-sm h-9" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" variant="destructive" className="rounded-sm h-9" onClick={confirmReject} disabled={!!busyId}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
