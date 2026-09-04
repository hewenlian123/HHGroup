"use client";

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
import { ConfirmDialog, KpiTile } from "@/components/base";
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
  CalendarDays,
  Building2,
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
import { InvoiceDetailPresentation } from "./invoice-detail-presentation";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  appendEstimateReturnPath,
  safeEstimateReturnPath,
} from "@/app/estimates/_components/estimate-workflow-continuity";
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

function DetailMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "positive" | "danger";
}) {
  const kpiTone = tone === "positive" ? "positive" : tone === "danger" ? "negative" : "neutral";
  return (
    <KpiTile
      label={label}
      value={value}
      tone={kpiTone}
      className="min-h-[92px] rounded-hh-task px-3.5 py-3.5"
      valueClassName={cn(
        "truncate text-hh-financial-total",
        tone === "muted" && "text-[var(--hh-text-secondary)]"
      )}
    />
  );
}

function EmptyLedgerState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-hh-task border border-dashed border-[var(--hh-border-strong)] bg-[var(--hh-l2-operational-surface)] px-4 py-5 text-hh-body text-[var(--hh-text-secondary)] shadow-none">
      {children}
    </div>
  );
}

const invoicePanelClass =
  "rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational";
const invoicePanelHeaderClass = "border-b border-[var(--hh-border)] px-4 py-3";
const invoiceSectionTitleClass = "text-hh-body font-semibold text-[var(--hh-text-primary)]";
const invoiceSectionDescriptionClass = "mt-0.5 text-hh-metadata text-[var(--hh-text-secondary)]";
const invoiceLabelClass =
  "text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]";
const invoiceInputClass =
  "rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";
const invoiceTableShellClass =
  "overflow-hidden rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]";
