"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
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
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { ConfirmDialog } from "@/components/base";
import {
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
  Eye,
  Trash2,
  ChevronDown,
  Ban,
  CircleDollarSign,
  RotateCcw,
  CalendarDays,
  Building2,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteInvoiceAction, updateInvoiceAction } from "../actions";
import { ReceivePaymentModal } from "@/app/financial/payments/receive-payment-modal";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";
import { formatCurrency, formatDate } from "@/lib/formatters";

type EditLineDraft = {
  description: string;
  qty: number;
  unitPrice: number;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isTestInvoice(inv: InvoiceWithDerived): boolean {
  const haystack = [inv.clientName, inv.invoiceNo, inv.notes ?? ""].join(" ").toLowerCase();
  return (
    haystack.includes("workflow test") ||
    haystack.includes("[e2e]") ||
    haystack.includes("playwright") ||
    haystack.includes("body balance") ||
    /\bpw[-\s_]/i.test(haystack)
  );
}

function DetailMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "positive" | "danger";
}) {
  return (
    <div className="min-w-0 rounded-md border border-gray-100 bg-white px-3 py-2 dark:border-border dark:bg-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold tabular-nums text-foreground",
          tone === "muted" && "text-muted-foreground",
          tone === "positive" && "text-hh-profit-positive",
          tone === "danger" && "text-red-600 dark:text-red-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyLedgerState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-4 py-5 text-sm text-muted-foreground dark:border-border dark:bg-muted/20">
      {children}
    </div>
  );
}

