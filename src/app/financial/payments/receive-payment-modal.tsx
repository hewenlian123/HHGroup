"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getInvoicesWithDerived,
  getProjects,
  createPaymentReceived,
  PAYMENT_METHODS,
  type InvoiceWithDerived,
  type CreatePaymentReceivedPayload,
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { formatCurrency } from "@/lib/formatters";

type ReceivePaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-fill for invoice detail page: preselect this invoice and lock it. */
  preselectedInvoiceId?: string | null;
  /** Pre-fill remaining balance as default amount. */
  remainingBalance?: number;
};

export function ReceivePaymentModal({
  open,
  onOpenChange,
  onSuccess,
  preselectedInvoiceId,
  remainingBalance,
}: ReceivePaymentModalProps) {
  const { toast } = useToast();
  const [invoices, setInvoices] = React.useState<InvoiceWithDerived[]>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [invoiceId, setInvoiceId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(
    remainingBalance != null ? String(remainingBalance) : ""
  );
  const [paymentMethod, setPaymentMethod] = React.useState<string>(PAYMENT_METHODS[0]);
  const [depositAccount, setDepositAccount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [attachmentUrl, setAttachmentUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getInvoicesWithDerived(), getProjects()]).then(([invList, projList]) => {
      if (cancelled) return;
      const nonVoid = invList.filter((i) => i.computedStatus !== "Void");
      setInvoices(nonVoid);
      setProjects(projList);
      if (preselectedInvoiceId) {
        const inv = nonVoid.find((i) => i.id === preselectedInvoiceId);
        if (inv) {
          setInvoiceId(inv.id);
          setProjectId(inv.projectId);
          setCustomerName(inv.clientName);
          setAmount(remainingBalance != null ? String(remainingBalance) : String(inv.balanceDue));
        }
      } else {
        setInvoiceId("");
        setProjectId("");
        setCustomerName("");
        setAmount(remainingBalance != null ? String(remainingBalance) : "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, preselectedInvoiceId, remainingBalance]);

  React.useEffect(() => {
    if (!invoiceId || preselectedInvoiceId) return;
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) {
      setProjectId(inv.projectId);
      setCustomerName(inv.clientName);
      if (amount === "" || amount === String(remainingBalance)) setAmount(String(inv.balanceDue));
    }
  }, [invoiceId, invoices, preselectedInvoiceId, remainingBalance, amount]);

  const projectNameById = React.useState(() => new Map(projects.map((p) => [p.id, p.name])))[0];
  React.useEffect(() => {
    projectNameById.clear();
    projects.forEach((p) => projectNameById.set(p.id, p.name));
  }, [projects, projectNameById]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const invId = preselectedInvoiceId ?? invoiceId;
    if (!invId) {
      toast({ title: "Select an invoice", variant: "error" });
      return;
    }
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast({ title: "Enter a valid amount", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload: CreatePaymentReceivedPayload = {
        invoice_id: invId,
        project_id: projectId || null,
        customer_name:
          customerName.trim() || (invoices.find((i) => i.id === invId)?.clientName ?? ""),
        payment_date: paymentDate,
        amount: num,
        payment_method: paymentMethod,
        deposit_account: depositAccount.trim() || null,
        notes: notes.trim() || null,
        attachment_url: attachmentUrl.trim() || null,
      };
      await createPaymentReceived(payload);
      onSuccess();
      onOpenChange(false);
      toast({ title: "Payment recorded", variant: "success" });
      setAmount("");
      setNotes("");
    } catch (err) {
      toast({
        title: "Failed to record payment",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/60 rounded-md">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="text-base font-medium">Receive Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Invoice
            </label>
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              required
              disabled={!!preselectedInvoiceId}
            >
              <option value="">Select invoice</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNo} — {inv.clientName} ({formatCurrency(inv.balanceDue)} due)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Project
            </label>
            <Input
              value={projectId ? (projectNameById.get(projectId) ?? projectId) : ""}
              readOnly
              className="h-9 bg-muted/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Customer
            </label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-9"
              placeholder="Customer name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Payment Date
              </label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-9"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount Received
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-9 tabular-nums"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Deposit Account
            </label>
            <Input
              value={depositAccount}
              onChange={(e) => setDepositAccount(e.target.value)}
              placeholder="e.g. Operating Account"
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Attachment URL (optional)
            </label>
            <Input
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              placeholder="https://..."
              className="h-9"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-ghost h-8"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8" disabled={saving}>
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving…" : "Record Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