const invoiceTableRowClass =
  "border-b border-[var(--hh-border)] transition-colors last:border-0 hover:bg-[var(--hh-l3-hover)]";

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
      router.replace(recordPaymentPathForInvoice(invoice));
    }
  }, [router, searchParams, invoice]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  useBreadcrumbEntityLabel(invoice?.invoiceNo);

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
      router.push(`/financial/invoices/${id}/edit`);
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
    if (result.ok) router.push("/financial/invoices");
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

  const handleDeletePayment = async (paymentId: string) => {
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
    if (!window.confirm("Delete this legacy invoice payment?")) return;
    setDeletingPaymentId(paymentId);
    try {
      const result = await deleteInvoicePaymentAction(id, paymentId);
      if (!result.ok) {
        toast({
          title: "Could not delete payment",
          description: result.error ?? "Refresh and try again.",
          variant: "error",
        });
        return;
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
          <Link href="/financial/invoices">Back to Invoices</Link>
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
          <Link href="/financial/invoices">Back to Invoices</Link>
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
  const canPay = !isVoid && invoice.computedStatus !== "Paid" && !isDraft && invoice.balanceDue > 0;
  const canBackToEdit = !isDraft && !isVoid && invoice.paidTotal <= 0;
  const primaryActionBusy = actionBusy || editSaving;
  const projectName = project?.name ?? invoice.projectId;
  const toolbarButtonClass =
    "h-9 min-h-[44px] rounded-hh-standard border-0 bg-transparent px-3 text-hh-table-cell font-medium text-[var(--hh-text-secondary)] shadow-none hover:!translate-y-0 hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] hover:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] xl:min-h-9";
  const primaryToolbarButtonClass =
    "h-9 min-h-[44px] rounded-hh-standard border border-[var(--hh-border-strong)] bg-[var(--hh-action-primary)] px-3.5 text-hh-table-cell font-semibold text-[var(--hh-action-primary-foreground)] shadow-none hover:bg-[var(--hh-action-primary)] hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] xl:min-h-9";
  const displayedSubtotal = editing ? editSubtotal : invoice.subtotal;
  const displayedTax = editing ? editTaxAmount : (invoice.taxAmount ?? 0);
  const displayedTotal = editing ? editTotal : invoice.total;
  const displayedBalance = editing
    ? Math.max(0, editTotal - invoice.paidTotal)
    : invoice.balanceDue;
  const recordPaymentHref = recordPaymentPathForInvoice(invoice);

  return (
    <div
      data-revenue-ar-v2
      data-testid="invoice-detail"
      className="hh-fin bg-[var(--hh-l0-canvas)] page-container page-shell-wide page-stack flex w-full flex-col gap-4 py-4 text-[var(--hh-text-secondary)] sm:gap-5 lg:py-6"
    >
      <div className="flex flex-col gap-4 border-b border-[var(--hh-border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href={estimateReturnPath ?? "/financial/invoices"}
            data-testid={estimateReturnPath ? "invoice-detail-return-to-estimate" : undefined}
            className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-hh-standard text-hh-body font-medium text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            {estimateReturnPath ? "Back to estimate" : "Invoices"}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-hh-page-title font-semibold leading-tight tracking-normal text-[var(--hh-text-primary)] md:text-hh-page-title">
              {invoice.invoiceNo}
            </h1>
            <span data-testid="invoice-detail-status">
              <InvoiceStatusBadge status={invoice.computedStatus} />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-hh-body text-[var(--hh-text-secondary)]">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">
                <span className="font-medium text-[var(--hh-text-primary)]">
                  {invoice.clientName}
                </span>
                <span className="mx-1 text-[var(--hh-text-tertiary)]">/</span>
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
          <div className="flex max-w-full flex-wrap items-center gap-2 lg:justify-end">
            {editing ? (
              <div className="inline-flex items-center gap-1 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1 shadow-operational">
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
                  className={primaryToolbarButtonClass}
                  onClick={handleSaveEdit}
                  disabled={primaryActionBusy}
                >
                  <SubmitSpinner loading={editSaving} className="mr-2" />
                  Save
                </Button>
              </div>
            ) : (
              <>
                <div className="inline-flex min-h-[44px] items-center gap-1 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1 shadow-operational xl:min-h-0">
                  <Button asChild variant="ghost" size="sm" className={toolbarButtonClass}>
                    <Link
                      href={appendEstimateReturnPath(
                        `/financial/invoices/${id}/preview`,
                        estimateReturnPath
                      )}
                      prefetch={false}
                      data-testid="invoice-detail-preview-link"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className={toolbarButtonClass}>
                    <Link href={`/financial/invoices/${id}/print`} prefetch={false}>
                      <FileText className="h-4 w-4" />
                      Print
                    </Link>
                  </Button>
                </div>

                {isDraft ? (
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
                {canPay ? (
                  <Button
                    asChild
                    size="sm"
                    className={primaryToolbarButtonClass}
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
                      variant="ghost"
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
                    className="min-w-[220px] rounded-hh-task border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1.5 text-[var(--hh-text-primary)] shadow-operational"
                  >
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleDuplicateInvoice();
                      }}
                      disabled={primaryActionBusy || isVoid}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href={appendEstimateReturnPath(
                          `/financial/invoices/${id}/preview?download=1`,
                          estimateReturnPath
                        )}
                        prefetch={false}
                      >
                        <Download className="h-4 w-4 mr-2" />
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
                      <Send className="h-4 w-4 mr-2" />
                      Mark as sent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleBackToEdit();
                      }}
                      disabled={!canBackToEdit || primaryActionBusy}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
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
                        <Ban className="h-4 w-4 mr-2" />
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
        <section className={cn(invoicePanelClass, "p-4")}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="invoice-edit-client-name" className={invoiceLabelClass}>
                Client name
              </label>
              <Input
                id="invoice-edit-client-name"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                placeholder="Client"
                className={cn("mt-1 min-h-[44px] sm:min-h-10", invoiceInputClass)}
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
              <p className="mt-1 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-hh-body text-[var(--hh-text-primary)]">
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
                onChange={(e) => setEditIssueDate((e.target.value || editIssueDate).slice(0, 10))}
                onInput={(e) =>
                  setEditIssueDate((e.currentTarget.value || editIssueDate).slice(0, 10))
                }
                className={cn("mt-1 min-h-[44px] sm:min-h-10", invoiceInputClass)}
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
                onInput={(e) => setEditDueDate((e.currentTarget.value || editDueDate).slice(0, 10))}
                className={cn("mt-1 min-h-[44px] sm:min-h-10", invoiceInputClass)}
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
                className={cn("mt-1 min-h-[44px] sm:min-h-10", invoiceInputClass)}
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
                className={cn("mt-1 min-h-[44px] sm:min-h-10", invoiceInputClass)}
              />
            </div>
            {editError ? (
              <p className="text-hh-body text-[var(--hh-danger)] md:col-span-2">{editError}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="invoice-overview-heading">
        <h2
          id="invoice-overview-heading"
          className="mb-3 text-hh-section-title font-semibold text-[var(--hh-text-primary)]"
        >
          Overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </section>

      <InvoiceDetailPresentation>
        <main className="min-w-0 space-y-5" aria-label="Invoice overview and activity">
          <section
            aria-label="Invoice overview line items"
            className={cn(invoicePanelClass, "overflow-hidden")}
          >
            <div className={cn(invoicePanelHeaderClass, "flex items-center justify-between gap-3")}>
              <div>
                <h2 className={invoiceSectionTitleClass}>Line items</h2>
                <p className={invoiceSectionDescriptionClass}>
                  Billable work and materials on this invoice.
                </p>
              </div>
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)] sm:min-h-9"
                  onClick={() =>
                    setEditLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }])
                  }
                  disabled={primaryActionBusy}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add line
                </Button>
              ) : (
                <span className="text-hh-metadata tabular-nums text-[var(--hh-text-tertiary)]">
                  {invoice.lineItems.length} item{invoice.lineItems.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {editing &&
            editAttempted &&
            !editLines.some((line) => line.description.trim().length > 0) ? (
              <p className="px-4 pt-3 text-hh-metadata text-[var(--hh-danger)]">
                At least one line item is required.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-hh-body text-[var(--hh-text-primary)]">
                <thead>
                  <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                    <th className="px-4 py-3 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                      Unit price
                    </th>
                    <th className="px-4 py-3 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
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
                        data-testid={`invoice-detail-line-${idx + 1}`}
                        className="border-b border-[var(--hh-border)] transition-colors last:border-0 hover:bg-[var(--hh-l3-hover)]"
                      >
                        <td className="whitespace-pre-wrap px-4 py-3 text-[var(--hh-text-primary)]">
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
                        </td>
                        <td
                          data-testid={`invoice-detail-line-${idx + 1}-qty`}
                          className="px-4 py-3 text-right tabular-nums text-[var(--hh-text-secondary)]"
                        >
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
                        </td>
                        <td
                          data-testid={`invoice-detail-line-${idx + 1}-rate`}
                          className="px-4 py-3 text-right tabular-nums text-[var(--hh-text-secondary)]"
                        >
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
                            formatCurrency(unitPrice)
                          )}
                        </td>
                        <td
                          data-testid={`invoice-detail-line-${idx + 1}-amount`}
                          className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--hh-text-primary)]"
                        >
                          {formatCurrency(amount)}
                        </td>
                        {editing ? (
                          <td className="py-3 px-2 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-danger)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]"
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

          <section
            aria-labelledby="invoice-activity-heading"
            className={cn(invoicePanelClass, "p-4")}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="invoice-activity-heading" className={invoiceSectionTitleClass}>
                  Activity
                </h2>
                <p className={invoiceSectionDescriptionClass}>
                  Payments, deposits, and receipt records tied to this invoice.
                </p>
              </div>
            </div>

            <h3 className={cn(invoiceLabelClass, "mb-2")}>Payments</h3>
            <div className="grid gap-3 lg:grid-cols-3">
              <div>
                <h3 className={cn(invoiceLabelClass, "mb-2")}>Payments history</h3>
                {payments.length === 0 ? (
                  <EmptyLedgerState>No payments recorded.</EmptyLedgerState>
                ) : (
                  <div className={invoiceTableShellClass}>
                    <table className="w-full text-hh-body text-[var(--hh-text-primary)]">
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className={invoiceTableRowClass}>
                            <td className="px-3 py-2">
                              <p className="tabular-nums text-[var(--hh-text-primary)]">
                                {formatDate(p.date)}
                              </p>
                              <p className="text-hh-metadata text-[var(--hh-text-secondary)]">
                                {p.method}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--hh-success)]">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="w-16 px-2 py-2 text-right xl:w-10">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-11 min-h-11 xl:h-8 xl:min-h-8 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-danger)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]"
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
                <h3 className={cn(invoiceLabelClass, "mb-2")}>Payments</h3>
                {paymentsReceived.length === 0 ? (
                  <EmptyLedgerState>No payments received yet.</EmptyLedgerState>
                ) : (
                  <div className={invoiceTableShellClass}>
                    <table className="w-full text-hh-body text-[var(--hh-text-primary)]">
                      <tbody>
                        {paymentsReceived.map((p) => (
                          <tr key={p.id} className={invoiceTableRowClass}>
                            <td className="px-3 py-2">
                              <p className="tabular-nums text-[var(--hh-text-primary)]">
                                {formatDate(p.payment_date)}
                              </p>
                              <p className="truncate text-hh-metadata text-[var(--hh-text-secondary)]">
                                {p.payment_method ?? "No method"}
                              </p>
                              {(p.attachments ?? []).length > 0 ? (
                                <Button
                                  type="button"
                                  variant="quiet"
                                  size="sm"
                                  data-testid="invoice-payment-attachment-action"
                                  disabled={openingPaymentAttachmentsId === p.id}
                                  onClick={() => void openPaymentAttachments(p.id, p.attachments)}
                                  className="mt-1 h-11 min-h-11 max-w-full rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-medium text-[var(--hh-text-secondary)] lg:h-7 lg:min-h-0"
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                                  <span className="truncate">
                                    {openingPaymentAttachmentsId === p.id
                                      ? "Opening..."
                                      : `${p.attachments.length} attachment${
                                          p.attachments.length === 1 ? "" : "s"
                                        }`}
                                  </span>
                                </Button>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--hh-success)]">
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
                <h3 className={cn(invoiceLabelClass, "mb-2")}>Deposits</h3>
                {deposits.length === 0 ? (
                  <EmptyLedgerState>No deposits linked.</EmptyLedgerState>
                ) : (
                  <div className={invoiceTableShellClass}>
                    <table className="w-full text-hh-body text-[var(--hh-text-primary)]">
                      <tbody>
                        {deposits.map((d) => (
                          <tr key={d.id} className={invoiceTableRowClass}>
                            <td className="px-3 py-2">
                              <p className="tabular-nums text-[var(--hh-text-primary)]">
                                {formatDate((d as { date?: string }).date)}
                              </p>
                              <p className="truncate text-hh-metadata text-[var(--hh-text-secondary)]">
                                {(d as { account?: string | null }).account ?? "No account"}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--hh-success)]">
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

        <aside aria-label="Invoice context" className="space-y-4">
          <section className={cn(invoicePanelClass, "p-4")}>
            <h2 className={invoiceSectionTitleClass}>Invoice summary</h2>
            <div className="mt-4 space-y-2 text-hh-body">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--hh-text-secondary)]">Subtotal</span>
                <span
                  data-testid="invoice-detail-subtotal"
                  className="tabular-nums text-[var(--hh-text-primary)]"
                >
                  {formatCurrency(displayedSubtotal)}
                </span>
              </div>
              {displayedTax > 0 ? (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--hh-text-secondary)]">
                    Tax{" "}
                    {editing
                      ? `(${editTaxPct || 0}%)`
                      : invoice.taxPct != null
                        ? `(${invoice.taxPct}%)`
                        : ""}
                  </span>
                  <span
                    data-testid="invoice-detail-tax"
                    className="tabular-nums text-[var(--hh-text-primary)]"
                  >
                    {formatCurrency(displayedTax)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-[var(--hh-border)] pt-3 font-semibold text-[var(--hh-text-primary)]">
                <span>Total</span>
                <span data-testid="invoice-detail-total" className="tabular-nums">
                  {formatCurrency(displayedTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-4 text-[var(--hh-success)]">
                <span>Paid</span>
                <span className="tabular-nums">{formatCurrency(invoice.paidTotal)}</span>
              </div>
              <div className="flex justify-between gap-4 rounded-hh-task border border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)] px-3 py-2 hh-type-text-entry font-semibold text-[var(--hh-text-primary)]">
                <span>Balance due</span>
                <span data-testid="invoice-detail-balance" className="tabular-nums">
                  {formatCurrency(displayedBalance)}
                </span>
              </div>
            </div>
          </section>

          <section className={cn(invoicePanelClass, "p-4")}>
            <h2 className={invoiceSectionTitleClass}>Invoice context</h2>
            <div className="mt-4 space-y-3 text-hh-body">
              <div>
                <p className={invoiceLabelClass}>Client</p>
                <p className="mt-1 font-medium text-[var(--hh-text-primary)]">
                  {invoice.clientName}
                </p>
              </div>
              <div>
                <p className={invoiceLabelClass}>Project</p>
                <p className="mt-1 text-[var(--hh-text-primary)]">{projectName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={invoiceLabelClass}>Issue</p>
                  <p className="mt-1 tabular-nums text-[var(--hh-text-primary)]">
                    {formatDate(invoice.issueDate)}
                  </p>
                </div>
                <div>
                  <p className={invoiceLabelClass}>Due</p>
                  <p className="mt-1 tabular-nums text-[var(--hh-text-primary)]">
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </InvoiceDetailPresentation>

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
