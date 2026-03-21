"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { RowActionsMenu } from "@/components/base/row-actions-menu";

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
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [viewReceiptUrl, setViewReceiptUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const refresh = React.useCallback(async () => {
    const [recRes, projRes] = await Promise.all([
      fetch("/api/worker-receipts", { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    const recData = await recRes.json();
    if (!recRes.ok) {
      setMessage(recData.message ?? "Failed to refresh");
      return;
    }
    const projData = projRes.ok ? await projRes.json() : { projects: [] };
    const projectById = new Map<string, string>(
      (projData.projects ?? []).map((p: { id: string; name: string | null }) => [p.id, p.name ?? ""])
    );
    const list = (recData.receipts ?? []) as WorkerReceipt[];
    setRows(
      list.map((r) => ({
        ...r,
        projectName: r.projectId ? projectById.get(r.projectId) ?? "" : "",
      }))
    );
    setMessage(null);
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const approve = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Approve failed");
      // Update local row so we don't need full reload; keep existing projectName
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...data.receipt, projectName: r.projectName } : r
        )
      );
      if (data.reimbursementCreated) {
        setSuccessMessage("Approved. Added to Reimbursements.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const resetToPending = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${id}/reset-pending`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Reset failed");
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...data.receipt, projectName: r.projectName } : r
        )
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reset failed");
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
    setMessage(null);
    let snapshot: ReceiptRow[] | undefined;
    setRows((r) => {
      snapshot = r;
      return r.filter((x) => x.id !== id);
    });
    setBusyId(id);
    try {
      const res = await fetch(`/api/worker-receipts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Delete failed");
      void syncRouterAndClients(router);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Delete failed";
      console.error("Receipt delete failed:", e);
      setMessage(errMsg);
      if (snapshot) setRows(snapshot);
    } finally {
      setBusyId(null);
    }
  };

  const isPdfReceipt = viewReceiptUrl != null && viewReceiptUrl.toLowerCase().endsWith(".pdf");

  return (
    <div className="page-container py-6">
      <PageHeader
        title="Worker Receipt Uploads"
        description="Approve or reject uploaded receipts; approved items become reimbursements."
      />

      {message && (
        <p className="text-sm text-destructive border-b border-border/60 pb-3 mb-3 flex items-center justify-between gap-2">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </p>
      )}
      {successMessage && (
        <p className="text-sm text-muted-foreground border-b border-border/60 pb-3 mb-3">
          {successMessage}{" "}
          <Link href="/labor/reimbursements" className="underline hover:no-underline">
            View Reimbursements
          </Link>
        </p>
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
            <div className="mt-2 flex justify-end">
              <RowActionsMenu
                ariaLabel={`Actions for receipt ${r.id}`}
                actions={[
                  ...(r.receiptUrl ? [{ label: "View receipt", onClick: () => setViewReceiptUrl(r.receiptUrl!) }] : []),
                  ...(r.status === "Pending"
                    ? [
                        { label: "Approve", onClick: () => approve(r.id), disabled: busyId === r.id },
                        { label: "Reject", onClick: () => openReject(r.id), disabled: busyId === r.id },
                      ]
                    : []),
                  ...(r.status === "Approved"
                    ? [{ label: "Reset to Pending", onClick: () => resetToPending(r.id), disabled: busyId === r.id }]
                    : []),
                  { label: "Delete", onClick: () => handleDelete(r.id), destructive: true, disabled: busyId === r.id },
                ]}
              />
            </div>
          </div>
        ))
        )}
      </div>
      <div className="table-responsive hidden rounded-sm border border-border/60 md:block">
        <table className="w-full min-w-[700px] text-sm border-collapse table-row-compact md:min-w-0">
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
              <th className="w-10 text-right py-2 px-3" aria-label="Actions" />
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
                      <button
                        type="button"
                        onClick={() => setViewReceiptUrl(r.receiptUrl)}
                        className="text-primary hover:underline text-xs"
                      >
                        View
                      </button>
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
                  <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      ariaLabel={`Actions for receipt`}
                      actions={[
                        ...(r.receiptUrl ? [{ label: "View receipt", onClick: () => setViewReceiptUrl(r.receiptUrl!) }] : []),
                        ...(r.status === "Pending"
                          ? [
                              { label: "Approve", onClick: () => approve(r.id), disabled: busyId === r.id },
                              { label: "Reject", onClick: () => openReject(r.id), disabled: busyId === r.id },
                            ]
                          : []),
                        ...(r.status === "Approved"
                          ? [{ label: "Reset to Pending", onClick: () => resetToPending(r.id), disabled: busyId === r.id }]
                          : []),
                        { label: "Delete", onClick: () => handleDelete(r.id), destructive: true, disabled: busyId === r.id },
                      ]}
                    />
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

      <Dialog open={!!viewReceiptUrl} onOpenChange={(open) => !open && setViewReceiptUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] border-border/60 rounded-sm p-2 flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {viewReceiptUrl && (
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted/30 rounded-sm">
              {isPdfReceipt ? (
                <iframe src={viewReceiptUrl} title="Receipt" className="w-full min-h-[70vh] border-0 rounded-sm" />
              ) : (
                <img src={viewReceiptUrl} alt="Receipt" className="max-w-full max-h-[85vh] object-contain" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
