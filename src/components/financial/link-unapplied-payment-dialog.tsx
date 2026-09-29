"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/native-select";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  linkUnappliedPaymentToInvoiceAction,
  listOpenInvoicesForUnappliedPaymentAction,
} from "@/app/financial/payments/actions";
import type { LinkableInvoiceOption } from "@/lib/payments-received-db";

export type LinkUnappliedPaymentTarget = {
  id: string;
  amount: number;
  customerName: string;
  date: string;
  method: string | null;
  reference: string | null;
};

export function LinkUnappliedPaymentDialog({
  payment,
  open,
  onOpenChange,
  onLinked,
}: {
  payment: LinkUnappliedPaymentTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const [invoices, setInvoices] = React.useState<LinkableInvoiceOption[]>([]);
  const [invoiceId, setInvoiceId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !payment) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInvoices([]);
    setInvoiceId("");
    void listOpenInvoicesForUnappliedPaymentAction(payment.id).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInvoices(result.invoices);
      setInvoiceId(result.invoices[0]?.id ?? "");
      if (result.invoices.length === 0) {
        setError("No open invoice for this project and customer can take this payment.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, payment]);

  const submit = async () => {
    if (!payment || !invoiceId) return;
    setSaving(true);
    setError(null);
    const result = await linkUnappliedPaymentToInvoiceAction(payment.id, invoiceId);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onLinked();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="link-to-invoice-dialog">
        <DialogHeader>
          <DialogTitle>Link to invoice</DialogTitle>
          <DialogDescription>
            Apply this unapplied payment to an open invoice for the same project and customer. The
            invoice paid amount and balance update from the payment record.
          </DialogDescription>
        </DialogHeader>
        {payment ? (
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-hh-body">
            <dt className="text-[var(--hh-text-secondary)]">Date</dt>
            <dd className="tabular-nums">{payment.date ? formatDate(payment.date) : "—"}</dd>
            <dt className="text-[var(--hh-text-secondary)]">Customer</dt>
            <dd>{payment.customerName || "—"}</dd>
            <dt className="text-[var(--hh-text-secondary)]">Method</dt>
            <dd>{payment.method?.trim() || "—"}</dd>
            <dt className="text-[var(--hh-text-secondary)]">Reference</dt>
            <dd>{payment.reference?.trim() || "—"}</dd>
            <dt className="text-[var(--hh-text-secondary)]">Amount</dt>
            <dd className="tabular-nums font-semibold">{formatCurrency(payment.amount)}</dd>
          </dl>
        ) : null}
        <label className="block text-hh-body">
          <span className="mb-1 block text-[var(--hh-text-secondary)]">Open invoice</span>
          <Select
            data-testid="link-payment-invoice"
            value={invoiceId}
            disabled={loading || saving || invoices.length === 0}
            onChange={(event) => setInvoiceId(event.target.value)}
          >
            {invoices.length === 0 ? <option value="">No open invoice</option> : null}
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNo} — {invoice.clientName || "Customer"} (
                {formatCurrency(invoice.balanceDue)} due)
              </option>
            ))}
          </Select>
        </label>
        {error ? (
          <p role="alert" className="text-hh-body text-[var(--hh-danger)]">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="link-payment-submit"
            onClick={() => void submit()}
            disabled={loading || saving || !invoiceId}
          >
            {saving ? "Linking…" : "Link payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
