"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Divider, SectionHeader, StatusBadge } from "@/components/base";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ApBillWithProject, ApBillPaymentRow } from "@/lib/data";
import { addApBillPayment } from "@/lib/data";
import { deleteBillDraftAction, voidBillAction } from "../actions";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { createBrowserClient } from "@/lib/supabase";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import { formatCurrency, formatDate } from "@/lib/formatters";

type Props = {
  bill: ApBillWithProject;
  payments: ApBillPaymentRow[];
  addPaymentOpen: boolean;
};

export function BillDetailClient({ bill, payments, addPaymentOpen: initialAddPaymentOpen }: Props) {
  const router = useRouter();
  const { openPreview } = useAttachmentPreview();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );
  const [addPaymentOpen, setAddPaymentOpen] = React.useState(initialAddPaymentOpen);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentRef, setPaymentRef] = React.useState("");
  const [paymentNotes, setPaymentNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);

  React.useEffect(() => setAddPaymentOpen(initialAddPaymentOpen), [initialAddPaymentOpen]);

  const statusVariant =
    bill.status === "Paid"
      ? "success"
      : bill.status === "Partially Paid" || bill.status === "Pending"
        ? "warning"
        : "muted";

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addApBillPayment(bill.id, {
        payment_date: paymentDate,
        amount: amt,
        payment_method: paymentMethod || undefined,
        reference_no: paymentRef || undefined,
        notes: paymentNotes || undefined,
      });
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentRef("");
      setPaymentNotes("");
      setAddPaymentOpen(false);
      syncRouterNonBlocking(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    const result = await voidBillAction(bill.id);
    if (result.ok) {
      setVoidConfirm(false);
      syncRouterNonBlocking(router);
    }
  };

  const handleDeleteDraft = async () => {
    const result = await deleteBillDraftAction(bill.id);
    if (result.ok) {
      router.push("/bills");
      syncRouterNonBlocking(router);
    } else {
      setError(result.error ?? "Failed to delete bill.");
    }
  };

  return (
    <>
      <div className="grid gap-x-6 gap-y-1 py-3 text-sm border-b border-border/60 grid-cols-[auto_1fr] max-w-2xl">
        <span className="text-muted-foreground">Vendor / payee</span>
        <span className="font-medium">{bill.vendor_name}</span>
        <span className="text-muted-foreground">Type</span>
        <span>{bill.bill_type}</span>
        <span className="text-muted-foreground">Project</span>
        <span>{bill.project_name ?? "—"}</span>
        <span className="text-muted-foreground">Category</span>
        <span>{bill.category ?? "—"}</span>
        <span className="text-muted-foreground">Issue date</span>
        <span>{formatDate(bill.issue_date)}</span>
        <span className="text-muted-foreground">Due date</span>
        <span>{formatDate(bill.due_date)}</span>
        <span className="text-muted-foreground">Status</span>
        <StatusBadge label={bill.status} variant={statusVariant} />
      </div>
      <Divider />
      <SectionHeader label="Financial summary" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 text-sm border-b border-border/60">
        <span className="text-muted-foreground">Total amount</span>
        <span className="tabular-nums font-medium">{formatCurrency(bill.amount)}</span>
        <span className="text-muted-foreground">Paid amount</span>
        <span className="tabular-nums text-hh-profit-positive dark:text-hh-profit-positive">
          {formatCurrency(bill.paid_amount)}
        </span>
        <span className="text-muted-foreground">Balance</span>
        <span className="tabular-nums font-medium">{formatCurrency(bill.balance_amount)}</span>
      </div>
      <Divider />
      <SectionHeader
        label="Payment history"
        action={
          bill.status !== "Paid" &&
          bill.status !== "Void" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setAddPaymentOpen(true)}
            >
              Add payment
            </Button>
          )
        }
      />
      <Divider />
      {payments.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No payments recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Payment date
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                  Amount
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Method
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Reference
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">{formatDate(p.payment_date)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground">{p.payment_method ?? "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{p.reference_no ?? "—"}</td>
                  <td
                    className="py-1.5 px-3 text-muted-foreground max-w-[200px] truncate"
                    title={p.notes ?? ""}
                  >
                    {p.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bill.notes ? (
        <>
          <SectionHeader label="Notes" className="mt-4" />
          <Divider />
          <p className="py-2 text-sm text-muted-foreground">{bill.notes}</p>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border/60 mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/bills/${bill.id}/edit`}>Edit bill</Link>
        </Button>
        {bill.attachment_url ? (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              const raw = (bill.attachment_url ?? "").trim();
              if (!raw) return;
              void (async () => {
                const signed = await resolvePreviewSignedUrl({
                  supabase,
                  rawUrlOrPath: raw,
                  ttlSec: 3600,
                  // Buckets vary by environment; use URL parsing when it's a storage URL.
                  bucketCandidates: [
                    "ap-bills",
                    "bills",
                    "documents",
                    "receipts",
                    "expense-attachments",
                  ],
                });
                openPreview({ url: signed || raw, fileName: "Attachment" });
              })();
            }}
          >
            View attachment
          </Button>
        ) : null}
        {bill.status !== "Void" &&
          (!voidConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost text-muted-foreground"
              onClick={() => setVoidConfirm(true)}
            >
              Mark void
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className="text-red-600" onClick={handleVoid}>
                Confirm void
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="btn-outline-ghost"
                onClick={() => setVoidConfirm(false)}
              >
                Cancel
              </Button>
            </>
          ))}

        {bill.status === "Draft" &&
          payments.length === 0 &&
          (!deleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost text-red-600"
              onClick={() => setDeleteConfirm(true)}
            >
              Delete
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600"
                onClick={handleDeleteDraft}
              >
                Confirm delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="btn-outline-ghost"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </>
          ))}
      </div>

      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPayment} className="grid gap-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Payment date</label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 h-9"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="mt-1 h-9"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Payment method</label>
              <Input
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 h-9"
                placeholder="e.g. Check, ACH"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reference no.</label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddPaymentOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                <SubmitSpinner loading={submitting} className="mr-2" />
                {submitting ? "Saving…" : "Add payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
