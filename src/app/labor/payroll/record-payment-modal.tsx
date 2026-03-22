"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { recordPaymentAction } from "./actions";

const METHODS = ["Cash", "Check", "Bank"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  onSuccess: () => void;
};

export function RecordPaymentModal({ open, onOpenChange, workerId, onSuccess }: Props) {
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<string>("Cash");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setMethod("Cash");
    setNote("");
    setError(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
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
    try {
      await recordPaymentAction({
        worker_id: workerId,
        payment_date: paymentDate,
        amount: num,
        method,
        note: note.trim() || null,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-border/60 p-5 rounded-md gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Record Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="text-xs font-medium text-muted-foreground">Amount (required)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 text-sm tabular-nums"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Method</label>
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
            <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              className="h-9 text-sm"
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
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
              className="h-9 rounded-md border border-input bg-foreground text-background px-3 text-sm hover:bg-foreground/90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Record Payment"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
