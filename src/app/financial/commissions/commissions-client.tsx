"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
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
import type { CommissionWithPaid } from "@/lib/data";

const PAYMENT_METHODS = ["Check", "Bank Transfer", "Cash", "Zelle", "Other"] as const;

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = CommissionWithPaid & { project_name: string };

export function CommissionsClient({
  summary,
  rows,
}: {
  summary: {
    totalCommission: number;
    paidCommission: number;
    outstandingCommission: number;
    thisMonthPaid: number;
  };
  rows: Row[];
}) {
  const router = useRouter();
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);
  const [selectedCommission, setSelectedCommission] = React.useState<Row | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "Check" as string,
    reference_no: "",
    notes: "",
  });

  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const openPaymentModal = (row: Row) => {
    setSelectedCommission(row);
    setPaymentForm({
      amount: row.outstanding_amount > 0 ? String(row.outstanding_amount) : "",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "Check",
      reference_no: "",
      notes: "",
    });
    setError(null);
    setPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommission) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${selectedCommission.project_id}/commissions/${selectedCommission.id}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(paymentForm.amount) || 0,
            payment_date: paymentForm.payment_date,
            payment_method: paymentForm.payment_method,
            reference_no: paymentForm.reference_no.trim() || null,
            notes: paymentForm.notes.trim() || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to record payment");
      setPaymentModalOpen(false);
      setSelectedCommission(null);
      void syncRouterAndClients(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Commission Payments"
        description="Track commissions and record payments."
      />

      <section className="border-b border-border/60 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-border/60 rounded-sm px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Commission</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">${fmtUsd(summary.totalCommission)}</p>
          </div>
          <div className="border border-border/60 rounded-sm px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid Commission</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">${fmtUsd(summary.paidCommission)}</p>
          </div>
          <div className="border border-border/60 rounded-sm px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outstanding Commission</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">${fmtUsd(summary.outstandingCommission)}</p>
          </div>
          <div className="border border-border/60 rounded-sm px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This Month Paid</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">${fmtUsd(summary.thisMonthPaid)}</p>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto rounded-sm border border-border/60 mt-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Person</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Commission Amount</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Paid Amount</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Outstanding</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground text-sm">
                  No commissions.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                  <td className="py-2 px-3 font-medium text-foreground">{r.project_name || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.person_name || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.role}</td>
                  <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(r.commission_amount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">${fmtUsd(r.paid_amount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">${fmtUsd(r.outstanding_amount)}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.status}</td>
                  <td className="py-2 px-3">
                    {r.outstanding_amount > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs rounded-sm"
                        onClick={() => openPaymentModal(r)}
                      >
                        Record Payment
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-md border-border/60 rounded-sm gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Record Payment</DialogTitle>
          </DialogHeader>
          {selectedCommission && (
            <p className="text-sm text-muted-foreground">
              {selectedCommission.person_name} · {selectedCommission.project_name} · Outstanding: ${fmtUsd(selectedCommission.outstanding_amount)}
            </p>
          )}
          <form id="payment-form" onSubmit={handleRecordPayment} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Amount</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                className="h-9 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Date</label>
              <Input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))}
                className="h-9 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Method</label>
              <select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm((p) => ({ ...p, payment_method: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Reference No</label>
              <Input
                value={paymentForm.reference_no}
                onChange={(e) => setPaymentForm((p) => ({ ...p, reference_no: e.target.value }))}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
              <Input
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
          <DialogFooter className="border-t border-border/60 pt-3">
            <Button type="button" variant="outline" size="sm" className="rounded-sm h-9" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="payment-form" size="sm" disabled={submitting} className="rounded-sm h-9">
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
