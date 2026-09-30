"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { recordPaymentAction } from "./actions";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";

const METHODS = ["Cash", "Check", "Bank"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  onSuccess: () => void;
};

export function RecordPaymentModal({ open, onOpenChange, workerId, onSuccess }: Props) {
  const [paymentDate, setPaymentDate] = React.useState(() => workerRateLocalYmd());
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<string>("Cash");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setPaymentDate(workerRateLocalYmd());
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
      <DialogContent className="max-w-sm gap-4 rounded-card p-5">
        <DialogHeader>
          <DialogTitle className="text-hh-section-title font-semibold text-[var(--hh-ink)]">
            Record Payment
          </DialogTitle>
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
              className="h-9 w-full rounded-hh-compact border border-input bg-transparent px-3 text-sm"
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
          {error ? (
            <p className="text-sm text-[var(--hh-danger)] text-[var(--hh-danger)]">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-[var(--hh-line)] pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving…" : "Record Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
