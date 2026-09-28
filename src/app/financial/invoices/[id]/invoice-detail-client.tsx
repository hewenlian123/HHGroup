"use client";

import {
  financePathWithReturn,
  financeReturnPath,
  financeReturnLabel,
} from "@/lib/finance-navigation";
import {
  centsToMoney,
  computeInvoiceTotals,
  invoiceRevenueExTax,
  lineExtension,
  moneyToCents,
} from "@/lib/money";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { ConfirmDialog, RowActionsMenu, type RowAction } from "@/components/base";
import {
  type InvoiceWithDerived,
  type InvoicePayment,
  type PaymentReceivedAttachment,
  type InvoiceDeleteDependenciesResult,
  type PaymentReceivedRow,
  type DepositRow,
  type Project,
} from "@/lib/data";
import {
  Send,
  FileText,
  Eye,
  Trash2,
  Ban,
  CircleDollarSign,
  Pencil,
  Plus,
  Copy,
  Download,
  Paperclip,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  checkInvoiceDeleteDependenciesAction,
  deleteInvoicePaymentAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  markInvoiceSentAction,
  revertInvoiceToDraftAction,
  unlinkInvoiceScheduleItemAction,
  updateInvoiceAction,
} from "../actions";
import { InvoiceDeleteDependenciesDialog } from "../invoice-delete-dependencies-dialog";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { useInvoiceContractBilling } from "@/app/financial/invoices/_components/use-invoice-contract-billing";
import {
  contractBillingSummary,
  invoiceCountsAsAlreadyInvoiced,
} from "@/lib/financial/remaining-contract";
import {
  InvoiceDetailLayout,
  type InvoiceDetailActivityItem,
  type InvoiceDetailPaymentRow,
} from "./invoice-detail-layout";
import { PaymentReceiptPreviewModal } from "@/components/financial/payment-receipt-preview-modal";
import { voidPaymentReceivedAction } from "@/app/financial/payments/actions";
import { buildInvoicePaymentLedger } from "@/lib/financial/invoice-payment-ledger";
import { isVoidCashStatus } from "@/lib/payment-allocation";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";
import { formatDate } from "@/lib/formatters";
import { safeEstimateReturnPath } from "@/app/estimates/_components/estimate-workflow-continuity";
import type { InvoiceDetailData } from "@/lib/invoice-detail-read";

const EditPaymentReceivedModal = React.lazy(() =>
  import("@/app/financial/payments/edit-payment-received-modal").then((mod) => ({
    default: mod.EditPaymentReceivedModal,
  }))
);

type EditLineDraft = {
  description: string;
  qty: number;
  unitPrice: number;
};

type PaymentReceivedAttachmentWithPreview = PaymentReceivedAttachment & {
  previewUrl?: string | null;
};

type PaymentReceivedForInvoice = Omit<PaymentReceivedRow, "attachments"> & {
  attachments: PaymentReceivedAttachmentWithPreview[];
};

