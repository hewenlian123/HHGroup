"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createWorkerAction } from "./actions";
import type { WorkerStatus, WorkerRow } from "@/lib/workers-db";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (worker: WorkerRow) => void;
};

export function AddWorkerModal({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trade, setTrade] = React.useState("");
  const [dailyRate, setDailyRate] = React.useState("");
  const [defaultOtRate, setDefaultOtRate] = React.useState("");
  const [status, setStatus] = React.useState<WorkerStatus>("Active");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setName("");
    setPhone("");
    setTrade("");
    setDailyRate("");
    setDefaultOtRate("");
    setStatus("Active");
    setNotes("");
    setError(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await createWorkerAction({
        name: name.trim(),
        phone: phone.trim() || null,
        trade: trade.trim() || null,
        daily_rate: Number(dailyRate) || 0,
        default_ot_rate: Number(defaultOtRate) || 0,
        status,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to add worker.");
        return;
      }
      onOpenChange(false);
      onSuccess(res.worker);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add worker.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-border/60 rounded-md gap-4 p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Add Worker</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Name (required)</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Worker name"
              className="h-9 text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Trade</label>
              <Input
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                placeholder="Trade"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Daily Rate</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Default OT Rate</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={defaultOtRate}
                onChange={(e) => setDefaultOtRate(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkerStatus)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="h-9 text-sm"
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-9 rounded-md border border-input bg-foreground px-3 text-sm text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Add Worker"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