function ToolbarDivider() {
  return (
    <span aria-hidden="true" className="hidden h-5 w-px bg-gray-200 dark:bg-border sm:block" />
  );
}

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = React.useState(false);
  const [revertOpen, setRevertOpen] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editAttempted, setEditAttempted] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editClientName, setEditClientName] = React.useState("");
  const [editIssueDate, setEditIssueDate] = React.useState("");
  const [editDueDate, setEditDueDate] = React.useState("");
  const [editTaxPct, setEditTaxPct] = React.useState(0);
  const [editNotes, setEditNotes] = React.useState("");
  const [editLines, setEditLines] = React.useState<EditLineDraft[]>([]);

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
      invoice.computedStatus !== "Paid" &&
      invoice.computedStatus !== "Draft"
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

  const resetEditDraft = React.useCallback((source: InvoiceWithDerived) => {
    setEditClientName(source.clientName ?? "");
    setEditIssueDate((source.issueDate ?? "").slice(0, 10));
    setEditDueDate((source.dueDate ?? "").slice(0, 10));
    setEditTaxPct(safeNumber(source.taxPct ?? 0));
    setEditNotes(source.notes ?? "");
    setEditLines(
      source.lineItems.length > 0
        ? source.lineItems.map((line) => ({
            description: line.description ?? "",
            qty: safeNumber(line.qty),
            unitPrice: safeNumber(line.unitPrice),
          }))
        : [{ description: "", qty: 1, unitPrice: 0 }]
    );
    setEditAttempted(false);
    setEditError(null);
  }, []);

  const startEditing = React.useCallback(() => {
    if (!id || !invoice || invoice.status !== "Draft") return;
    router.push(`/financial/invoices/${id}/edit`);
  }, [id, invoice, router]);

  const cancelEditing = React.useCallback(() => {
    if (invoice) resetEditDraft(invoice);
    setEditing(false);
  }, [invoice, resetEditDraft]);

  const editValidationErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (!invoice?.projectId) errors.push("Project is required.");
    if (!editClientName.trim()) errors.push("Client name is required.");
    if (!editLines.some((line) => line.description.trim().length > 0)) {
      errors.push("At least one line item is required.");
    }
    return errors;
  }, [editClientName, editLines, invoice?.projectId]);

  const editSubtotal = React.useMemo(
    () =>
      editLines.reduce(
        (sum, line) =>
          sum + Math.max(0, safeNumber(line.qty)) * Math.max(0, safeNumber(line.unitPrice)),
        0
      ),
    [editLines]
  );
  const editTaxAmount = React.useMemo(
    () => Math.round(editSubtotal * (Math.max(0, safeNumber(editTaxPct)) / 100) * 100) / 100,
    [editSubtotal, editTaxPct]
  );
  const editTotal = editSubtotal + editTaxAmount;

  const handleSaveEdit = async () => {
    if (!id || !invoice || editSaving || actionBusy) return;
    setEditAttempted(true);
    if (editValidationErrors.length > 0) {
      const msg = editValidationErrors[0] ?? "Please complete the invoice.";
      setEditError(msg);
      toast({ title: "Invoice is incomplete", description: msg, variant: "error" });
      return;
    }

    setEditSaving(true);
    setEditError(null);
    const result = await updateInvoiceAction(id, {
      projectId: invoice.projectId,
      clientName: editClientName,
      issueDate: editIssueDate,
      dueDate: editDueDate,
      taxPct: Math.max(0, safeNumber(editTaxPct)),
      notes: editNotes,
      lineItems: editLines.map((line) => ({
        description: line.description,
        qty: Math.max(0, safeNumber(line.qty)),
        unitPrice: Math.max(0, safeNumber(line.unitPrice)),
      })),
    });
    if (!result.ok) {
      const msg = result.error ?? "Failed to save invoice.";
      setEditError(msg);
      toast({ title: "Could not save invoice", description: msg, variant: "error" });
      setEditSaving(false);
      return;
    }
    toast({ title: "Invoice saved", variant: "success" });
    setEditing(false);
    setEditSaving(false);
    await refresh();
  };

  const handleMarkSent = async () => {
    if (!id || actionBusy || editSaving) return;
    setActionBusy(true);
    try {
      await markInvoiceSent(id);
      await refresh();
    } finally {
      setActionBusy(false);
    }
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
      void refresh();
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
    if (!id || actionBusy) return;
    setActionBusy(true);
    const result = await deleteInvoiceAction(id);
    setActionBusy(false);
    if (result.ok) router.push("/financial/invoices");
    else {
      toast({
        title: "Could not delete invoice",
        description: result.error ?? "Only draft or void invoices can be deleted.",
        variant: "error",
      });
    }
  };

  const handleRevertToDraft = async () => {
    if (!id) return;
    setActionBusy(true);
    try {
      await revertInvoiceToDraft(id);
      setRevertOpen(false);
      void refresh();
    } finally {
      setActionBusy(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!id || !paymentAmount || actionBusy) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    setActionBusy(true);
    try {
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
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    setDeletingPaymentId(paymentId);
    const prev = payments;
    setPayments((list) => list.filter((p) => p.id !== paymentId));
    if (invoice) {
      const removed = payments.find((p) => p.id === paymentId);
      if (removed) {
        const nextPaid = Math.max(0, invoice.paidTotal - removed.amount);
        const nextBalance = Math.max(0, invoice.total - nextPaid);
        setInvoice({ ...invoice, paidTotal: nextPaid, balanceDue: nextBalance });
      }
    }
    try {
      await deleteInvoicePayment(paymentId);
      void refresh();
    } catch {
      setPayments(prev);
    } finally {
      setDeletingPaymentId(null);
    }
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
    return <div className="mx-auto max-w-[800px] p-6">Loading...</div>;
  }

  const isDraft = invoice.status === "Draft";
  const isVoid = invoice.computedStatus === "Void";
  const isTestDataInvoice = isTestInvoice(invoice);
  const canPay = !isVoid && invoice.computedStatus !== "Paid" && !isDraft && invoice.balanceDue > 0;
  const canRevertToDraft = invoice.computedStatus === "Void" || invoice.computedStatus === "Paid";
  const primaryActionBusy = actionBusy || editSaving;
  const projectName = project?.name ?? invoice.projectId;
  const toolbarButtonClass =
    "h-8 rounded-[5px] border-0 bg-transparent px-2.5 shadow-none hover:!translate-y-0 hover:bg-gray-50 hover:shadow-none dark:bg-transparent dark:hover:bg-muted/50";
  const displayedSubtotal = editing ? editSubtotal : invoice.subtotal;
  const displayedTax = editing ? editTaxAmount : (invoice.taxAmount ?? 0);
  const displayedTotal = editing ? editTotal : invoice.total;
  const displayedBalance = editing
    ? Math.max(0, editTotal - invoice.paidTotal)
    : invoice.balanceDue;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:py-6">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 dark:border-border lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/financial/invoices"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Invoices
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">
              {invoice.invoiceNo}
            </h1>
            <InvoiceStatusBadge status={invoice.computedStatus} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">
                <span className="font-medium text-foreground">{invoice.clientName}</span>
                <span className="mx-1 text-gray-300">/</span>
                {projectName}
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Issued {formatDate(invoice.issueDate)}
            </span>
          </div>
        </div>

        <div className="flex w-full justify-start lg:w-auto lg:justify-end">
          <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-border dark:bg-card lg:flex-nowrap">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={toolbarButtonClass}
                  onClick={cancelEditing}
                  disabled={primaryActionBusy}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-[5px] px-3"
                  onClick={handleSaveEdit}
                  disabled={primaryActionBusy}
                >
                  <SubmitSpinner loading={editSaving} className="mr-2" />
                  Save
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-0.5">
                  <Button asChild variant="ghost" size="sm" className={toolbarButtonClass}>
                    <Link href={`/financial/invoices/${id}/preview`}>
                      <Eye className="h-4 w-4" />
                      Preview
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className={toolbarButtonClass}>
                    <Link href={`/financial/invoices/${id}/print`}>
                      <FileText className="h-4 w-4" />
                      Print
                    </Link>
                  </Button>
                </div>

                <ToolbarDivider />

                <div className="flex items-center gap-0.5">
                  {isDraft ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClass}
                      onClick={startEditing}
                      disabled={primaryActionBusy}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  ) : null}
                  {isDraft ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClass}
                      onClick={handleMarkSent}
                      disabled={primaryActionBusy}
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </Button>
                  ) : null}
                  {canPay ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClass}
                      onClick={() => setShowPaymentModal(true)}
                      disabled={primaryActionBusy}
                    >
                      <CreditCard className="h-4 w-4" />
                      Record
                    </Button>
                  ) : null}
                  {canPay ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClass}
                      onClick={() => setShowReceivePaymentModal(true)}
                      disabled={primaryActionBusy}
                    >
                      <CircleDollarSign className="h-4 w-4" />
                      Receive
                    </Button>
                  ) : null}
                </div>

                <ToolbarDivider />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClass}
                      disabled={primaryActionBusy}
                    >
                      More
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[190px]">
                    {!isVoid ? (
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onSelect={(e) => {
                          e.preventDefault();
                          setVoidConfirmOpen(true);
                        }}
                        disabled={primaryActionBusy}
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        Void Invoice
                      </DropdownMenuItem>
                    ) : null}
                    {canRevertToDraft ? (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setRevertOpen(true);
                        }}
                        disabled={primaryActionBusy}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Revert to Draft
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-700"
                      onSelect={(e) => {
                        e.preventDefault();
                        if (isDraft || isVoid || isTestDataInvoice) setDeleteConfirmOpen(true);
                        else setDeleteBlockedOpen(true);
                      }}
                      disabled={primaryActionBusy}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Invoice
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <section className="rounded-md border border-gray-100 bg-white p-4 dark:border-border dark:bg-card">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Client name
              </label>
              <Input
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                placeholder="Client"
                className="mt-1 rounded-sm"
                aria-invalid={editAttempted && !editClientName.trim()}
              />
              {editAttempted && !editClientName.trim() ? (
                <p className="mt-1 text-xs text-rose-600">Client name is required.</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Project
              </p>
              <p className="mt-1 rounded-sm border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                {projectName}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Issue date
              </label>
              <Input
                type="date"
                value={editIssueDate}
                onChange={(e) => setEditIssueDate((e.target.value || editIssueDate).slice(0, 10))}
                className="mt-1 rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Due date
              </label>
              <Input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate((e.target.value || editDueDate).slice(0, 10))}
                className="mt-1 rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tax %
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editTaxPct}
                onChange={(e) => setEditTaxPct(safeNumber(e.target.value))}
                className="mt-1 rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Terms / notes"
                className="mt-1 rounded-sm"
              />
            </div>
            {editError ? <p className="text-sm text-rose-600 md:col-span-2">{editError}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailMetric label="Balance due" value={formatCurrency(displayedBalance)} />
        <DetailMetric label="Total" value={formatCurrency(displayedTotal)} />
        <DetailMetric label="Paid" value={formatCurrency(invoice.paidTotal)} tone="positive" />
        <DetailMetric
          label={invoice.daysOverdue > 0 ? "Overdue" : "Due date"}
          value={
            invoice.daysOverdue > 0 ? `${invoice.daysOverdue} days` : formatDate(invoice.dueDate)
          }
          tone={invoice.daysOverdue > 0 ? "danger" : "muted"}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-md border border-gray-100 bg-white dark:border-border dark:bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Line items</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Billable work and materials on this invoice.
                </p>
              </div>
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-sm"
                  onClick={() =>
                    setEditLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }])
                  }
                  disabled={primaryActionBusy}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add line
                </Button>
              ) : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {invoice.lineItems.length} item{invoice.lineItems.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {editing &&
            editAttempted &&
            !editLines.some((line) => line.description.trim().length > 0) ? (
              <p className="px-4 pt-3 text-xs text-rose-600">At least one line item is required.</p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-border/60 dark:bg-muted/30">
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
                    {editing ? <th className="py-3 px-2 w-[52px]" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? editLines : invoice.lineItems).map((line, idx) => {
                    const qty = safeNumber(line.qty);
                    const unitPrice = safeNumber(line.unitPrice);
                    const savedAmount = "amount" in line ? safeNumber(line.amount) : 0;
                    const amount = editing
                      ? Math.max(0, qty) * Math.max(0, unitPrice)
                      : savedAmount;
                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-100/80 transition-colors last:border-0 hover:bg-gray-50 dark:border-border/40 dark:hover:bg-muted/20"
                      >
                        <td className="py-3 px-4 text-foreground">
                          {editing ? (
                            <Input
                              value={line.description}
                              onChange={(e) =>
                                setEditLines((prev) =>
                                  prev.map((current, i) =>
                                    i === idx
                                      ? { ...current, description: e.target.value }
                                      : current
                                  )
                                )
                              }
                              placeholder="Description"
                              aria-label={`Line item ${idx + 1} description`}
                              aria-invalid={editAttempted && !line.description.trim()}
                            />
                          ) : (
                            line.description
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                          {editing ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={qty}
                              onChange={(e) =>
                                setEditLines((prev) =>
                                  prev.map((current, i) =>
                                    i === idx
                                      ? { ...current, qty: safeNumber(e.target.value) }
                                      : current
                                  )
                                )
                              }
                              className="text-right tabular-nums"
                              aria-label={`Line item ${idx + 1} quantity`}
                            />
                          ) : (
                            qty
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                          {editing ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={unitPrice}
                              onChange={(e) =>
                                setEditLines((prev) =>
                                  prev.map((current, i) =>
                                    i === idx
                                      ? { ...current, unitPrice: safeNumber(e.target.value) }
                                      : current
                                  )
                                )
                              }
                              className="text-right tabular-nums"
                              aria-label={`Line item ${idx + 1} unit price`}
                            />
                          ) : (
                            formatCurrency(unitPrice)
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums font-medium">
                          {formatCurrency(amount)}
                        </td>
                        {editing ? (
                          <td className="py-3 px-2 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="btn-outline-destructive h-8"
                              aria-label="Remove line item"
                              title="Remove line item"
                              onClick={() =>
                                setEditLines((prev) =>
                                  prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)
                                )
                              }
                              disabled={primaryActionBusy || editLines.length <= 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-gray-100 bg-white p-4 dark:border-border dark:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Activity ledger</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Payments, deposits, and receipt records tied to this invoice.
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payments history
                </h3>
                {payments.length === 0 ? (
                  <EmptyLedgerState>No payments recorded.</EmptyLedgerState>
                ) : (
                  <div className="overflow-hidden rounded-md border border-gray-100 dark:border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2">
                              <p className="tabular-nums text-foreground">{formatDate(p.date)}</p>
                              <p className="text-xs text-muted-foreground">{p.method}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums text-hh-profit-positive">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="w-10 px-2 py-2 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="btn-outline-ghost h-8 text-red-600 hover:text-red-700"
                                onClick={() => handleDeletePayment(p.id)}
                                disabled={deletingPaymentId === p.id}
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

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payments
                </h3>
                {paymentsReceived.length === 0 ? (
                  <EmptyLedgerState>No payments received yet.</EmptyLedgerState>
                ) : (
                  <div className="overflow-hidden rounded-md border border-gray-100 dark:border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {paymentsReceived.map((p) => (
                          <tr key={p.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2">
                              <p className="tabular-nums text-foreground">
                                {formatDate(p.payment_date)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {p.payment_method ?? "No method"}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums text-hh-profit-positive">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Deposits
                </h3>
                {deposits.length === 0 ? (
                  <EmptyLedgerState>No deposits linked.</EmptyLedgerState>
                ) : (
                  <div className="overflow-hidden rounded-md border border-gray-100 dark:border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {deposits.map((d) => (
                          <tr key={d.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2">
                              <p className="tabular-nums text-foreground">
                                {formatDate((d as { date?: string }).date)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {(d as { account?: string | null }).account ?? "No account"}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums text-hh-profit-positive">
                              {formatCurrency(d.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-md border border-gray-100 bg-white p-4 dark:border-border dark:bg-card">
            <h2 className="text-sm font-semibold text-foreground">Invoice summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(displayedSubtotal)}
                </span>
              </div>
              {displayedTax > 0 ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    Tax{" "}
                    {editing
                      ? `(${editTaxPct || 0}%)`
                      : invoice.taxPct != null
                        ? `(${invoice.taxPct}%)`
                        : ""}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {formatCurrency(displayedTax)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-gray-100 pt-3 font-semibold dark:border-border">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(displayedTotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-hh-profit-positive">
                <span>Paid</span>
                <span className="tabular-nums">{formatCurrency(invoice.paidTotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-base font-semibold">
                <span>Balance due</span>
                <span className="tabular-nums">{formatCurrency(displayedBalance)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-gray-100 bg-white p-4 dark:border-border dark:bg-card">
            <h2 className="text-sm font-semibold text-foreground">Record</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                <p className="mt-1 font-medium text-foreground">{invoice.clientName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Project</p>
                <p className="mt-1 text-foreground">{projectName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Issue</p>
                  <p className="mt-1 tabular-nums text-foreground">
                    {formatDate(invoice.issueDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Due</p>
                  <p className="mt-1 tabular-nums text-foreground">{formatDate(invoice.dueDate)}</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {showPaymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-sm border border-gray-100 bg-background p-6 dark:border-border"
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
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || actionBusy}
              >
                <SubmitSpinner loading={actionBusy} className="mr-2" />
                Record
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm"
                onClick={() => setShowPaymentModal(false)}
                disabled={actionBusy}
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

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete invoice?"
        description={`Permanently delete ${invoice.invoiceNo}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={actionBusy}
        dismissBeforeAsync={false}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={voidConfirmOpen}
        onOpenChange={setVoidConfirmOpen}
        title="Void invoice?"
        description="This will mark the invoice as Void. This cannot be undone."
        confirmLabel="Void"
        cancelLabel="Cancel"
        destructive
        loading={actionBusy}
        dismissBeforeAsync={false}
        onConfirm={handleVoid}
      />

      <ConfirmDialog
        open={revertOpen}
        onOpenChange={setRevertOpen}
        title="Revert invoice to draft?"
        description="This will allow editing or deleting the invoice again."
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        loading={actionBusy}
        dismissBeforeAsync={false}
        onConfirm={handleRevertToDraft}
      />

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className="max-w-sm border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Cannot delete invoice</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Only draft, void, or recognized test invoices can be deleted. Issued or paid invoices
              cannot be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost"
              onClick={() => setDeleteBlockedOpen(false)}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
