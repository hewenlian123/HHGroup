"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getInvoiceByIdWithDerived,
  getProjectById,
  getPaymentsByInvoiceId,
  getPaymentsReceivedByInvoiceId,
  getDepositsByInvoiceId,
  getPaymentMethods,
  markInvoiceSent,
  revertInvoiceToDraft,
  recordInvoicePayment,
  deleteInvoicePayment,
  type InvoiceWithDerived,
  type InvoicePayment,
} from "@/lib/data";
import {
  ArrowLeft,
  Send,
  CreditCard,
  FileText,
  Trash2,
  ChevronDown,
  Ban,
  CircleDollarSign,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteInvoiceAction } from "../actions";
import { ReceivePaymentModal } from "@/app/financial/payments/receive-payment-modal";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";

export default function InvoiceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [invoice, setInvoice] = React.useState<InvoiceWithDerived | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [payments, setPayments] = React.useState<InvoicePayment[]>([]);
  const [paymentsReceived, setPaymentsReceived] = React.useState<
    Awaited<ReturnType<typeof getPaymentsReceivedByInvoiceId>>
  >([]);
  const [deposits, setDeposits] = React.useState<
    Awaited<ReturnType<typeof getDepositsByInvoiceId>>
  >([]);
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [showReceivePaymentModal, setShowReceivePaymentModal] = React.useState(false);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("ACH");
  const [paymentMemo, setPaymentMemo] = React.useState("");
  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [revertOpen, setRevertOpen] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const [invRes, pays, received, depositList] = await Promise.all([
      fetch(`/api/invoices/${encodeURIComponent(id)}?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ ok: false as const })),
      getPaymentsByInvoiceId(id),
      getPaymentsReceivedByInvoiceId(id),
      getDepositsByInvoiceId(id).catch(() => []),
    ]);
    const inv = (
      invRes && invRes.ok ? (invRes.invoice as InvoiceWithDerived) : null
    ) as InvoiceWithDerived | null;
    setInvoice(inv);
    setPayments(pays);
    setPaymentsReceived(received ?? []);
    setDeposits(Array.isArray(depositList) ? depositList : []);
    if (inv === null || inv === undefined) setNotFound(true);
  }, [id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (
      searchParams.get("recordPayment") === "1" &&
      invoice &&
      invoice.computedStatus !== "Void" &&
      invoice.computedStatus !== "Paid"
    ) {
      setShowPaymentModal(true);
    }
  }, [searchParams, invoice]);

  const [methods, setMethods] = React.useState<string[]>([]);
  const [project, setProject] = React.useState<Awaited<ReturnType<typeof getProjectById>> | null>(
    null
  );
  React.useEffect(() => {
    getPaymentMethods().then(setMethods);
  }, []);
  React.useEffect(() => {
    if (invoice) getProjectById(invoice.projectId).then(setProject);
    else setProject(null);
  }, [invoice?.projectId, invoice]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
      void getPaymentMethods().then(setMethods);
    }, [refresh]),
    [refresh]
  );

  useBreadcrumbEntityLabel(invoice?.invoiceNo);

  const { toast } = useToast();

  const handleMarkSent = async () => {
    if (!id) return;
    await markInvoiceSent(id);
    await refresh();
  };

  const handleVoid = async () => {
    if (!id) return;
    setActionBusy(true);
    try {
      const result = await voidInvoiceFromClient(id);
      if (!result.ok) {
        toast({
          title: "Could not void invoice",
          description: result.message,
          variant: "error",
        });
        return;
      }
      toast({ title: "Invoice voided", variant: "success" });
      await refresh();
    } catch (e) {
      toast({
        title: "Could not void invoice",
        description: e instanceof Error ? e.message : "Network error",
        variant: "error",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setActionBusy(true);
    const result = await deleteInvoiceAction(id);
    setActionBusy(false);
    if (result.ok) router.push("/financial/invoices");
  };

  const handleRevertToDraft = async () => {
    if (!id) return;
    setActionBusy(true);
    try {
      await revertInvoiceToDraft(id);
      setRevertOpen(false);
      await refresh();
    } finally {
      setActionBusy(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!id || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    await recordInvoicePayment(id, {
      date: paymentDate,
      amount,
      method: paymentMethod,
      memo: paymentMemo.trim() || undefined,
    });
    setPaymentAmount("");
    setPaymentMemo("");
    setShowPaymentModal(false);
    await refresh();
  };

  const handleDeletePayment = async (paymentId: string) => {
    await deleteInvoicePayment(paymentId);
    await refresh();
  };

  if (!id) {
    return (
      <div className="mx-auto max-w-[800px] p-6">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button asChild variant="outline" className="mt-4 rounded-lg">
          <Link href="/financial/invoices">Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  if (notFound) {
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
  const canRevertToDraft = invoice.computedStatus === "Void" || invoice.computedStatus === "Paid";

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
            <InvoiceStatusBadge status={invoice.computedStatus} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href={`/financial/invoices/${id}/print`}>
              <FileText className="h-4 w-4 mr-2" />
              Print
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-lg" disabled={actionBusy}>
                Actions
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {!isVoid && (
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-700"
                  onSelect={(e) => {
                    e.preventDefault();
                    if (
                      !window.confirm(
                        "Void this invoice? Total and balance will be set to zero. This cannot be undone."
                      )
                    ) {
                      return;
                    }
                    void handleVoid();
                  }}
                  disabled={actionBusy}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Void Invoice
                </DropdownMenuItem>
              )}
              {canRevertToDraft ? (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setRevertOpen(true);
                  }}
                  disabled={actionBusy}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Revert to Draft
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-red-600 focus:text-red-700"
                onSelect={(e) => {
                  e.preventDefault();
                  if (isDraft) {
                    if (
                      window.confirm(
                        "Permanently delete this draft invoice? This cannot be undone."
                      )
                    ) {
                      void handleDelete();
                    }
                  } else {
                    setDeleteBlockedOpen(true);
                  }
                }}
                disabled={actionBusy}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={handleMarkSent}
              disabled={actionBusy}
            >
              <Send className="h-4 w-4 mr-2" />
              Mark Sent
            </Button>
          )}
          {canPay && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setShowPaymentModal(true)}
              disabled={actionBusy}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
          {!isVoid && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={() => setShowReceivePaymentModal(true)}
              disabled={actionBusy}
            >
              <CircleDollarSign className="h-4 w-4 mr-2" />
              Receive Payment
            </Button>
          )}
        </div>
      </div>

      <section className="border-b border-[#EBEBE9] pb-6 dark:border-border">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Client / Project</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{invoice.clientName}</span>
          {" — "}
          {project?.name ?? invoice.projectId}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="text-muted-foreground">Status</span>
          <InvoiceStatusBadge status={invoice.computedStatus} />
          <span className="ml-2 text-muted-foreground">Due date</span>
          <span
            className={cn(
              "tabular-nums",
              invoice.computedStatus === "Overdue" && "text-red-600 dark:text-red-400"
            )}
          >
            {invoice.dueDate}
          </span>
          {invoice.daysOverdue > 0 && (
            <>
              <span className="ml-2 text-muted-foreground">Days overdue</span>
              <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                {invoice.daysOverdue}
              </span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Issue: {invoice.issueDate}</p>
      </section>

      <div className="overflow-hidden rounded-sm border border-[#EBEBE9] dark:border-border">
        <h2 className="p-4 pb-2 text-sm font-semibold text-foreground">Line items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Description
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                  Qty
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                  Unit price
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line, idx) => (
                <tr
                  key={idx}
                  className="border-b border-[#EBEBE9]/80 transition-colors hover:bg-[#F7F7F5] dark:border-border/40 dark:hover:bg-muted/20"
                >
                  <td className="py-3 px-4 text-foreground">{line.description}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                    {line.qty}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                    ${line.unitPrice.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">
                    ${line.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="border-b border-[#EBEBE9] pb-6 dark:border-border">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Totals</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">${invoice.subtotal.toLocaleString()}</span>
          </div>
          {invoice.taxAmount != null && invoice.taxAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Tax {invoice.taxPct != null ? `(${invoice.taxPct}%)` : ""}
              </span>
              <span className="tabular-nums">${invoice.taxAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#EBEBE9] pt-2 font-medium dark:border-border">
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
      </section>

      <div className="overflow-hidden rounded-sm border border-[#EBEBE9] dark:border-border">
        <h2 className="p-4 pb-2 text-sm font-semibold text-foreground">Payments history</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">No payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Date
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Amount
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Method
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Memo
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[#EBEBE9]/80 transition-colors hover:bg-[#F7F7F5] dark:border-border/40 dark:hover:bg-muted/20"
                  >
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
      </div>

      <div className="overflow-hidden rounded-sm border border-[#EBEBE9] dark:border-border">
        <h2 className="p-4 pb-2 text-sm font-semibold text-foreground">Payments</h2>
        {paymentsReceived.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">No payments received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Date
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Amount
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Method
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Account
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {paymentsReceived.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[#EBEBE9]/80 transition-colors hover:bg-[#F7F7F5] dark:border-border/40 dark:hover:bg-muted/20"
                  >
                    <td className="py-3 px-4 tabular-nums">{p.payment_date}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium text-emerald-600/90 dark:text-emerald-400/90">
                      ${p.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{p.payment_method ?? "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{p.deposit_account ?? "—"}</td>
                    <td
                      className="py-3 px-4 text-muted-foreground max-w-[200px] truncate"
                      title={p.notes ?? undefined}
                    >
                      {p.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-sm border border-[#EBEBE9] dark:border-border">
        <h2 className="p-4 pb-2 text-sm font-semibold text-foreground">Deposits</h2>
        {deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">
            No deposits linked to this invoice.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Deposit Date
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Amount
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Payment Method
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Account
                  </th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-[#EBEBE9]/80 transition-colors hover:bg-[#F7F7F5] dark:border-border/40 dark:hover:bg-muted/20"
                  >
                    <td className="py-3 px-4 tabular-nums">
                      {(d as { date?: string }).date ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium text-emerald-600/90 dark:text-emerald-400/90">
                      ${d.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">—</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {(d as { account?: string | null }).account ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPaymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-sm border border-[#EBEBE9] bg-background p-6 dark:border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-semibold text-foreground">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Date
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 rounded-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Amount
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1 rounded-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Method
                </label>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1"
                >
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Memo (optional)
                </label>
                <Input
                  value={paymentMemo}
                  onChange={(e) => setPaymentMemo(e.target.value)}
                  placeholder="Memo"
                  className="mt-1 rounded-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <Button
                size="sm"
                className="rounded-sm"
                onClick={handleRecordPayment}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              >
                Record
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm"
                onClick={() => setShowPaymentModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <ReceivePaymentModal
        open={showReceivePaymentModal}
        onOpenChange={setShowReceivePaymentModal}
        onSuccess={refresh}
        preselectedInvoiceId={id}
        remainingBalance={invoice?.balanceDue}
      />

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className="max-w-sm border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Cannot delete invoice</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Only draft or void invoices can be deleted. Issued or paid invoices cannot be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setDeleteBlockedOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revertOpen} onOpenChange={setRevertOpen}>
        <DialogContent className="max-w-sm border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Revert invoice to draft?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This will allow editing or deleting the invoice again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevertOpen(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleRevertToDraft} disabled={actionBusy}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
