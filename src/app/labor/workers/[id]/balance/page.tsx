"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type LaborEntryRow = {
  id: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
};

type ReimbursementRow = {
  id: string;
  date: string;
  vendor: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
};

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
};

type Summary = {
  laborOwed: number;
  reimbursements: number;
  payments: number;
  balance: number;
};

export default function WorkerBalanceDetailPage() {
  const params = useParams();
  const workerId = params?.id as string | undefined;

  const [worker, setWorker] = React.useState<{ id: string; name: string } | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [laborEntries, setLaborEntries] = React.useState<LaborEntryRow[]>([]);
  const [reimbursements, setReimbursements] = React.useState<ReimbursementRow[]>([]);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [payModalOpen, setPayModalOpen] = React.useState(false);
  const [payMethod, setPayMethod] = React.useState("");
  const [payDate, setPayDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = React.useState("");
  const [selectedLaborIds, setSelectedLaborIds] = React.useState<Set<string>>(new Set());
  const [selectedReimbIds, setSelectedReimbIds] = React.useState<Set<string>>(new Set());
  const [paySubmitting, setPaySubmitting] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!workerId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/workers/${workerId}/balance`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load.");
      setWorker(data.worker ?? null);
      setSummary(data.summary ?? null);
      setLaborEntries(data.laborEntries ?? []);
      setReimbursements(data.reimbursements ?? []);
      setPayments(data.payments ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const unpaidLabor = React.useMemo(
    () => laborEntries.filter((e) => String(e.status).toLowerCase() !== "paid"),
    [laborEntries]
  );
  const unpaidReimb = React.useMemo(
    () => reimbursements.filter((r) => String(r.status).toLowerCase() !== "paid"),
    [reimbursements]
  );

  const totalPaymentAmount = React.useMemo(() => {
    let s = 0;
    unpaidLabor.forEach((e) => {
      if (selectedLaborIds.has(e.id)) s += e.amount;
    });
    unpaidReimb.forEach((r) => {
      if (selectedReimbIds.has(r.id)) s += r.amount;
    });
    return s;
  }, [unpaidLabor, unpaidReimb, selectedLaborIds, selectedReimbIds]);

  const openPayModal = () => {
    setSelectedLaborIds(new Set(unpaidLabor.map((e) => e.id)));
    setSelectedReimbIds(new Set(unpaidReimb.map((r) => r.id)));
    setPayMethod("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes("");
    setPayError(null);
    setPayModalOpen(true);
  };

  const toggleLabor = (id: string) => {
    setSelectedLaborIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleReimb = (id: string) => {
    setSelectedReimbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || totalPaymentAmount <= 0) return;
    const method = payMethod.trim();
    if (!method) {
      setPayError("Payment method is required.");
      return;
    }
    setPaySubmitting(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/labor/workers/${workerId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalPaymentAmount,
          payment_method: method,
          payment_date: payDate.slice(0, 10),
          notes: payNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Payment failed.");
      setPayModalOpen(false);
      await load();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (!workerId) {
    return (
      <div className="page-container page-stack py-6">
        <p className="text-sm text-muted-foreground">Worker not found.</p>
      </div>
    );
  }

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title={worker?.name ?? "Worker Balance"}
        subtitle="Labor entries, reimbursements, payments, and balance."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link href="/labor/worker-balances" className="w-full sm:w-auto">
              <Button size="sm" variant="outline" className="min-h-[44px] sm:min-h-9 w-full sm:w-auto">
                Back to Balances
              </Button>
            </Link>
            <Button size="sm" className="min-h-[44px] sm:min-h-9 w-full sm:w-auto" onClick={openPayModal} disabled={loading || (unpaidLabor.length === 0 && unpaidReimb.length === 0)}>
              {paySubmitting ? "Saving…" : "Pay Worker"}
            </Button>
          </div>
        }
      />

      {message ? (
        <p className="text-sm text-muted-foreground border-b border-border/60 pb-3">{message}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground py-6">Loading…</p>
      ) : (
        <>
          {/* D) Balance Summary */}
          {summary != null && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border/60 pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Labor Owed</p>
                <p className="text-lg font-medium tabular-nums">{fmtUsd(summary.laborOwed)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reimbursements</p>
                <p className="text-lg font-medium tabular-nums">{fmtUsd(summary.reimbursements)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Payments</p>
                <p className="text-lg font-medium tabular-nums">{fmtUsd(summary.payments)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance</p>
                <p className="text-lg font-semibold tabular-nums">{fmtUsd(summary.balance)}</p>
              </div>
            </div>
          )}

          {/* A) Labor Entries */}
          <div className="border-b border-border/60 pb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Labor Entries</h2>
            <div className="table-responsive">
              <table className="w-full text-sm border-collapse min-w-[320px] sm:min-w-0">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="text-right py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Amount</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {laborEntries.length === 0 ? (
                    <tr className="border-b border-border/40">
                      <td colSpan={4} className="py-4 px-4 text-center text-muted-foreground text-xs">No labor entries.</td>
                    </tr>
                  ) : (
                    laborEntries.map((r) => (
                      <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                        <td className="py-2 px-4 tabular-nums">{r.date}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.projectName ?? r.projectId ?? "—"}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{fmtUsd(r.amount)}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* B) Reimbursements */}
          <div className="border-b border-border/60 pb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reimbursements</h2>
            <div className="table-responsive">
              <table className="w-full text-sm border-collapse min-w-[400px] sm:min-w-0">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendor</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="text-right py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Amount</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reimbursements.length === 0 ? (
                    <tr className="border-b border-border/40">
                      <td colSpan={5} className="py-4 px-4 text-center text-muted-foreground text-xs">No reimbursements.</td>
                    </tr>
                  ) : (
                    reimbursements.map((r) => (
                      <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                        <td className="py-2 px-4 tabular-nums">{r.date}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.vendor ?? "—"}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.projectName ?? r.projectId ?? "—"}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{fmtUsd(r.amount)}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* C) Payments */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payments</h2>
            <div className="table-responsive">
              <table className="w-full text-sm border-collapse min-w-[320px] sm:min-w-0">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-right py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Amount</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Method</th>
                    <th className="text-left py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr className="border-b border-border/40">
                      <td colSpan={4} className="py-4 px-4 text-center text-muted-foreground text-xs">No payments yet.</td>
                    </tr>
                  ) : (
                    payments.map((r) => (
                      <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                        <td className="py-2 px-4 tabular-nums">{r.date}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium">{fmtUsd(r.amount)}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.paymentMethod ?? "—"}</td>
                        <td className="py-2 px-4 text-muted-foreground max-w-[200px] truncate" title={r.notes ?? undefined}>{r.notes ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Pay Worker Modal */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay Worker</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePaySubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">Select items to include in this payment. Total will be calculated automatically.</p>

            {unpaidLabor.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Unpaid labor entries</p>
                <div className="max-h-32 overflow-y-auto border border-border/60 rounded-sm divide-y divide-border/40">
                  {unpaidLabor.map((e) => (
                    <label key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/10 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLaborIds.has(e.id)}
                        onChange={() => toggleLabor(e.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm flex-1 truncate">{e.date} · {e.projectName ?? "—"}</span>
                      <span className="text-sm tabular-nums font-medium">{fmtUsd(e.amount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {unpaidReimb.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Unpaid reimbursements</p>
                <div className="max-h-32 overflow-y-auto border border-border/60 rounded-sm divide-y divide-border/40">
                  {unpaidReimb.map((r) => (
                    <label key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/10 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedReimbIds.has(r.id)}
                        onChange={() => toggleReimb(r.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm flex-1 truncate">{r.date} · {r.vendor ?? "—"}</span>
                      <span className="text-sm tabular-nums font-medium">{fmtUsd(r.amount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border/60 pt-3">
              <p className="text-sm font-semibold flex justify-between">
                <span>Total Payment Amount</span>
                <span className="tabular-nums">{fmtUsd(totalPaymentAmount)}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Payment method</label>
              <Input
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="e.g. Check, ACH, Cash"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Payment date</label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Notes (optional)</label>
              <Input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Optional notes"
                className="h-9"
              />
            </div>

            {payError ? <p className="text-sm text-destructive">{payError}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPayModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={paySubmitting || totalPaymentAmount <= 0}>
                {paySubmitting ? "Processing…" : "Confirm Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
