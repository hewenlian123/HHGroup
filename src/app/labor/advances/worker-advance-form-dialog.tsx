"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type WorkerOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };

type FormValues = {
  id?: string;
  workerId: string;
  projectId: string | null;
  amount: string;
  advanceDate: string;
  notes: string;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: FormValues;
  workers: WorkerOption[];
  projects: ProjectOption[];
  onClose: () => void;
  onSave: (values: FormValues) => Promise<void> | void;
};

export function WorkerAdvanceFormDialog({
  open,
  mode,
  initialValues,
  workers,
  projects,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = React.useState<FormValues>(() => ({
    workerId: "",
    projectId: null,
    amount: "",
    advanceDate: new Date().toISOString().slice(0, 10),
    notes: "",
    ...(initialValues ?? {}),
  }));
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm((prev) => ({
        workerId: "",
        projectId: null,
        amount: "",
        advanceDate: new Date().toISOString().slice(0, 10),
        notes: "",
        ...(initialValues ?? {}),
      }));
      setError(null);
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workerId) {
      setError("Worker is required.");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (!form.advanceDate) {
      setError("Date is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save advance.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-border/60 rounded-md p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {mode === "create" ? "Create Advance" : "Edit Advance"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Worker<span className="text-red-500">*</span>
            </p>
            <select
              value={form.workerId}
              onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={mode === "edit"}
            >
              <option value="">Select worker</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Project (optional)</p>
            <select
              value={form.projectId ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  projectId: e.target.value || null,
                }))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Amount</p>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Date</p>
            <Input
              type="date"
              value={form.advanceDate}
              onChange={(e) => setForm((f) => ({ ...f, advanceDate: e.target.value }))}
              className="h-9 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
              className="h-9 text-sm"
            />
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          <DialogFooter className="mt-2 gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-9 rounded-sm" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
