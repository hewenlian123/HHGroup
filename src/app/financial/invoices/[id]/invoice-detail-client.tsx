"use client";

import {
  financePathWithReturn,
  financeReturnPath,
  financeReturnLabel,
} from "@/lib/finance-navigation";
import {
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
import { ConfirmDialog } from "@/components/base";
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
  ArrowLeft,
  Send,
  FileText,
  Eye,
  Trash2,
  ChevronDown,
  Ban,
  CircleDollarSign,
  Pencil,
  Plus,
  Copy,
  Download,
  Paperclip,
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
import {
  InvoiceBillingHistory,
  InvoiceEditorShell,
} from "@/app/financial/invoices/_components/invoice-editor-shell";
import { useInvoiceContractBilling } from "@/app/financial/invoices/_components/use-invoice-contract-billing";
import { contractBillingSummary } from "@/lib/financial/remaining-contract";
import { buildInvoicePaymentLedger } from "@/lib/financial/invoice-payment-ledger";
import { isVoidCashStatus } from "@/lib/payment-allocation";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { createBrowserClient } from "@/lib/supabase";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";
import { formatDate } from "@/lib/formatters";
import { safeEstimateReturnPath } from "@/app/estimates/_components/estimate-workflow-continuity";
import type { InvoiceDetailData } from "@/lib/invoice-detail-read";

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

function recordPaymentPathForInvoice(invoice: InvoiceWithDerived): string {
  const params = new URLSearchParams();
  params.set("invoiceId", invoice.id);
  if (invoice.customerId) params.set("customerId", invoice.customerId);
  if (invoice.projectId) params.set("projectId", invoice.projectId);
  const amountDue = Math.max(0, Number(invoice.balanceDue) || 0);
  params.set("amountDue", Number.isInteger(amountDue) ? String(amountDue) : amountDue.toFixed(2));
  return `/financial/payments?${params.toString()}`;
}

const detailCardClass =
  "overflow-hidden rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] text-[var(--hh-text)] shadow-card";
const invoiceSectionTitleClass = "text-title-card text-[var(--hh-ink)]";
const invoiceSectionDescriptionClass = "mt-0.5 text-hh-metadata text-[var(--hh-muted)]";
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

  const billingClient = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);
  const contractBilling = useInvoiceContractBilling(
    billingClient,
    invoice?.projectId ?? "",
    invoice?.id ?? null
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
  const paymentLedger = buildInvoicePaymentLedger(
    displayedTotal,
    payments.map((payment) => {
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
      };
    })
  );

  return (
    <div data-revenue-ar-v2 data-testid="invoice-detail" className="min-h-full min-w-0">
      <InvoiceEditorShell
        header={
          <div className="flex min-w-0 flex-col gap-4">
            <Link
              href={estimateReturnPath ?? invoiceListReturnPath}
              data-testid={estimateReturnPath ? "invoice-detail-return-to-estimate" : undefined}
              className="inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-hh-standard text-hh-body font-medium text-[var(--hh-link)]"
            >
              <ArrowLeft className="h-4 w-4" />
              {estimateReturnPath ? "Back to estimate" : financeReturnLabel(invoiceListReturnPath)}
            </Link>
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                    Invoice
                  </p>
                  <span data-testid="invoice-detail-status">
                    <InvoiceStatusBadge status={invoice.computedStatus} />
                  </span>
                </div>
                <h1 className="mt-1 break-words text-title-page text-[var(--hh-ink)]">
                  {invoice.invoiceNo}
                </h1>
                <p className="mt-1 break-words text-hh-metadata text-[var(--hh-muted)]">
                  <span className="font-medium text-[var(--hh-ink)]">
                    {invoice.customerId ? (
                      <Link
                        href={`/customers/${invoice.customerId}`}
                        className="text-[var(--hh-link)]"
                      >
                        {invoice.clientName}
                      </Link>
                    ) : (
                      invoice.clientName
                    )}
                  </span>
                  <span> · </span>
                  {invoice.projectId ? (
                    <Link href={`/projects/${invoice.projectId}`} className="text-[var(--hh-link)]">
                      {projectName}
                    </Link>
                  ) : (
                    projectName
                  )}
                  <span> · Issued {formatDate(invoice.issueDate)}</span>
                  <span> · Due {formatDate(invoice.dueDate)}</span>
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
                {editing ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <Button asChild variant="secondary" size="sm" className={toolbarButtonClass}>
                      <Link
                        href={financePathWithReturn(
                          `/financial/invoices/${id}/preview`,
                          invoiceListReturnPath
                        )}
                        prefetch={false}
                        data-testid="invoice-detail-preview-link"
                      >
                        <Eye className="h-4 w-4" />
                        Preview
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm" className={toolbarButtonClass}>
                      <Link
                        href={financePathWithReturn(
                          `/financial/invoices/${id}/print`,
                          invoiceListReturnPath
                        )}
                        prefetch={false}
                      >
                        <FileText className="h-4 w-4" />
                        Print
                      </Link>
                    </Button>
                    {isDraft ? (
                      <Button
                        size="sm"
                        className={cn(primaryToolbarButtonClass, "w-full sm:w-auto")}
                        onClick={startEditing}
                        disabled={primaryActionBusy}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Draft
                      </Button>
                    ) : null}
                    {canPay ? (
                      <Button
                        asChild
                        size="sm"
                        className={cn(primaryToolbarButtonClass, "w-full sm:w-auto")}
                        disabled={primaryActionBusy}
                      >
                        <Link href={recordPaymentHref}>
                          <CircleDollarSign className="h-4 w-4" />
                          Receive Payment
                        </Link>
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          className={toolbarButtonClass}
                          disabled={primaryActionBusy}
                        >
                          More
                          <ChevronDown className="h-4 w-4" />
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
                  </>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <div className="min-w-0 rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] px-3 py-3 shadow-card">
                <dt className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">Total</dt>
                <dd className="mt-1 truncate text-num-m tabular-nums text-[var(--hh-ink)]">
                  {formatOverviewMoney(displayedTotal)}
                </dd>
              </div>
              <div className="min-w-0 rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] px-3 py-3 shadow-card">
                <dt className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">Paid</dt>
                <dd className="mt-1 truncate text-num-m tabular-nums text-[var(--hh-success)]">
                  {formatOverviewMoney(invoice.paidTotal)}
                </dd>
              </div>
              <div className="min-w-0 rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] px-3 py-3 shadow-card">
                <dt className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                  Balance due
                </dt>
                <dd className="mt-1 truncate text-num-l tabular-nums text-[var(--hh-ink)]">
                  {formatOverviewMoney(displayedBalance)}
                </dd>
              </div>
            </dl>
          </div>
        }
        banner={
          invoice.daysOverdue > 0 && !isVoid && !isDraft ? (
            <p
              role="status"
              className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-4 py-3 text-hh-body text-[var(--hh-warning)]"
            >
              <span className="font-semibold">{invoice.invoiceNo}</span> is {invoice.daysOverdue}{" "}
              days overdue · {formatOverviewMoney(displayedBalance)} balance due
            </p>
          ) : null
        }
        parties={
          <section className={cn(detailCardClass, "p-4 sm:p-5")} aria-label="Bill to">
            <h2 className={invoiceSectionTitleClass}>Bill to</h2>
            <p className={invoiceSectionDescriptionClass}>
              Customer, project, and dates on this invoice.
            </p>
            {editing ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                  {editAttempted && !editClientName.trim() ? (
                    <p className="mt-1 text-hh-metadata text-[var(--hh-danger)]">
                      Client name is required.
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className={invoiceLabelClass}>Project</p>
                  <p className="mt-1.5 rounded-hh-standard border border-[var(--hh-line)] bg-[var(--hh-surface-sunken)] px-3 py-2 text-hh-body text-[var(--hh-ink)]">
                    {projectName}
                  </p>
                </div>
                <div>
                  <label htmlFor="invoice-edit-issue-date" className={invoiceLabelClass}>
                    Issue date
                  </label>
                  <Input
                    id="invoice-edit-issue-date"
                    type="date"
                    value={editIssueDate}
                    onChange={(e) =>
                      setEditIssueDate((e.target.value || editIssueDate).slice(0, 10))
                    }
                    onInput={(e) =>
                      setEditIssueDate((e.currentTarget.value || editIssueDate).slice(0, 10))
                    }
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
                    onInput={(e) =>
                      setEditDueDate((e.currentTarget.value || editDueDate).slice(0, 10))
                    }
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
              </div>
            ) : (
              <dl className="mt-4 grid gap-3 text-hh-body sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-hh-metadata text-[var(--hh-muted)]">Customer</dt>
                  <dd className="mt-0.5 break-words font-medium text-[var(--hh-ink)]">
                    {invoice.clientName}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-hh-metadata text-[var(--hh-muted)]">Project</dt>
                  <dd className="mt-0.5 break-words font-medium text-[var(--hh-ink)]">
                    {projectName}
                  </dd>
                </div>
                <div>
                  <dt className="text-hh-metadata text-[var(--hh-muted)]">Issue date</dt>
                  <dd className="mt-0.5 tabular-nums text-[var(--hh-ink)]">
                    {formatDate(invoice.issueDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-hh-metadata text-[var(--hh-muted)]">Due date</dt>
                  <dd className="mt-0.5 tabular-nums text-[var(--hh-ink)]">
                    {formatDate(invoice.dueDate)}
                  </dd>
                </div>
              </dl>
            )}
          </section>
        }
        lines={
          <>
            <section aria-label="Invoice overview line items" className={detailCardClass}>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <h2 className={invoiceSectionTitleClass}>Line items</h2>
                  <p className={invoiceSectionDescriptionClass}>
                    Billable work and materials on this invoice.
                  </p>
                </div>
                {editing ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-[44px] sm:min-h-9"
                    onClick={() =>
                      setEditLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }])
                    }
                    disabled={primaryActionBusy}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add line
                  </Button>
                ) : (
                  <span className="shrink-0 text-hh-metadata tabular-nums text-[var(--hh-muted)]">
                    {invoice.lineItems.length} item{invoice.lineItems.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {editing &&
              editAttempted &&
              !editLines.some((line) => line.description.trim().length > 0) ? (
                <p className="px-4 text-hh-metadata text-[var(--hh-danger)] sm:px-5">
                  At least one line item is required.
                </p>
              ) : null}
              <div className="border-t border-[var(--hh-line-2)]">
                <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem] gap-3 bg-[var(--hh-surface-sunken)] px-4 py-2 text-hh-label font-[650] uppercase text-[var(--hh-th)] sm:grid sm:px-5">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit price</span>
                  <span className="text-right">Amount</span>
                </div>
                <ul className="divide-y divide-[var(--hh-line-2)]">
                  {(editing ? editLines : invoice.lineItems).map((line, idx) => {
                    const qty = safeNumber(line.qty);
                    const unitPrice = safeNumber(line.unitPrice);
                    const amount = lineExtension(qty, unitPrice);
                    return (
                      <li
                        key={`${idx}-${line.description}`}
                        data-testid={`invoice-detail-line-${idx + 1}`}
                        className="px-4 py-3 sm:px-5"
                      >
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem] sm:items-center sm:gap-3">
                          <div className="min-w-0 whitespace-pre-wrap text-hh-body text-[var(--hh-ink)]">
                            {editing ? (
                              <Input
                                data-testid={`invoice-detail-edit-line-${idx + 1}-description-input`}
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
                                className={invoiceInputClass}
                              />
                            ) : (
                              <span data-testid={`invoice-detail-line-${idx + 1}-description`}>
                                {line.description}
                              </span>
                            )}
                          </div>
                          <div
                            data-testid={`invoice-detail-line-${idx + 1}-qty`}
                            className="text-hh-body tabular-nums text-[var(--hh-text)] sm:text-right"
                          >
                            <span className="mr-2 text-hh-metadata text-[var(--hh-muted)] sm:hidden">
                              Qty
                            </span>
                            {editing ? (
                              <Input
                                data-testid={`invoice-detail-edit-line-${idx + 1}-qty-input`}
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
                                className={cn("text-right tabular-nums", invoiceInputClass)}
                                aria-label={`Line item ${idx + 1} quantity`}
                              />
                            ) : (
                              qty
                            )}
                          </div>
                          <div
                            data-testid={`invoice-detail-line-${idx + 1}-rate`}
                            className="text-hh-body tabular-nums text-[var(--hh-text)] sm:text-right"
                          >
                            <span className="mr-2 text-hh-metadata text-[var(--hh-muted)] sm:hidden">
                              Unit price
                            </span>
                            {editing ? (
                              <Input
                                data-testid={`invoice-detail-edit-line-${idx + 1}-rate-input`}
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
                                className={cn("text-right tabular-nums", invoiceInputClass)}
                                aria-label={`Line item ${idx + 1} unit price`}
                              />
                            ) : (
                              formatOverviewMoney(unitPrice)
                            )}
                          </div>
                          <div
                            data-testid={`invoice-detail-line-${idx + 1}-amount`}
                            className="text-hh-body font-semibold tabular-nums text-[var(--hh-ink)] sm:text-right"
                          >
                            <span className="mr-2 text-hh-metadata font-normal text-[var(--hh-muted)] sm:hidden">
                              Amount
                            </span>
                            {formatOverviewMoney(amount)}
                          </div>
                        </div>
                        {editing ? (
                          <div className="mt-2 text-right">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-11 min-h-11 rounded-hh-standard text-[var(--hh-danger)] xl:h-8 xl:min-h-8"
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
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <section aria-labelledby="invoice-payments-heading" className={detailCardClass}>
              <div className="px-4 py-3.5 sm:px-5">
                <h2 id="invoice-payments-heading" className={invoiceSectionTitleClass}>
                  Payments
                </h2>
                <p className={invoiceSectionDescriptionClass}>
                  Posted customer payments and the balance after each one.
                </p>
              </div>
              {paymentLedger.length === 0 ? (
                <p className="border-t border-[var(--hh-line-2)] px-4 py-5 text-hh-body text-[var(--hh-muted)] sm:px-5">
                  No payments recorded.
                </p>
              ) : (
                <div className="border-t border-[var(--hh-line-2)]">
                  <div className="hidden grid-cols-[minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto_auto_2.5rem] gap-3 bg-[var(--hh-surface-sunken)] px-4 py-2 text-hh-label font-[650] uppercase text-[var(--hh-th)] sm:grid sm:px-5">
                    <span>Date</span>
                    <span>Method</span>
                    <span>Reference</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Balance</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <ul className="divide-y divide-[var(--hh-line-2)]">
                    {paymentLedger.map((row) => {
                      const received = payments.find((payment) => payment.id === row.id);
                      const linked = received?.paymentReceivedId
                        ? receivedById.get(received.paymentReceivedId)
                        : undefined;
                      return (
                        <li key={row.id} className="px-4 py-3 sm:px-5">
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto_auto_2.5rem] sm:items-center sm:gap-3">
                            <p className="tabular-nums text-hh-body text-[var(--hh-ink)]">
                              {row.date ? formatDate(row.date) : "No date"}
                            </p>
                            <p className="min-w-0 break-words text-hh-body text-[var(--hh-text)]">
                              {row.method}
                              {row.voided ? (
                                <span className="ml-2 text-hh-metadata font-medium text-[var(--hh-danger)]">
                                  Voided
                                </span>
                              ) : null}
                            </p>
                            <p className="min-w-0 break-words text-hh-metadata text-[var(--hh-muted)]">
                              {row.reference || "—"}
                            </p>
                            <p className="text-hh-body font-semibold tabular-nums text-[var(--hh-ink)] sm:text-right">
                              {formatOverviewMoney(row.amount)}
                            </p>
                            <p className="text-hh-body tabular-nums text-[var(--hh-ink)] sm:text-right">
                              <span className="mr-2 text-hh-metadata text-[var(--hh-muted)] sm:hidden">
                                Balance
                              </span>
                              {formatOverviewMoney(row.runningBalance)}
                            </p>
                            <div className="w-16 px-2 py-2 text-right xl:w-10">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-11 min-h-11 xl:h-8 xl:min-h-8 rounded-hh-standard text-[var(--hh-danger)]"
                                onClick={() => requestDeletePayment(row.id)}
                                disabled={deletingPaymentId === row.id}
                                title="Delete payment"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {linked && (linked.attachments ?? []).length > 0 ? (
                            <Button
                              type="button"
                              variant="quiet"
                              size="sm"
                              data-testid="invoice-payment-attachment-action"
                              disabled={openingPaymentAttachmentsId === linked.id}
                              onClick={() =>
                                void openPaymentAttachments(linked.id, linked.attachments)
                              }
                              className="mt-2 h-11 min-h-11 max-w-full rounded-full border border-[var(--hh-line)] bg-[var(--hh-surface)] px-2.5 text-hh-metadata font-medium text-[var(--hh-muted)] lg:h-7 lg:min-h-0"
                            >
                              <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                              <span className="truncate">
                                {openingPaymentAttachmentsId === linked.id
                                  ? "Opening..."
                                  : `${linked.attachments.length} attachment${
                                      linked.attachments.length === 1 ? "" : "s"
                                    }`}
                              </span>
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {unlinkedReceived.length > 0 ? (
                <div className="border-t border-[var(--hh-line-2)] px-4 py-3 sm:px-5">
                  <h3 className={invoiceLabelClass}>
                    Received payments not on the invoice balance
                  </h3>
                  <ul className="mt-2 divide-y divide-[var(--hh-line-2)]">
                    {unlinkedReceived.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block tabular-nums text-hh-body text-[var(--hh-ink)]">
                            {formatDate(row.payment_date)}
                          </span>
                          <span className="block break-words text-hh-metadata text-[var(--hh-muted)]">
                            {row.payment_method?.trim() || "—"}
                            {row.notes?.trim() ? ` · ${row.notes.trim()}` : ""}
                            {isVoidCashStatus(row.status) ? " · Voided" : ""}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-hh-body font-semibold text-[var(--hh-ink)]">
                          {formatOverviewMoney(row.amount)}
                        </span>
                        {(row.attachments ?? []).length > 0 ? (
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            data-testid="invoice-payment-attachment-action"
                            disabled={openingPaymentAttachmentsId === row.id}
                            onClick={() => void openPaymentAttachments(row.id, row.attachments)}
                            className="h-11 min-h-11 max-w-full rounded-full border border-[var(--hh-line)] bg-[var(--hh-surface)] px-2.5 text-hh-metadata font-medium text-[var(--hh-muted)] lg:h-7 lg:min-h-0"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                            <span className="truncate">
                              {openingPaymentAttachmentsId === row.id
                                ? "Opening..."
                                : `${row.attachments.length} attachment${
                                    row.attachments.length === 1 ? "" : "s"
                                  }`}
                            </span>
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="border-t border-[var(--hh-line-2)] px-4 py-3 sm:px-5">
                <h3 className={invoiceLabelClass}>Deposits</h3>
                {deposits.length === 0 ? (
                  <p className="mt-2 text-hh-metadata text-[var(--hh-muted)]">
                    No deposits linked.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-[var(--hh-line-2)]">
                    {deposits.map((deposit) => (
                      <li key={deposit.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block tabular-nums text-hh-body text-[var(--hh-ink)]">
                            {formatDate((deposit as { date?: string }).date)}
                          </span>
                          <span className="block truncate text-hh-metadata text-[var(--hh-muted)]">
                            {(deposit as { account?: string | null }).account ?? "No account"}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-hh-body font-semibold text-[var(--hh-ink)]">
                          {formatOverviewMoney(deposit.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        }
        notes={
          <section className={cn(detailCardClass, "p-4 sm:p-5")} aria-label="Notes to customer">
            <h2 className={invoiceSectionTitleClass}>Notes to customer</h2>
            <p className="mt-2 whitespace-pre-wrap text-hh-body text-[var(--hh-text)]">
              {invoice.notes?.trim() ? invoice.notes : "No notes on this invoice."}
            </p>
          </section>
        }
        summary={
          <section className={cn(detailCardClass, "p-4 sm:p-5")} aria-label="Invoice summary">
            <h2 className={invoiceSectionTitleClass}>Summary</h2>
            <p className={invoiceSectionDescriptionClass}>
              Tax is calculated on the subtotal. Amounts are in dollars.
            </p>
            <div className="mt-4 space-y-2.5 text-hh-body">
              <div className="flex items-baseline justify-between gap-3">
                <span>Subtotal</span>
                <span
                  data-testid="invoice-detail-subtotal"
                  className="tabular-nums text-[var(--hh-ink-2)]"
                >
                  {formatOverviewMoney(displayedSubtotal)}
                </span>
              </div>
              {displayedTax > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    Tax{" "}
                    {editing
                      ? `(${editTaxPct || 0}%)`
                      : invoice.taxPct != null
                        ? `(${invoice.taxPct}%)`
                        : ""}
                  </span>
                  <span
                    data-testid="invoice-detail-tax"
                    className="tabular-nums text-[var(--hh-ink-2)]"
                  >
                    {formatOverviewMoney(displayedTax)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-end justify-between gap-3 border-t border-[var(--hh-line)] pt-3">
                <span className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                  Total due
                </span>
                <span
                  data-testid="invoice-detail-total"
                  className="text-num-xl tabular-nums text-[var(--hh-ink)]"
                >
                  {formatOverviewMoney(displayedTotal)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span>Paid</span>
                <span className="tabular-nums font-medium text-[var(--hh-success)]">
                  {formatOverviewMoney(invoice.paidTotal)}
                </span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <span className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                  Balance due
                </span>
                <span
                  data-testid="invoice-detail-balance"
                  className="text-num-l tabular-nums text-[var(--hh-ink)]"
                >
                  {formatOverviewMoney(displayedBalance)}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-hh-standard bg-[var(--hh-surface-sunken)] p-3">
              <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                Contract billing
              </p>
              {contractBilling.status === "loading" ? (
                <p className="mt-2 text-hh-metadata text-[var(--hh-muted)]">
                  Loading contract billing…
                </p>
              ) : null}
              {contractBilling.status === "idle" ? (
                <p className="mt-2 text-hh-metadata text-[var(--hh-muted)]">
                  This invoice is not linked to a project.
                </p>
              ) : null}
              {contractBilling.status === "unavailable" ? (
                <p className="mt-2 text-hh-metadata font-medium text-[var(--hh-danger)]">
                  Contract billing is unavailable.
                </p>
              ) : null}
              {contract ? (
                <div className="mt-3 space-y-2 text-hh-body">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>Previously billed</span>
                    <span className="tabular-nums text-[var(--hh-ink-2)]">
                      {formatOverviewMoney(contract.previouslyInvoicedExcludingTax)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span>This invoice</span>
                    <span className="tabular-nums text-[var(--hh-ink-2)]">
                      {formatOverviewMoney(contract.thisInvoiceExcludingTax)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-[var(--hh-ink)]">
                      Billed to date
                      {contract.billedToDatePercent != null
                        ? ` · ${contract.billedToDatePercent}%`
                        : ""}
                    </span>
                    <span className="tabular-nums font-medium text-[var(--hh-ink)]">
                      {formatOverviewMoney(contract.billedToDateExcludingTax)}
                    </span>
                  </div>
                  {contract.billedToDatePercent != null ? (
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-[var(--hh-track)]"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.max(0, contract.billedToDatePercent))}
                      aria-label={`Billed to date ${contract.billedToDatePercent} percent of the revised contract, excluding tax`}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--hh-navy)]"
                        style={{
                          width: `${Math.min(100, Math.max(0, contract.billedToDatePercent))}%`,
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line)] pt-2">
                    <span className="font-medium text-[var(--hh-ink)]">Remaining contract</span>
                    <span
                      data-testid="invoice-remaining-contract"
                      className={cn(
                        "text-num-m tabular-nums",
                        contract.remainingContract < 0
                          ? "text-[var(--hh-danger)]"
                          : "text-[var(--hh-ink)]"
                      )}
                    >
                      {formatOverviewMoney(contract.remainingContract)}
                    </span>
                  </div>
                  <p className="text-hh-metadata leading-5 text-[var(--hh-muted)]">
                    Revised contract {formatOverviewMoney(contract.revisedContract)} · incl.{" "}
                    {formatOverviewMoney(
                      contractBilling.status === "ready" ? contractBilling.approvedChangeOrders : 0,
                      { sign: "always" }
                    )}{" "}
                    approved change orders. Excludes tax.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        }
        history={<InvoiceBillingHistory billing={contractBilling} currentInvoiceId={invoice.id} />}
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
    </div>
  );
}
