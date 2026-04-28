"use client";

import * as React from "react";
import { startTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  createWorkerPayment,
  markWorkerReimbursementsPaid,
  markWorkerInvoicesPaid,
  getProjects,
} from "@/lib/data";
import {
  WorkerAdvanceSelector,
  type WorkerAdvanceOption,
} from "@/components/labor/worker-advance-selector";
import type { WorkerPayment } from "@/lib/worker-payments-db";

const METHODS = ["Cash", "Check", "Bank Transfer", "Zelle", "Other"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  defaultAmount: number;
  onSuccess: () => void;
  /** Fired after payment is recorded and finalize steps complete; use to open receipt preview. */
  onPaymentSuccess?: (payment: WorkerPayment) => void;
};

export function PayWorkerModal({
  open,
  onOpenChange,
  workerId,
  workerName,
  defaultAmount,
  onSuccess,
  onPaymentSuccess,
}: Props) {
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [projectId, setProjectId] = React.useState<string>("");
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(() =>
    defaultAmount ? String(defaultAmount.toFixed(2)) : ""
  );
  const [method, setMethod] = React.useState<string>(METHODS[0]);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [busyPhase, setBusyPhase] = React.useState<null | "payment" | "finalize">(null);
  const [advances, setAdvances] = React.useState<WorkerAdvanceOption[]>([]);
  const [selectedAdvanceIds, setSelectedAdvanceIds] = React.useState<string[]>([]);

  const reset = React.useCallback(() => {
    setProjectId("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount(defaultAmount ? String(defaultAmount.toFixed(2)) : "");
    setMethod(METHODS[0]);
    setNotes("");
    setError(null);
  }, [defaultAmount]);

  React.useEffect(() => {
    if (!open) return;
    reset();
    (async () => {
      try {
        const p = await getProjects();
        setProjects(p);
        const url = new URL("/api/labor/advances", window.location.origin);
        url.searchParams.set("workerId", workerId);
        url.searchParams.set("status", "pending");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { advances?: unknown };
          const list = (Array.isArray(data.advances) ? data.advances : []) as Array<
            Record<string, unknown>
          >;
          setAdvances(
            list.map((r) => ({
              id: r.id as string,
              amount: Number(r.amount) || 0,
              advanceDate: String(r.advanceDate ?? "").slice(0, 10),
              projectName: (r.projectName as string | null) ?? null,
              notes: (r.notes as string | null) ?? null,
              status: (r.status as "pending" | "deducted" | "cancelled") ?? "pending",
            }))
          );
        } else {
          setAdvances([]);
        }
      } catch {
        setProjects([]);
        setAdvances([]);
      }
    })();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyPhase("payment");
    try {
      const totalSelectedAdvances = advances
        .filter((a) => selectedAdvanceIds.includes(a.id))
        .reduce((sum, a) => sum + a.amount, 0);

      const payment = await createWorkerPayment({
        workerId,
        projectId: projectId || null,
        paymentDate,
        amount: num,
        paymentMethod: method,
        notes: notes.trim() || null,
      });

      setBusyPhase("finalize");
      await Promise.all([
        markWorkerReimbursementsPaid(workerId, projectId || null),
        markWorkerInvoicesPaid(workerId, projectId || null),
        ...(totalSelectedAdvances > 0
          ? selectedAdvanceIds.map((id) =>
              fetch(`/api/labor/advances/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "deducted" }),
              })
            )
          : []),
      ]);

      startTransition(() => {
        onOpenChange(false);
        onSuccess();
      });
      queueMicrotask(() => {
        onPaymentSuccess?.(payment);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setBusy(false);
      setBusyPhase(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-border/60 p-5 rounded-md gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Pay Worker</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Worker</label>
            <Input value={workerName} readOnly className="h-9 text-sm" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Project (optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Payment Date</label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 text-sm tabular-nums"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Payment method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Apply advances (optional)
            </label>
            <WorkerAdvanceSelector
              advances={advances}
              selectedIds={selectedAdvanceIds}
              onChange={setSelectedAdvanceIds}
            />
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {busy && busyPhase ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {busyPhase === "payment"
                ? "Recording payment…"
                : "Applying to reimbursements, invoices, and advances…"}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-9" disabled={busy}>
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? (busyPhase === "finalize" ? "Finalizing…" : "Recording…") : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