type InvoiceDetailApiResponse = {
  ok: boolean;
  message?: string;
  invoice?: InvoiceWithDerived | null;
  payments?: InvoicePayment[];
  paymentsReceived?: PaymentReceivedForInvoice[];
  deposits?: DepositRow[];
  project?: Project | null;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysUntilDue(dueDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!match) return null;
  const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

function invoiceStatusLabel(status: InvoiceWithDerived["computedStatus"]): string {
  return status === "Partial" ? "Partially paid" : status;
}

function recordPaymentPathForInvoice(invoice: InvoiceWithDerived): string {
  const params = new URLSearchParams();
  params.set("invoiceId", invoice.id);
  if (invoice.customerId) params.set("customerId", invoice.customerId);
  if (invoice.projectId) params.set("projectId", invoice.projectId);
  const amountDue = Math.max(0, Number(invoice.balanceDue) || 0);
  params.set("amountDue", Number.isInteger(amountDue) ? String(amountDue) : amountDue.toFixed(2));
  return `/financial/payments?${params.toString()}`;
}

const invoiceLabelClass = "text-hh-label font-[650] uppercase text-[var(--hh-muted)]";
const invoiceInputClass =
  "mt-1.5 h-11 rounded-hh-standard border-[var(--hh-line-input)] bg-[var(--hh-surface)] px-3 text-[var(--hh-ink)]";

export default function InvoiceDetailClient({
  invoiceId,
  initialData,
}: {
  invoiceId: string;
  initialData: InvoiceDetailData;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = invoiceId;
  const estimateReturnPath = safeEstimateReturnPath(searchParams.get("returnTo"));
  const listReturnTo = searchParams.get("returnTo");
  const invoiceListReturnPath = financeReturnPath(listReturnTo, "/financial/invoices");
  const [invoice, setInvoice] = React.useState<InvoiceWithDerived | null>(initialData.invoice);
  const [notFound, setNotFound] = React.useState(false);
  const [payments, setPayments] = React.useState<InvoicePayment[]>(initialData.payments);
  const [paymentsReceived, setPaymentsReceived] = React.useState<PaymentReceivedForInvoice[]>(
    initialData.paymentsReceived
  );
  const [deposits, setDeposits] = React.useState<DepositRow[]>(initialData.deposits);
  const [project, setProject] = React.useState<Project | null>(initialData.project);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteDependenciesOpen, setDeleteDependenciesOpen] = React.useState(false);
  const [deleteDependencies, setDeleteDependencies] =
    React.useState<InvoiceDeleteDependenciesResult | null>(null);
  const [deleteCheckBusy, setDeleteCheckBusy] = React.useState(false);
  const [unlinkingScheduleItemId, setUnlinkingScheduleItemId] = React.useState<string | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = React.useState<string | null>(null);
  const [paymentDeleteTarget, setPaymentDeleteTarget] = React.useState<InvoicePayment | null>(null);
  const [editPaymentId, setEditPaymentId] = React.useState<string | null>(null);
  const [voidPaymentId, setVoidPaymentId] = React.useState<string | null>(null);
  const [voidingPayment, setVoidingPayment] = React.useState(false);
  const [receiptPaymentId, setReceiptPaymentId] = React.useState<string | null>(null);
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
    const response = await fetch(`/api/invoices/${encodeURIComponent(id)}?t=${Date.now()}`, {
      cache: "no-store",
    });
    const invRes = (await response.json().catch(() => null)) as InvoiceDetailApiResponse | null;
    const inv = response.ok && invRes?.ok ? (invRes.invoice ?? null) : null;
    setInvoice(inv);
    setPayments(Array.isArray(invRes?.payments) ? invRes.payments : []);
    setPaymentsReceived(Array.isArray(invRes?.paymentsReceived) ? invRes.paymentsReceived : []);
    setDeposits(Array.isArray(invRes?.deposits) ? invRes.deposits : []);
    setProject(invRes?.project ?? null);
    if (inv === null || inv === undefined) setNotFound(true);
  }, [id]);

  React.useEffect(() => {
    const shouldOpenReceivePayment =
      searchParams.get("receivePayment") === "1" || searchParams.get("recordPayment") === "1";
    if (
      shouldOpenReceivePayment &&
      invoice &&
      invoice.computedStatus !== "Void" &&
      invoice.computedStatus !== "Paid" &&
      invoice.computedStatus !== "Draft" &&
      invoice.balanceDue > 0
    ) {
      router.replace(
        financePathWithReturn(
          recordPaymentPathForInvoice(invoice),
          financePathWithReturn(`/financial/invoices/${id}`, listReturnTo)
        )
      );
    }
  }, [router, searchParams, invoice, id, listReturnTo]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  useBreadcrumbEntityLabel(invoice?.invoiceNo);

  const [billingClient, setBillingClient] = React.useState<SupabaseClient | null>(null);
  const [billingClientPending, setBillingClientPending] = React.useState(true);
  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      setBillingClientPending(false);
      return;
    }
    let cancelled = false;
    void import("@/lib/supabase")
      .then(({ createBrowserClient }) => {
        if (cancelled) return;
        setBillingClient(createBrowserClient(url, anon));
        setBillingClientPending(false);
      })
      .catch(() => {
        if (!cancelled) setBillingClientPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const contractBilling = useInvoiceContractBilling(
    billingClient,
    invoice?.projectId ?? "",
    invoice?.id ?? null,
    { clientPending: billingClientPending }
  );

  const { toast } = useToast();
  const { openPreview } = useAttachmentPreview();
  const [openingPaymentAttachmentsId, setOpeningPaymentAttachmentsId] = React.useState<
    string | null
  >(null);

  const openPaymentAttachments = React.useCallback(
    async (paymentId: string, attachments: PaymentReceivedAttachmentWithPreview[]) => {
      if (attachments.length === 0) return;
      setOpeningPaymentAttachmentsId(paymentId);
      try {
        const files = attachments.map((att) => {
          const url = att.previewUrl ?? att.file_url;
          if (!url) throw new Error("Attachment preview URL is missing.");
          return {
            url,
            fileName: att.file_name,
            fileType: att.file_type,
            mimeType: att.mime_type ?? undefined,
            attachmentId: att.id,
          };
        });
        openPreview({ files, initialIndex: 0 });
      } catch (err) {
        toast({
          title: "Unable to open attachment",
          description: err instanceof Error ? err.message : undefined,
          variant: "error",
        });
      } finally {
        setOpeningPaymentAttachmentsId(null);
      }
    },
    [openPreview, toast]
  );

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
    router.push(financePathWithReturn(`/financial/invoices/${id}/edit`, listReturnTo));
  }, [id, invoice, router, listReturnTo]);

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

  const editTotals = React.useMemo(
    () => computeInvoiceTotals(editLines, editTaxPct),
    [editLines, editTaxPct]
  );
  const editSubtotal = editTotals.subtotal;
  const editTaxAmount = editTotals.taxAmount;
  const editTotal = editTotals.total;

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
      const result = await markInvoiceSentAction(id);
      if (!result.ok) {
        toast({
          title: "Could not mark as sent",
          description: result.error ?? "Only draft invoices can be marked as sent.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Invoice marked as sent", variant: "success" });
      await refresh();
    } finally {
      setActionBusy(false);
    }
  };

  const handleBackToEdit = async () => {
    if (!id || actionBusy || editSaving) return;
    setActionBusy(true);
    try {
      const result = await revertInvoiceToDraftAction(id);
      if (!result.ok) {
        toast({
          title: "Cannot go back to edit",
          description: result.error ?? "Only invoices without payments can be returned to draft.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Invoice returned to draft", variant: "success" });
      router.push(financePathWithReturn(`/financial/invoices/${id}/edit`, listReturnTo));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDuplicateInvoice = async () => {
    if (!id || actionBusy || editSaving || isVoid) return;
    setActionBusy(true);
    try {
      const result = await duplicateInvoiceAction(id);
      if (!result.ok) {
        toast({
          title: "Could not duplicate invoice",
          description: result.error ?? "Void invoices cannot be duplicated.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Invoice duplicated", variant: "success" });
      router.push(`/financial/invoices/${result.invoiceId}`);
    } catch (e) {
      toast({
        title: "Could not duplicate invoice",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "error",
      });
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

  const runDeleteDependencyCheck = async ({ openWhenClear = false } = {}) => {
    if (!id || actionBusy || deleteCheckBusy) return;
    setDeleteCheckBusy(true);
    try {
      const result = await checkInvoiceDeleteDependenciesAction(id);
      if (!result.ok || !result.dependencies) {
        toast({
          title: "Could not check invoice links",
          description: result.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      setDeleteDependencies(result.dependencies);
      if (result.dependencies.blockers.length > 0) {
        setDeleteConfirmOpen(false);
        setDeleteDependenciesOpen(true);
        return;
      }
      setDeleteDependenciesOpen(false);
      if (openWhenClear) setDeleteConfirmOpen(true);
    } finally {
      setDeleteCheckBusy(false);
    }
  };

  const handleDeleteRequest = () => {
    if (!id || actionBusy) return;
    void runDeleteDependencyCheck({ openWhenClear: true });
  };

  const handleDelete = async () => {
    if (!id || actionBusy) return;
    setActionBusy(true);
    const result = await deleteInvoiceAction(id);
    setActionBusy(false);
    if (result.ok) router.push(invoiceListReturnPath);
    else {
      if (result.dependencies?.blockers.length) {
        setDeleteDependencies(result.dependencies);
        setDeleteConfirmOpen(false);
        setDeleteDependenciesOpen(true);
        return;
      }
      toast({
        title: "Could not delete invoice",
        description: result.error ?? "Only voided invoices can be permanently deleted.",
        variant: "error",
      });
    }
  };

  const handleUnlinkScheduleItem = async (scheduleItemId: string) => {
    if (!id || unlinkingScheduleItemId) return;
    setUnlinkingScheduleItemId(scheduleItemId);
    try {
      const result = await unlinkInvoiceScheduleItemAction(id, scheduleItemId);
      if (!result.ok) {
        toast({
          title: "Could not unlink schedule item",
          description: result.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Schedule item unlinked", variant: "success" });
      await runDeleteDependencyCheck();
      void refresh();
    } finally {
      setUnlinkingScheduleItemId(null);
    }
  };

  const requestDeletePayment = (paymentId: string) => {
    const target = payments.find((p) => p.id === paymentId);
    if (!id || !target) return;
    if (target.paymentReceivedId) {
      toast({
        title: "Linked payment",
        description: "Void this payment from the Payments page to keep AR and deposits in sync.",
        variant: "error",
      });
      return;
    }
    setPaymentDeleteTarget(target);
  };

  const handleVoidLinkedPayment = async () => {
    if (!voidPaymentId) return;
    setVoidingPayment(true);
    try {
      const result = await voidPaymentReceivedAction(voidPaymentId);
      if (!result.ok) {
        toast({
          title: "Could not void payment",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({ title: "Payment voided", variant: "success" });
      setVoidPaymentId(null);
      await refresh();
    } finally {
      setVoidingPayment(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!id || !paymentDeleteTarget) return;
    setDeletingPaymentId(paymentDeleteTarget.id);
    try {
      const result = await deleteInvoicePaymentAction(id, paymentDeleteTarget.id);
      if (!result.ok) {
        throw new Error(result.error ?? "Could not delete payment. Refresh and try again.");
      }
      toast({ title: "Payment deleted", variant: "success" });
      await refresh();
    } finally {
      setDeletingPaymentId(null);
    }
  };

  if (!id) {
    return (
      <div className="bg-[var(--hh-l0-canvas)] page-container page-stack max-w-[800px] p-6 text-[var(--hh-text-secondary)]">
        <p className="text-[var(--hh-text-secondary)]">Invoice not found.</p>
        <Button
          asChild
          variant="outline"
          className="mt-4 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)]"
        >
          <Link href={invoiceListReturnPath}>Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="bg-[var(--hh-l0-canvas)] page-container page-stack max-w-[800px] p-6 text-[var(--hh-text-secondary)]">
        <p className="text-[var(--hh-text-secondary)]">Invoice not found.</p>
        <Button
          asChild
          variant="outline"
          className="mt-4 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)]"
        >
          <Link href={invoiceListReturnPath}>Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="bg-[var(--hh-l0-canvas)] page-container page-stack max-w-[800px] p-6 text-[var(--hh-text-secondary)]">
        Loading...
      </div>
    );
  }

  const isDraft = invoice.status === "Draft";
  const isVoid = invoice.computedStatus === "Void";
  const canPay =
    !isVoid &&
    invoice.computedStatus !== "Paid" &&
    !isDraft &&
    moneyToCents(invoice.balanceDue) > 0;
  const canBackToEdit = !isDraft && !isVoid && invoice.paidTotal <= 0;
  const primaryActionBusy = actionBusy || editSaving;
  const projectName = project?.name ?? invoice.projectId;
  const toolbarButtonClass =
    "h-9 min-h-[44px] rounded-hh-standard border-0 bg-transparent px-3 text-hh-body font-medium text-[var(--hh-muted)] shadow-none hover:!translate-y-0 hover:bg-[var(--hh-surface-sunken)] hover:text-[var(--hh-ink)] hover:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] xl:min-h-9";
  const primaryToolbarButtonClass =
    "h-9 min-h-[44px] rounded-hh-standard px-3.5 text-hh-body font-semibold shadow-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] xl:min-h-9";
  const displayedSubtotal = editing ? editSubtotal : invoice.subtotal;
  const displayedTax = editing ? editTaxAmount : (invoice.taxAmount ?? 0);
  const displayedTotal = editing ? editTotal : invoice.total;
  const displayedBalance = editing
    ? Math.max(0, editTotal - invoice.paidTotal)
    : invoice.balanceDue;
  const recordPaymentHref = financePathWithReturn(
    recordPaymentPathForInvoice(invoice),
    financePathWithReturn(`/financial/invoices/${id}`, listReturnTo)
  );

  const thisInvoiceExTax = isVoid ? 0 : editing ? editSubtotal : invoiceRevenueExTax(invoice);
  const contract =
    contractBilling.status === "ready"
      ? contractBillingSummary({
          originalContract: contractBilling.originalContract,
          approvedChangeOrders: contractBilling.approvedChangeOrders,
          previouslyInvoicedExcludingTax: contractBilling.previouslyInvoicedExcludingTax,
          thisInvoiceExcludingTax: thisInvoiceExTax,
        })
      : null;
  const receivedById = new Map(paymentsReceived.map((row) => [row.id, row]));
  const linkedReceivedIds = new Set(
    payments
      .map((payment) => payment.paymentReceivedId)
      .filter((paymentId): paymentId is string => Boolean(paymentId))
  );
  const unlinkedReceived = paymentsReceived.filter((row) => !linkedReceivedIds.has(row.id));
  const ledgerSource = [
    ...payments.map((payment) => {
      const received = payment.paymentReceivedId
        ? receivedById.get(payment.paymentReceivedId)
        : undefined;
      return {
        id: payment.id,
        date: payment.date,
        amount: payment.amount,
        method: payment.method.trim() || received?.payment_method?.trim() || "—",
        reference:
          payment.memo?.trim() ||
          received?.notes?.trim() ||
          received?.deposit_account?.trim() ||
          "",
        voided: payment.status === "Voided",
        paymentReceivedId: payment.paymentReceivedId ?? null,
        legacyPaymentId: payment.paymentReceivedId ? null : payment.id,
        attachments: received?.attachments ?? [],
      };
    }),
    ...unlinkedReceived.map((row) => ({
      id: `unlinked-${row.id}`,
      date: row.payment_date,
      amount: row.amount,
      method: row.payment_method?.trim() || "—",
      reference: row.notes?.trim() || row.deposit_account?.trim() || "",
      voided: isVoidCashStatus(row.status),
      paymentReceivedId: row.id,
      legacyPaymentId: null as string | null,
      attachments: row.attachments ?? [],
    })),
  ];
  const paymentLedger = buildInvoicePaymentLedger(displayedTotal, ledgerSource);
  const ledgerMeta = new Map(ledgerSource.map((row) => [row.id, row]));
  const postedPayments = paymentLedger.filter((row) => !row.voided);
  const postedCents = postedPayments.reduce((sum, row) => sum + moneyToCents(row.amount), 0);
  const lastPosted = [...postedPayments].sort((left, right) =>
    right.date.localeCompare(left.date)
  )[0];
  const paidCents = moneyToCents(invoice.paidTotal);
  const totalCents = moneyToCents(displayedTotal);
  const paidPercent =
    totalCents > 0 ? Math.min(100, Math.round((paidCents / totalCents) * 100)) : 0;
  const outstandingPercent = totalCents > 0 ? Math.max(0, 100 - paidPercent) : 0;
  const taxPctLabel = editing ? editTaxPct : (invoice.taxPct ?? 0);
  const dueInDays = daysUntilDue(invoice.dueDate);
  const showDueHint = !isVoid && !isDraft && moneyToCents(displayedBalance) > 0;
  const dueHint = !showDueHint
    ? null
    : invoice.daysOverdue > 0
      ? `Overdue ${invoice.daysOverdue} day${invoice.daysOverdue === 1 ? "" : "s"}`
      : dueInDays === 0
        ? "Due today"
        : dueInDays != null && dueInDays > 0
          ? `Due in ${dueInDays} day${dueInDays === 1 ? "" : "s"}`
          : null;
  const previewHref = financePathWithReturn(
    `/financial/invoices/${id}/preview`,
    invoiceListReturnPath
  );
  const printHref = financePathWithReturn(`/financial/invoices/${id}/print`, invoiceListReturnPath);
  const backHref = estimateReturnPath ?? invoiceListReturnPath;
  const backLabel = estimateReturnPath
    ? "Back to estimate"
    : financeReturnLabel(invoiceListReturnPath);
  const paymentRows: InvoiceDetailPaymentRow[] = [
    {
      id: "invoice-issued",
      dateLabel: formatDate(invoice.issueDate),
      method: "",
      reference: "Invoice issued",
      referenceDetail: "",
      amountLabel: "—",
      balanceLabel: formatOverviewMoney(displayedTotal),
      voided: false,
      issued: true,
    },
    ...paymentLedger.map((row) => ({
      id: row.id,
      dateLabel: row.date ? formatDate(row.date) : "—",
      method: row.method,
      reference: row.reference,
      referenceDetail: "",
      amountLabel: row.voided
        ? formatOverviewMoney(row.amount)
        : `−${formatOverviewMoney(row.amount)}`,
      balanceLabel: formatOverviewMoney(row.runningBalance),
      voided: row.voided,
      issued: false,
    })),
  ];
  const activity: InvoiceDetailActivityItem[] = [
    ...(invoice.issueDate
      ? [
          {
            id: "created",
            title: "Created",
            detail: invoice.invoiceNo,
            dateLabel: formatDate(invoice.issueDate, "compact"),
            tone: "created" as const,
            sort: invoice.issueDate,
          },
        ]
      : []),
    ...(invoice.status === "Sent" || invoice.status === "Void"
      ? [
          {
            id: "status",
            title: invoice.status === "Void" ? "Voided" : "Sent",
            detail: "",
            dateLabel: invoice.status === "Sent" ? formatDate(invoice.issueDate, "compact") : "",
            tone: "status" as const,
            sort: invoice.status === "Sent" ? invoice.issueDate : "9999-99-99",
          },
        ]
      : []),
    ...paymentLedger.map((row) => ({
      id: `payment-${row.id}`,
      title: row.voided ? "Payment voided" : "Payment received",
      detail: [row.method !== "—" ? row.method : "", formatOverviewMoney(row.amount), row.reference]
        .filter(Boolean)
        .join(" · "),
      dateLabel: row.date ? formatDate(row.date, "compact") : "",
      tone: "payment" as const,
      sort: row.date || "",
    })),
  ]
    .sort(
      (left, right) => right.sort.localeCompare(left.sort) || left.title.localeCompare(right.title)
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      dateLabel: item.dateLabel,
      tone: item.tone,
    }));

  const renderPaymentMenu = (row: InvoiceDetailPaymentRow) => {
    const meta = ledgerMeta.get(row.id);
    const actions: RowAction[] = [];
    if (meta?.paymentReceivedId && !row.voided) {
      const paymentReceivedId = meta.paymentReceivedId;
      actions.push(
        { label: "Edit payment", onClick: () => setEditPaymentId(paymentReceivedId) },
        { label: "Download receipt", onClick: () => setReceiptPaymentId(paymentReceivedId) },
        {
          label: "Void payment",
          destructive: true,
          onClick: () => setVoidPaymentId(paymentReceivedId),
        }
      );
    } else if (meta?.legacyPaymentId && !row.voided) {
      const legacyPaymentId = meta.legacyPaymentId;
      actions.push({
        label: "Delete payment",
        destructive: true,
        onClick: () => requestDeletePayment(legacyPaymentId),
      });
    }
    const attachments = meta?.attachments ?? [];
    return (
      <div className="w-16 px-2 py-2 text-right xl:w-10">
        <RowActionsMenu
          ariaLabel="Payment actions"
          className="h-11 min-h-11 xl:h-8 xl:min-h-8 rounded-hh-standard"
          actions={actions}
        />
        {attachments.length > 0 && meta?.paymentReceivedId ? (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            data-testid="invoice-payment-attachment-action"
            disabled={openingPaymentAttachmentsId === meta.paymentReceivedId}
            onClick={() => void openPaymentAttachments(meta.paymentReceivedId!, attachments)}
            className="mt-2 h-11 min-h-11 max-w-full rounded-full border border-[var(--hh-line)] bg-[var(--hh-surface)] px-2.5 text-hh-metadata font-medium text-[var(--hh-muted)] lg:h-7 lg:min-h-0"
          >
            <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.7} />
            <span className="truncate">
              {openingPaymentAttachmentsId === meta.paymentReceivedId
                ? "Opening..."
                : `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`}
            </span>
          </Button>
        ) : null}
      </div>
    );
  };

  const revisedCents = contract ? moneyToCents(contract.revisedContract) : 0;
  const priorWidth =
    contract && revisedCents > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (moneyToCents(contract.previouslyInvoicedExcludingTax) / revisedCents) * 100
          )
        )
      : 0;
  const thisWidth =
    contract && revisedCents > 0
      ? Math.max(
          0,
          Math.min(
            100 - priorWidth,
            (moneyToCents(contract.thisInvoiceExcludingTax) / revisedCents) * 100
          )
        )
      : 0;
  const billedCount =
    contractBilling.status === "ready"
      ? contractBilling.history.filter((row) => invoiceCountsAsAlreadyInvoiced(row.status)).length
      : 0;

  return (
    <div data-revenue-ar-v2 data-testid="invoice-detail" className="min-h-full min-w-0">
      {editing ? (
        <div className="mx-auto grid max-w-[1200px] gap-4 px-4 py-4 md:grid-cols-2">
          <div>
            <label htmlFor="invoice-edit-client-name" className={invoiceLabelClass}>
              Client name
            </label>
            <Input
              id="invoice-edit-client-name"
              value={editClientName}
              onChange={(e) => setEditClientName(e.target.value)}
              placeholder="Client"
              className={cn("min-h-[44px] sm:min-h-10", invoiceInputClass)}
              aria-invalid={editAttempted && !editClientName.trim()}
            />
          </div>
          <div>
            <label htmlFor="invoice-edit-issue-date" className={invoiceLabelClass}>
              Issue date
            </label>
            <Input
              id="invoice-edit-issue-date"
              type="date"
              value={editIssueDate}
              onChange={(e) => setEditIssueDate((e.target.value || editIssueDate).slice(0, 10))}
              className={cn("min-h-[44px] sm:min-h-10", invoiceInputClass)}
            />
          </div>
          <div>
            <label htmlFor="invoice-edit-due-date" className={invoiceLabelClass}>
              Due date
            </label>
            <Input
              id="invoice-edit-due-date"
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate((e.target.value || editDueDate).slice(0, 10))}
              className={cn("min-h-[44px] sm:min-h-10", invoiceInputClass)}
            />
          </div>
          <div>
            <label htmlFor="invoice-edit-tax-pct" className={invoiceLabelClass}>
              Tax %
            </label>
            <Input
              id="invoice-edit-tax-pct"
              type="number"
              min="0"
              step="0.01"
              value={editTaxPct}
              onChange={(e) => setEditTaxPct(safeNumber(e.target.value))}
              className={cn("min-h-[44px] sm:min-h-10", invoiceInputClass)}
            />
          </div>
          <div>
            <label htmlFor="invoice-edit-notes" className={invoiceLabelClass}>
              Notes
            </label>
            <Input
              id="invoice-edit-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Terms / notes"
              className={cn("min-h-[44px] sm:min-h-10", invoiceInputClass)}
            />
          </div>
          {editError ? (
            <p className="text-hh-body text-[var(--hh-danger)] md:col-span-2">{editError}</p>
          ) : null}
          <div className="flex gap-2 md:col-span-2">
            <Button
              variant="secondary"
              size="sm"
              className={toolbarButtonClass}
              onClick={cancelEditing}
              disabled={primaryActionBusy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className={primaryToolbarButtonClass}
              onClick={handleSaveEdit}
              disabled={primaryActionBusy}
            >
              <SubmitSpinner loading={editSaving} className="mr-2" />
              Save
            </Button>
          </div>
        </div>
      ) : null}
      <InvoiceDetailLayout
        backHref={backHref}
        backLabel={backLabel}
        backTestId={estimateReturnPath ? "invoice-detail-return-to-estimate" : undefined}
        invoiceNo={invoice.invoiceNo}
        status={
          <InvoiceStatusBadge
            status={invoice.computedStatus}
            label={invoiceStatusLabel(invoice.computedStatus)}
          />
        }
        customer={
          invoice.customerId ? (
            <Link href={`/customers/${invoice.customerId}`} className="text-[var(--hh-link)]">
              {invoice.clientName}
            </Link>
          ) : (
            invoice.clientName
          )
        }
        project={
          invoice.projectId ? (
            <Link href={`/projects/${invoice.projectId}`} className="text-[var(--hh-link)]">
              {projectName}
            </Link>
          ) : (
            projectName
          )
        }
        customerProjectLabel={[invoice.clientName, projectName].filter(Boolean).join(" · ")}
        issuedLabel={formatDate(invoice.issueDate)}
        dueLabel={formatDate(invoice.dueDate)}
        moreMenu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className={cn(
                  toolbarButtonClass,
                  "max-xl:text-[var(--hh-sidebar-text-strong)] max-xl:hover:bg-[var(--hh-sidebar-hover)] max-xl:hover:text-[var(--hh-sidebar-text-strong)]"
                )}
                disabled={primaryActionBusy}
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[220px] rounded-card border-[var(--hh-line)] bg-[var(--hh-surface)] p-1.5 text-[var(--hh-ink)] shadow-card"
            >
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void handleDuplicateInvoice();
                }}
                disabled={primaryActionBusy || isVoid}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate invoice
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={financePathWithReturn(
                    `/financial/invoices/${id}/preview?download=1`,
                    invoiceListReturnPath
                  )}
                  prefetch={false}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void handleMarkSent();
                }}
                disabled={!isDraft || primaryActionBusy}
              >
                <Send className="mr-2 h-4 w-4" />
                Mark as sent
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void handleBackToEdit();
                }}
                disabled={!canBackToEdit || primaryActionBusy}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Back to edit
              </DropdownMenuItem>
              {!isVoid ? (
                <DropdownMenuItem
                  className="text-[var(--hh-danger)] focus:bg-[var(--hh-danger-soft-fill)] focus:text-[var(--hh-danger)]"
                  onSelect={(e) => {
                    e.preventDefault();
                    setVoidConfirmOpen(true);
                  }}
                  disabled={primaryActionBusy}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Void Invoice
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-[var(--hh-danger)] focus:bg-[var(--hh-danger-soft-fill)] focus:text-[var(--hh-danger)]"
                onSelect={(e) => {
                  e.preventDefault();
                  if (isVoid) handleDeleteRequest();
                  else setDeleteBlockedOpen(true);
                }}
                disabled={primaryActionBusy || deleteCheckBusy}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        desktopActions={
          <>
            <Button asChild variant="secondary" size="sm" className={toolbarButtonClass}>
              <Link href={previewHref} prefetch={false} data-testid="invoice-detail-preview-link">
                <Eye className="h-4 w-4" />
                Preview PDF
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className={toolbarButtonClass}>
              <Link href={printHref} prefetch={false}>
                <FileText className="h-4 w-4" />
                Print
              </Link>
            </Button>
            {canPay ? (
              <Button asChild size="sm" className={primaryToolbarButtonClass}>
                <Link href={recordPaymentHref}>
                  <CircleDollarSign className="h-4 w-4" />
                  Record payment
                </Link>
              </Button>
            ) : isDraft ? (
              <Button
                size="sm"
                className={primaryToolbarButtonClass}
                onClick={startEditing}
                disabled={primaryActionBusy}
              >
                <Pencil className="h-4 w-4" />
                Edit Draft
              </Button>
            ) : null}
          </>
        }
        mobilePrimary={
          canPay ? (
            <Button asChild size="sm" className="h-12 min-h-12 w-full">
              <Link href={recordPaymentHref}>
                <Plus className="h-4 w-4" />
                Record payment
              </Link>
            </Button>
          ) : isDraft ? (
            <Button
              size="sm"
              className="h-12 min-h-12 w-full"
              onClick={startEditing}
              disabled={primaryActionBusy}
            >
              <Pencil className="h-4 w-4" />
              Edit Draft
            </Button>
          ) : (
            <span className="sr-only">No payment due</span>
          )
        }
        previewHref={previewHref}
        totalLabel={formatOverviewMoney(displayedTotal)}
        totalDetail={
          displayedTax > 0
            ? `Subtotal ${formatOverviewMoney(displayedSubtotal)} + Tax ${formatOverviewMoney(displayedTax)}`
            : null
        }
        paidLabel={formatOverviewMoney(invoice.paidTotal)}
        paidDetail={
          postedPayments.length === 0
            ? "No payments yet"
            : `${postedPayments.length} payment${postedPayments.length === 1 ? "" : "s"}${
                lastPosted?.date ? ` · last ${formatDate(lastPosted.date, "compact")}` : ""
              }`
        }
        balanceLabel={formatOverviewMoney(displayedBalance)}
        outstandingLabel={totalCents > 0 ? `${outstandingPercent}% of invoice outstanding` : null}
        dueValue={formatDate(invoice.dueDate)}
        dueHint={dueHint}
        dueHintWarn={Boolean(dueHint)}
        paidPercent={paidPercent}
        paidProgressLabel={`Paid ${paidPercent}% · ${formatOverviewMoney(invoice.paidTotal)} of ${formatOverviewMoney(displayedTotal)}`}
        lineCountLabel={`${invoice.lineItems.length} line${invoice.lineItems.length === 1 ? "" : "s"} · read-only`}
        editInvoice={
          isDraft ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="min-h-[44px] text-[var(--hh-link)] xl:min-h-9"
              onClick={startEditing}
            >
              <Pencil className="h-4 w-4" />
              Edit invoice
            </Button>
          ) : canBackToEdit ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="min-h-[44px] text-[var(--hh-link)] xl:min-h-9"
              onClick={() => void handleBackToEdit()}
              disabled={primaryActionBusy}
            >
              <Pencil className="h-4 w-4" />
              Edit invoice
            </Button>
          ) : null
        }
        lines={(editing ? editLines : invoice.lineItems).map((line, index) => {
          const qty = safeNumber(line.qty);
          const unitPrice = safeNumber(line.unitPrice);
          return {
            key: `${index}-${line.description}`,
            description: line.description,
            qtyLabel: String(qty),
            rateLabel: formatOverviewMoney(unitPrice),
            amountLabel: formatOverviewMoney(lineExtension(qty, unitPrice)),
          };
        })}
        lineFooter={
          <div className="text-hh-body">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span>Subtotal</span>
              <span
                data-testid="invoice-detail-subtotal"
                className="tabular-nums font-semibold text-[var(--hh-ink)]"
              >
                {formatOverviewMoney(displayedSubtotal)}
              </span>
            </div>
            {displayedTax > 0 ? (
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <span>Tax {taxPctLabel}%</span>
                <span
                  data-testid="invoice-detail-tax"
                  className="tabular-nums font-semibold text-[var(--hh-ink)]"
                >
                  {formatOverviewMoney(displayedTax)}
                </span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-ink)] py-2">
              <span className="font-semibold text-[var(--hh-ink)]">Invoice total</span>
              <span className="text-num-m tabular-nums text-[var(--hh-ink)]">
                {formatOverviewMoney(displayedTotal)}
              </span>
            </div>
          </div>
        }
        paymentSummary={
          postedPayments.length === 0
            ? "No payments recorded"
            : `${postedPayments.length} payment${postedPayments.length === 1 ? "" : "s"} · ${formatOverviewMoney(centsToMoney(postedCents))} received`
        }
        recordPayment={
          canPay ? (
            <Button
              asChild
              variant="quiet"
              size="sm"
              className="min-h-[44px] text-[var(--hh-link)] xl:min-h-9"
            >
              <Link href={recordPaymentHref}>
                <Plus className="h-4 w-4" />
                Record payment
              </Link>
            </Button>
          ) : null
        }
        paymentRows={paymentRows}
        paymentFooterAmount={
          postedCents > 0
            ? `−${formatOverviewMoney(centsToMoney(postedCents))}`
            : formatOverviewMoney(0)
        }
        paymentFooterBalance={formatOverviewMoney(displayedBalance)}
        renderPaymentMenu={renderPaymentMenu}
        deposits={deposits.map((deposit) => ({
          id: deposit.id,
          dateLabel: formatDate(deposit.date),
          account: deposit.account?.trim() || "No account",
          amountLabel: formatOverviewMoney(deposit.amount),
        }))}
        notes={invoice.notes ?? ""}
        editNotes={
          isDraft ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="min-h-[44px] text-[var(--hh-link)] xl:min-h-9"
              onClick={startEditing}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          ) : null
        }
        contract={
          contract
            ? {
                status: "ready",
                percentLabel:
                  contract.billedToDatePercent != null ? `${contract.billedToDatePercent}%` : null,
                priorWidth,
                thisWidth,
                originalLabel: formatOverviewMoney(
                  contractBilling.status === "ready" ? contractBilling.originalContract : 0
                ),
                approvedLabel: formatOverviewMoney(
                  contractBilling.status === "ready" ? contractBilling.approvedChangeOrders : 0,
                  { sign: "always" }
                ),
                approvedCount:
                  contractBilling.status === "ready" ? contractBilling.approvedChangeOrderCount : 0,
                revisedLabel: formatOverviewMoney(contract.revisedContract),
                billedLabel: formatOverviewMoney(contract.billedToDateExcludingTax),
                billedCount,
                thisInvoiceLabel: formatOverviewMoney(contract.thisInvoiceExcludingTax),
                remainingLabel: formatOverviewMoney(contract.remainingContract),
                remainingNegative: contract.remainingContract < 0,
              }
            : {
                status:
                  contractBilling.status === "loading" || contractBilling.status === "idle"
                    ? contractBilling.status
                    : "unavailable",
              }
        }
        billTo={{
          customerName: invoice.clientName || "Customer",
          customerHref: invoice.customerId ? `/customers/${invoice.customerId}` : null,
          projectName,
          projectHref: invoice.projectId ? `/projects/${invoice.projectId}` : null,
          projectDetail: project?.projectManager ? `PM ${project.projectManager}` : null,
          address: project?.address?.trim() || null,
          viewHref: invoice.customerId
            ? `/customers/${invoice.customerId}`
            : invoice.projectId
              ? `/projects/${invoice.projectId}`
              : null,
        }}
        activityTitle={`Billing history for ${invoice.invoiceNo}`}
        nextActivity={
          showDueHint
            ? invoice.daysOverdue > 0
              ? `Overdue: ${formatOverviewMoney(displayedBalance)} · ${invoice.daysOverdue} day${invoice.daysOverdue === 1 ? "" : "s"}`
              : `Next: ${formatOverviewMoney(displayedBalance)} due ${formatDate(invoice.dueDate)}`
            : null
        }
        activity={activity}
      />

      <ConfirmDialog
        open={!!paymentDeleteTarget}
        onOpenChange={(open) => {
          if (!open) setPaymentDeleteTarget(null);
        }}
        title="Delete legacy payment?"
        description="Delete this legacy invoice payment? This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={!!deletingPaymentId}
        onConfirm={handleDeletePayment}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete voided invoice?"
        description="This invoice is voided and has no active payment links. This will permanently delete the invoice record and its line items. This cannot be undone."
        confirmLabel="Delete permanently"
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

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent
          data-revenue-ar-v2
          className="max-w-sm rounded-hh-task border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-5 text-[var(--hh-text-primary)]"
        >
          <DialogHeader>
            <DialogTitle className="hh-type-text-entry font-semibold">
              Cannot delete invoice
            </DialogTitle>
            <DialogDescription className="text-hh-body text-[var(--hh-text-secondary)]">
              Only voided invoices can be permanently deleted. Void this invoice first, then run the
              dependency check again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-[var(--hh-border)] pt-3">
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)]"
              onClick={() => setDeleteBlockedOpen(false)}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceDeleteDependenciesDialog
        open={deleteDependenciesOpen}
        onOpenChange={setDeleteDependenciesOpen}
        dependencies={deleteDependencies}
        checking={deleteCheckBusy}
        onRefresh={() => void runDeleteDependencyCheck()}
        onUnlinkScheduleItem={handleUnlinkScheduleItem}
        unlinkingId={unlinkingScheduleItemId}
      />

      {editPaymentId ? (
        <React.Suspense fallback={null}>
          <EditPaymentReceivedModal
            open
            paymentId={editPaymentId}
            onOpenChange={(open) => {
              if (!open) setEditPaymentId(null);
            }}
            onSuccess={() => {
              setEditPaymentId(null);
              void refresh();
            }}
          />
        </React.Suspense>
      ) : null}
      <PaymentReceiptPreviewModal
        open={Boolean(receiptPaymentId)}
        paymentId={receiptPaymentId}
        onOpenChange={(open) => {
          if (!open) setReceiptPaymentId(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(voidPaymentId)}
        onOpenChange={(open) => {
          if (!open) setVoidPaymentId(null);
        }}
        title="Void payment?"
        description="Void this payment? The invoice balance will be restored and the cash record will stay in the audit trail."
        confirmLabel="Void payment"
        destructive
        loading={voidingPayment}
        dismissBeforeAsync={false}
        onConfirm={handleVoidLinkedPayment}
      />
    </div>
  );
}
