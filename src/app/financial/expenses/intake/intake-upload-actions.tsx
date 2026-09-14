"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function IntakeUploadActions({ id, amount }: { id: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Array<{
    id: string;
    vendor_name: string;
    expense_date: string;
  }> | null>(null);
  const [target, setTarget] = useState("");
  async function matchOptions() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/expenses/intake?amount=${encodeURIComponent(amount.replaceAll(",", ""))}`,
        { cache: "no-store" }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setOptions(body.expenses);
      if (body.total > 100)
        setError(
          "Showing the latest 100 equal-amount transactions. Confirm the exact transaction before matching."
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Matches unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function transfer(expenseId?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/expenses/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: id, expenseId }),
      });
      const body = await response.json();
      if (!response.ok || !body.expense_id)
        throw new Error(body.message ?? "Transfer not confirmed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void transfer()}>
          Send to Review
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void matchOptions()}>
          Match existing
        </Button>
      </div>
      {options && (
        <div className="space-y-2">
          <select
            aria-label="Choose existing transaction"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-h-11 max-w-full rounded-md border bg-transparent text-sm"
          >
            <option value="">
              {options.length ? "Choose the exact transaction" : "No equal-amount transactions"}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.expense_date} · {option.vendor_name}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={busy || !target} onClick={() => void transfer(target)}>
            Confirm match
          </Button>
          <p className="text-xs text-muted-foreground">
            Adds evidence to the selected transaction.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="max-w-sm text-xs text-[var(--hh-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
