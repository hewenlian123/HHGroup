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

type PendingFinalize = {
  payment: WorkerPayment | null;
  idempotencyKey: string;
  workerId: string;
  projectId: string | null;
  selectedAdvanceIds: string[];
  totalSelectedAdvances: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  notes: string | null;
};

const pendingFinalizeStorageKey = (workerId: string) =>
  `hh.worker-payment.pending-finalize.${workerId}`;

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readPendingFinalize(workerId: string): PendingFinalize | null {
  try {
    const raw = window.localStorage.getItem(pendingFinalizeStorageKey(workerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingFinalize>;
    if (parsed.workerId !== workerId || !parsed.idempotencyKey) return null;
    return {
      payment: parsed.payment ?? null,
      idempotencyKey: String(parsed.idempotencyKey),
      workerId,
      projectId: parsed.projectId ?? null,
      selectedAdvanceIds: Array.isArray(parsed.selectedAdvanceIds)
        ? parsed.selectedAdvanceIds.filter((id): id is string => typeof id === "string")
        : [],
      totalSelectedAdvances: Number(parsed.totalSelectedAdvances) || 0,
      amount: Number(parsed.amount) || Number(parsed.payment?.amount) || 0,
      paymentDate:
        typeof parsed.paymentDate === "string"
          ? parsed.paymentDate
          : (parsed.payment?.paymentDate ?? new Date().toISOString().slice(0, 10)),
      paymentMethod:
        typeof parsed.paymentMethod === "string"
          ? parsed.paymentMethod
          : (parsed.payment?.paymentMethod ?? METHODS[0]),
      notes:
        typeof parsed.notes === "string" || parsed.notes === null
          ? parsed.notes
          : (parsed.payment?.notes ?? null),
    };
  } catch {
    return null;
  }
}

function writePendingFinalize(pending: PendingFinalize) {
  try {
    window.localStorage.setItem(
      pendingFinalizeStorageKey(pending.workerId),
      JSON.stringify(pending)
    );
  } catch {
    /* ignore */
  }
}

function clearPendingFinalize(workerId: string) {
  try {
    window.localStorage.removeItem(pendingFinalizeStorageKey(workerId));
  } catch {
    /* ignore */
  }
}

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
  const [paymentPendingFinalize, setPaymentPendingFinalize] = React.useState(false);
  const mountedRef = React.useRef(false);
  const submitRunRef = React.useRef(0);
  const submitInFlightRef = React.useRef(false);
  const pendingFinalizeRef = React.useRef<PendingFinalize | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submitRunRef.current += 1;
      submitInFlightRef.current = false;
      pendingFinalizeRef.current = null;
    };
  }, []);

  const reset = React.useCallback(() => {
    setProjectId("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount(defaultAmount ? String(defaultAmount.toFixed(2)) : "");
    setMethod(METHODS[0]);
    setNotes("");
    setError(null);
    setAdvances([]);
    setSelectedAdvanceIds([]);
    setPaymentPendingFinalize(false);
    pendingFinalizeRef.current = null;
  }, [defaultAmount]);

  const restorePendingFinalize = React.useCallback((pending: PendingFinalize) => {
    pendingFinalizeRef.current = pending;
    setProjectId(pending.projectId ?? "");
    setPaymentDate(pending.paymentDate);
    setAmount(pending.amount > 0 ? String(pending.amount.toFixed(2)) : "");
    setMethod(pending.paymentMethod || METHODS[0]);
    setNotes(pending.notes ?? "");
    setError(null);
    setSelectedAdvanceIds(pending.selectedAdvanceIds);
    setPaymentPendingFinalize(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    const pending = readPendingFinalize(workerId);
    if (pending) {
      restorePendingFinalize(pending);
    } else {
      reset();
    }
    (async () => {
      try {
        const p = await getProjects();
        if (!alive) return;
        setProjects(p);
        const url = new URL("/api/labor/advances", window.location.origin);
        url.searchParams.set("workerId", workerId);
        url.searchParams.set("status", "pending");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!alive) return;
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
        if (!alive) return;
        setProjects([]);
        setAdvances([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, reset, restorePendingFinalize, workerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || submitInFlightRef.current) return;
    const existingFinalize = pendingFinalizeRef.current;
    const num = existingFinalize ? existingFinalize.amount : parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const runId = ++submitRunRef.current;
    submitInFlightRef.current = true;
    setError(null);
    setBusy(true);
    setBusyPhase(existingFinalize?.payment ? "finalize" : "payment");
    try {
      let finalize = existingFinalize;

      if (!finalize) {
        const selectedAdvanceIdSet = new Set(selectedAdvanceIds);
        const selectedAdvanceIdList = [...selectedAdvanceIdSet];
        const totalSelectedAdvances = advances
          .filter((a) => selectedAdvanceIdSet.has(a.id))
          .reduce((sum, a) => sum + a.amount, 0);

        finalize = {
          payment: null,
          idempotencyKey: newIdempotencyKey(),
          workerId,
          projectId: projectId || null,
          selectedAdvanceIds: selectedAdvanceIdList,
          totalSelectedAdvances,
          amount: num,
          paymentDate,
          paymentMethod: method,
          notes: notes.trim() || null,
        };
        pendingFinalizeRef.current = finalize;
        writePendingFinalize(finalize);
        if (mountedRef.current && submitRunRef.current === runId) {
          setPaymentPendingFinalize(true);
        }
      }

      if (!finalize.payment) {
        const payment = await createWorkerPayment({
          workerId: finalize.workerId,
          projectId: finalize.projectId,
          paymentDate: finalize.paymentDate,
          amount: finalize.amount,
          paymentMethod: finalize.paymentMethod,
          notes: finalize.notes,
          idempotencyKey: finalize.idempotencyKey,
        });

        finalize = {
          ...finalize,
          payment,
        };
        pendingFinalizeRef.current = finalize;
        writePendingFinalize(finalize);
        if (mountedRef.current && submitRunRef.current === runId) {
          setPaymentPendingFinalize(true);
        }
      }

      if (mountedRef.current && submitRunRef.current === runId) {
        setBusyPhase("finalize");
      }
      await Promise.all([
        markWorkerReimbursementsPaid(finalize.workerId, finalize.projectId),
        markWorkerInvoicesPaid(finalize.workerId, finalize.projectId),
        ...(finalize.totalSelectedAdvances > 0
          ? finalize.selectedAdvanceIds.map(async (id) => {
              const res = await fetch(`/api/labor/advances/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "deducted" }),
              });
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(data.message ?? "Failed to apply advance.");
              }
            })
          : []),
      ]);

      pendingFinalizeRef.current = null;
      clearPendingFinalize(finalize.workerId);
      if (!mountedRef.current || submitRunRef.current !== runId) return;
      setPaymentPendingFinalize(false);
      startTransition(() => {
        onOpenChange(false);
        onSuccess();
      });
      queueMicrotask(() => {
        if (!mountedRef.current || submitRunRef.current !== runId) return;
        if (finalize.payment) onPaymentSuccess?.(finalize.payment);
      });
    } catch (err) {
      if (!mountedRef.current || submitRunRef.current !== runId) return;
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      if (submitRunRef.current === runId) {
        submitInFlightRef.current = false;
      }
      if (mountedRef.current && submitRunRef.current === runId) {
        setBusy(false);
        setBusyPhase(null);
      }
    }
  };
  const formLocked = busy || paymentPendingFinalize;
  const pendingPaymentCreated = Boolean(pendingFinalizeRef.current?.payment);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
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
              disabled={formLocked}
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
              disabled={formLocked}
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
              disabled={formLocked}
              className="h-9 text-sm tabular-nums"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Payment method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={formLocked}
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
              disabled={formLocked}
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
              disabled={formLocked}
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
              {busy
                ? busyPhase === "finalize"
                  ? "Finalizing…"
                  : "Recording…"
                : paymentPendingFinalize
                  ? pendingPaymentCreated
                    ? "Retry Finalize"
                    : "Retry Payment"
                  : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
