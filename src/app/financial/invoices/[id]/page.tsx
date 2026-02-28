"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getInvoiceById,
  getProjectById,
  getPaymentsByInvoiceId,
  getPaymentMethods,
  markInvoiceSent,
  voidInvoice,
  recordInvoicePayment,
  deleteInvoicePayment,
  type InvoiceWithDerived,
  type InvoicePayment,
} from "@/lib/data";
import { ArrowLeft, Send, CreditCard, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InvoiceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const [invoice, setInvoice] = React.useState<InvoiceWithDerived | null>(null);
  const [payments, setPayments] = React.useState<InvoicePayment[]>([]);
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("ACH");
  const [paymentMemo, setPaymentMemo] = React.useState("");
  const [voidConfirm, setVoidConfirm] = React.useState(false);

  const refresh = React.useCallback(() => {
    if (!id) return;
    setInvoice(getInvoiceById(id) ?? null);
    setPayments(getPaymentsByInvoiceId(id));
  }, [id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (searchParams.get("recordPayment") === "1" && invoice && invoice.computedStatus !== "Void" && invoice.computedStatus !== "Paid") {
      setShowPaymentModal(true);
    }
  }, [searchParams, invoice]);

  const methods = getPaymentMethods();
  const project = invoice ? getProjectById(invoice.projectId) : null;

  const handleMarkSent = () => {
    if (!id) return;
    markInvoiceSent(id);
    refresh();
  };

  const handleVoid = () => {
    if (!id) return;
    voidInvoice(id);
    setVoidConfirm(false);
    refresh();
  };

  const handleRecordPayment = () => {
    if (!id || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    recordInvoicePayment(id, {
      date: paymentDate,
      amount,
      method: paymentMethod,
      memo: paymentMemo.trim() || undefined,
    });
    setPaymentAmount("");
    setPaymentMemo("");
    setShowPaymentModal(false);
    refresh();
  };

  const handleDeletePayment = (paymentId: string) => {
    deleteInvoicePayment(paymentId);
    refresh();
  };

  if (!id || (invoice === null && !getInvoiceById(id))) {
    return (
      <div className="mx-auto max-w-[800px] p-6">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button asChild variant="outline" className="mt-4 rounded-lg">
          <Link href="/financial/invoices">Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return <div className="mx-auto max-w-[800px] p-6">Loading…</div>;
  }

  const isDraft = invoice.status === "Draft";
  const isVoid = invoice.computedStatus === "Void";
  const canPay = !isVoid && invoice.computedStatus !== "Paid";

  return (
    <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/financial/invoices"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{invoice.invoiceNo}</h1>
            <span
              className={cn(
                "inline-block text-xs font-medium px-2 py-1 rounded",
                invoice.computedStatus === "Paid" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400",
                invoice.computedStatus === "Partially Paid" && "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
                invoice.computedStatus === "Sent" && "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300",
                invoice.computedStatus === "Draft" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
                invoice.computedStatus === "Void" && "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400"
              )}
            >
              {invoice.computedStatus}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href={`/financial/invoices/${id}/print`}>
              <FileText className="h-4 w-4 mr-2" />
              Print
            </Link>
          </Button>
          {isDraft && (
            <Button variant="outline" size="sm" className="rounded-lg" onClick={handleMarkSent}>
              <Send className="h-4 w-4 mr-2" />
              Mark Sent
            </Button>
          )}
          {canPay && (
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setShowPaymentModal(true)}>
              <CreditCard className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
          {!isVoid && (
            voidConfirm ? (
              <>
                <Button variant="destructive" size="sm" className="rounded-lg" onClick={handleVoid}>
                  Confirm Void
                </Button>
                <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setVoidConfirm(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="rounded-lg text-red-600 border-red-200" onClick={() => setVoidConfirm(true)}>
                Void
              </Button>
            )
          )}
        </div>
      </div>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Client / Project</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{invoice.clientName}</span>
          {" — "}
          {project?.name ?? invoice.projectId}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Issue: {invoice.issueDate} · Due: {invoice.dueDate}
        </p>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground p-4 pb-2">Line items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Qty</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Unit price</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line, idx) => (
                <tr key={idx} className="border-b border-zinc-100/50 dark:border-border/30">
                  <td className="py-3 px-4 text-foreground">{line.description}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{line.qty}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">${line.unitPrice.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">${line.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground px-4 pb-2">Line items editable only in Draft (mock).</p>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Totals</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">${invoice.subtotal.toLocaleString()}</span>
          </div>
          {invoice.taxAmount != null && invoice.taxAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax {invoice.taxPct != null ? `(${invoice.taxPct}%)` : ""}</span>
              <span className="tabular-nums">${invoice.taxAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-medium pt-2 border-t border-zinc-200/60 dark:border-border">
            <span>Total</span>
            <span className="tabular-nums">${invoice.total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>Paid</span>
            <span className="tabular-nums">${invoice.paidTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Balance due</span>
            <span className="tabular-nums">${invoice.balanceDue.toLocaleString()}</span>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground p-4 pb-2">Payments history</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">No payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Method</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Memo</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 tabular-nums">{p.date}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium text-emerald-600/90 dark:text-emerald-400/90">
                      ${p.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{p.method}</td>
                    <td className="py-3 px-4 text-muted-foreground">{p.memo ?? "—"}</td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-red-600 hover:text-red-700"
                        onClick={() => handleDeletePayment(p.id)}
                        title="Delete payment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPaymentModal(false)}>
          <Card
            className="rounded-2xl border border-zinc-200/60 dark:border-border p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1 rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                >
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Memo (optional)</label>
                <Input
                  value={paymentMemo}
                  onChange={(e) => setPaymentMemo(e.target.value)}
                  placeholder="Memo"
                  className="mt-1 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button onClick={handleRecordPayment} className="rounded-lg" disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}>
                Record
              </Button>
              <Button variant="outline" className="rounded-lg" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
