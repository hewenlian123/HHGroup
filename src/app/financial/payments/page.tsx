"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  getPaymentAttachmentPreviewUrl,
  getPaymentsReceived,
  type PaymentReceivedAttachment,
  type PaymentReceivedDeleteDependenciesResult,
  type PaymentReceivedWithMeta,
} from "@/lib/data";
import {
  Banknote,
  CalendarDays,
  Download,
  Link2,
  Mail,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ReceivePaymentModal } from "./receive-payment-modal";
import { EditPaymentReceivedModal } from "./edit-payment-received-modal";
import { useToast } from "@/components/toast/toast-provider";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import {
  checkPaymentReceivedDeleteDependenciesAction,
  deletePaymentReceivedAction,
  voidPaymentReceivedAction,
} from "./actions";
import { PaymentDeleteDependenciesDialog } from "./payment-delete-dependencies-dialog";
import { PaymentReceiptPreviewModal } from "@/components/financial/payment-receipt-preview-modal";
import { SendPaymentReceiptModal } from "@/components/financial/send-payment-receipt-modal";
import {
  MobileFabButton,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { ConfirmDialog } from "@/components/base";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";

const paymentsShell =
  "rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational md:rounded-hh-task";

const kpiTile =
  "rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational";

const kpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l3-selected)] text-[var(--hh-text-secondary)]";

function isVoidedPaymentStatus(status: string | null | undefined): boolean {
  return ["void", "voided", "cancelled", "canceled"].includes(
    String(status ?? "")
      .trim()
      .toLowerCase()
  );
}

export default function PaymentsReceivedPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <PaymentsReceivedPageInner />
    </React.Suspense>
  );
}

function PaymentsReceivedPageInner() {
  const { toast } = useToast();
  const { openPreview } = useAttachmentPreview();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = React.useState<PaymentReceivedWithMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [prefillInvoiceId, setPrefillInvoiceId] = React.useState<string | null>(null);
  const [editPaymentId, setEditPaymentId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState("");
  const [accountFilter, setAccountFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [voidTarget, setVoidTarget] = React.useState<PaymentReceivedWithMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PaymentReceivedWithMeta | null>(null);
  const [deleteDependencies, setDeleteDependencies] =
    React.useState<PaymentReceivedDeleteDependenciesResult | null>(null);
  const [checkingDelete, setCheckingDelete] = React.useState(false);
  const [highlightPaymentId, setHighlightPaymentId] = React.useState<string | null>(null);
  const [openingPaymentAttachmentsId, setOpeningPaymentAttachmentsId] = React.useState<
    string | null
  >(null);
  const [receiptPreviewPaymentId, setReceiptPreviewPaymentId] = React.useState<string | null>(null);
  const [receiptPreviewAction, setReceiptPreviewAction] = React.useState<
    "download" | "print" | null
  >(null);
  const [sendReceiptData, setSendReceiptData] = React.useState<PaymentReceiptPreviewDto | null>(
    null
  );
  const [sendReceiptOpen, setSendReceiptOpen] = React.useState(false);
  const [receiptActionBusyId, setReceiptActionBusyId] = React.useState<string | null>(null);
  const [paymentReturnContext, setPaymentReturnContext] = React.useState<{
    paymentId: string;
    invoiceId: string;
    projectId: string | null;
  } | null>(null);
  const handledQueryRef = React.useRef("");

  const clearPaymentQuery = React.useCallback(() => {
    router.replace("/financial/payments", { scroll: false });
  }, [router]);

  const openReceivePayment = React.useCallback(() => {
    setPrefillInvoiceId(null);
    setPaymentReturnContext(null);
    setModalOpen(true);
  }, []);

  const handleReceivePaymentOpenChange = React.useCallback(
    (open: boolean) => {
      setModalOpen(open);
      if (!open) {
        if (prefillInvoiceId) clearPaymentQuery();
        setPrefillInvoiceId(null);
      }
    },
    [clearPaymentQuery, prefillInvoiceId]
  );

  const load = React.useCallback(async () => {
    const list = await getPaymentsReceived({ includeVoided: true });
    setPayments(list);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openPaymentAttachments = React.useCallback(
    async (paymentId: string, attachments: PaymentReceivedAttachment[]) => {
      if (attachments.length === 0) return;
      setOpeningPaymentAttachmentsId(paymentId);
      try {
        const files = await Promise.all(
          attachments.map(async (att) => ({
            url: await getPaymentAttachmentPreviewUrl(att),
            fileName: att.file_name,
            fileType: att.file_type,
            mimeType: att.mime_type ?? undefined,
            attachmentId: att.id,
          }))
        );
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

  const fetchReceiptPreview = React.useCallback(
    async (paymentId: string): Promise<PaymentReceiptPreviewDto> => {
      const res = await fetch(
        `/api/financial/payments/${encodeURIComponent(paymentId)}/receipt-preview`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as
        | PaymentReceiptPreviewDto
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(
          json && "error" in json && json.error ? String(json.error) : "Failed to load receipt."
        );
      }
      return json as PaymentReceiptPreviewDto;
    },
    []
  );

  const openReceiptPreview = React.useCallback(
    (paymentId: string, action: "download" | "print" | null = null) => {
      setReceiptPreviewAction(action);
      setReceiptPreviewPaymentId(paymentId);
    },
    []
  );

  const openSendReceipt = React.useCallback(
    async (paymentId: string) => {
      setReceiptActionBusyId(paymentId);
      try {
        const data = await fetchReceiptPreview(paymentId);
        setSendReceiptData(data);
        setSendReceiptOpen(true);
      } catch (err) {
        toast({
          title: "Unable to load receipt",
          description: err instanceof Error ? err.message : undefined,
          variant: "error",
        });
      } finally {
        setReceiptActionBusyId(null);
      }
    },
    [fetchReceiptPreview, toast]
  );

  React.useEffect(() => {
    const query = searchParams.toString();
    if (!query) {
      handledQueryRef.current = "";
      return;
    }
    if (handledQueryRef.current === query) return;
    handledQueryRef.current = query;

    const editPayment = searchParams.get("editPayment");
    const paymentId = searchParams.get("paymentId");
    const invoiceId = searchParams.get("invoiceId");
    const receipt = searchParams.get("receipt");
    const receiptAction = searchParams.get("receiptAction");
    const sendReceipt = searchParams.get("sendReceipt");

    if (paymentId) {
      setHighlightPaymentId(paymentId);
      setSearchQuery(paymentId);
      return;
    }
    if (invoiceId) {
      setPrefillInvoiceId(invoiceId);
      setModalOpen(true);
      return;
    }
    if (editPayment) {
      setEditPaymentId(editPayment);
      return;
    }
    if (receipt) {
      setReceiptPreviewAction(
        receiptAction === "download" || receiptAction === "print" ? receiptAction : null
      );
      setReceiptPreviewPaymentId(receipt);
      return;
    }
    if (sendReceipt) {
      void openSendReceipt(sendReceipt);
    }
  }, [openSendReceipt, searchParams]);

  const methodOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      const m = (p.payment_method ?? "").trim();
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const accountOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      const a = (p.deposit_account ?? "").trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const filteredPayments = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const from = dateFrom ? dateFrom.slice(0, 10) : "";
    const to = dateTo ? dateTo.slice(0, 10) : "";
    return payments.filter((row) => {
      if (methodFilter && (row.payment_method ?? "").trim() !== methodFilter) return false;
      if (accountFilter && (row.deposit_account ?? "").trim() !== accountFilter) return false;
      const d = (row.payment_date ?? "").slice(0, 10);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (!q) return true;
      const hay = [
        row.payment_date,
        row.customer_name,
        row.project_name,
        row.invoice_no,
        row.payment_method,
        row.deposit_account,
        row.notes,
        row.status,
        row.id,
        String(row.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [payments, searchQuery, methodFilter, accountFilter, dateFrom, dateTo]);

  const summary = React.useMemo(() => {
    const activePayments = payments.filter((p) => !isVoidedPaymentStatus(p.status));
    const totalReceived = activePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paymentsCount = activePayments.length;
    const ym = new Date().toISOString().slice(0, 7);
    const thisMonthTotal = activePayments
      .filter((p) => String(p.payment_date ?? "").startsWith(ym))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const linkedInvoices = activePayments.filter((p) => Boolean(p.invoice_no)).length;
    const unknownOrUnapplied = activePayments.filter(
      (p) => !p.invoice_no || !(p.customer_name ?? "").trim()
    ).length;
    return { totalReceived, paymentsCount, thisMonthTotal, linkedInvoices, unknownOrUnapplied };
  }, [payments]);

  const voidPayment = React.useCallback(
    async (row: PaymentReceivedWithMeta) => {
      const id = row.id;
      let snapshot: PaymentReceivedWithMeta[] | undefined;
      setPayments((prev) => {
        snapshot = prev;
        return prev.map((p) => (p.id === id ? { ...p, status: "void" } : p));
      });
      const res = await voidPaymentReceivedAction(id);
      if (!res.ok) {
        if (snapshot) setPayments(snapshot);
        throw new Error(res.error ?? "Could not void payment.");
      }
      toast({ title: "Payment voided", variant: "success" });
      void load();
    },
    [load, toast]
  );

  const checkDeletePayment = React.useCallback(
    async (row: PaymentReceivedWithMeta) => {
      setDeleteTarget(row);
      setCheckingDelete(true);
      try {
        const res = await checkPaymentReceivedDeleteDependenciesAction(row.id);
        if (!res.ok) {
          setDeleteTarget(null);
          toast({
            title: "Could not check payment",
            description: res.error ?? "Could not check payment dependencies.",
            variant: "error",
          });
          return;
        }
        setDeleteDependencies(res.dependencies);
      } catch (err) {
        setDeleteTarget(null);
        toast({
          title: "Could not check payment",
          description: err instanceof Error ? err.message : "Could not check payment dependencies.",
          variant: "error",
        });
      } finally {
        setCheckingDelete(false);
      }
    },
    [toast]
  );

  const deleteVoidedPayment = React.useCallback(async () => {
    const row = deleteTarget;
    if (!row) return;
    const res = await deletePaymentReceivedAction(row.id);
    if (!res.ok) {
      if (res.dependencies) setDeleteDependencies(res.dependencies);
      toast({
        title: "Delete failed",
        description: res.error ?? "Could not delete payment.",
        variant: "error",
      });
      return;
    }
    setDeleteTarget(null);
    setDeleteDependencies(null);
    setPayments((prev) => prev.filter((p) => p.id !== row.id));
    toast({ title: "Voided payment deleted.", variant: "success" });
    void load();
  }, [deleteTarget, load, toast]);

  return (
    <div
      data-revenue-ar-v2
      className={cn("min-w-0 overflow-x-hidden text-[var(--hh-text-secondary)]", "flex flex-col")}
    >
      <div
        className={cn(
          "page-shell-wide mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:gap-4 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-[var(--hh-border)] pb-2 lg:items-baseline lg:gap-x-4 [&_h1]:text-[var(--hh-text-primary)] [&_p]:mt-0 [&_p]:text-[var(--hh-text-secondary)]"
            title="Payments Received"
            subtitle="Cash collection and payment history across customers and invoices."
            actions={
              <Button
                size="sm"
                className="h-9 shrink-0 gap-1.5 shadow-none"
                onClick={openReceivePayment}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Receive Payment
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Payments Received"
          fab={<MobileFabButton ariaLabel="Receive payment" onClick={openReceivePayment} />}
        />

        {/* Post-payment return context */}
        {paymentReturnContext ? (
          <section className="rounded-hh-standard border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] px-3 py-3 text-sm text-[var(--hh-success)] shadow-operational">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Payment recorded</p>
                <p className="text-xs text-[var(--hh-success)]">
                  Return to the invoice to review the updated paid amount and open AR.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm" className="min-h-11 justify-center md:min-h-9">
                  <Link href={`/financial/invoices/${paymentReturnContext.invoiceId}`}>
                    View Invoice
                  </Link>
                </Button>
                {paymentReturnContext.projectId ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11 justify-center border-[var(--hh-success-border)] bg-transparent text-[var(--hh-success)] hover:bg-[var(--hh-success-soft-fill)] md:min-h-9"
                  >
                    <Link href={`/projects/${paymentReturnContext.projectId}`}>
                      Back to Project
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* KPI summary */}
        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-hh-table-header font-medium uppercase tracking-normal text-text-secondary/75">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
                  Total received
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatCurrency(summary.totalReceived)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Banknote className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
                  Payments
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.paymentsCount)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <CalendarDays className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
                  This month
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatCurrency(summary.thisMonthTotal)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Link2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
                  Linked invoices
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.linkedInvoices)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Search className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
                  Unapplied/unknown
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.unknownOrUnapplied)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter/search surface */}
        <div className={cn(paymentsShell, "p-3")}>
          <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label className="text-hh-table-header font-medium uppercase tracking-normal text-text-secondary/75">
                Search
              </label>
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Customer, project, invoice…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 min-h-[44px] pl-8 text-sm"
                  aria-label="Search payments"
                />
              </div>
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-hh-table-header font-medium uppercase tracking-normal text-text-secondary/75">
                Method
              </label>
              <Select
                aria-label="Filter payments by method"
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="h-11 min-h-[44px] min-w-0 lg:h-10 lg:min-h-10 sm:w-[200px]"
              >
                <option value="">All methods</option>
                {methodOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-hh-table-header font-medium uppercase tracking-normal text-text-secondary/75">
                Account
              </label>
              <Select
                aria-label="Filter payments by account"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="h-11 min-h-[44px] min-w-0 lg:h-10 lg:min-h-10 sm:w-[200px]"
              >
                <option value="">All accounts</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--hh-border)] pt-3">
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-hh-table-header font-medium uppercase tracking-normal text-text-secondary/75">
                Date from
              </label>
              <Input
                aria-label="Payments date from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 min-h-[44px] tabular-nums lg:h-10 lg:min-h-10 sm:w-[170px]"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-hh-table-header font-medium uppercase tracking-normal text-text-secondary/75">
                Date to
              </label>
              <Input
                aria-label="Payments date to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-11 min-h-[44px] tabular-nums lg:h-10 lg:min-h-10 sm:w-[170px]"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 min-h-[44px] lg:h-9 lg:min-h-0 rounded-hh-compact shadow-none"
                onClick={() => void load()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={cn(paymentsShell, "px-4 py-10 text-center")}>
            <p className="text-sm text-muted-foreground">Loading payments…</p>
          </div>
        ) : payments.length === 0 ? (
          <div className={cn(paymentsShell, "px-4 py-10 text-center")}>
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l3-selected)] text-[var(--hh-text-secondary)]">
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No payments yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Record a payment to start tracking cash collection and invoice history.
            </p>
            <Button
              size="sm"
              className="mt-4 h-11 min-h-[44px] lg:h-9 lg:min-h-0 rounded-hh-compact shadow-none"
              onClick={openReceivePayment}
            >
              <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
              Receive Payment
            </Button>
          </div>
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            title="No payments match your filters"
            description="Try adjusting your search, filters, or date range."
            icon={null}
            action={
              <Button
                size="sm"
                variant="outline"
                className="h-11 min-h-[44px] lg:h-9 lg:min-h-0 rounded-hh-compact shadow-none"
                onClick={() => {
                  setSearchQuery("");
                  setMethodFilter("");
                  setAccountFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <section className={cn(paymentsShell, "overflow-hidden p-0")}>
            {/* Desktop header row */}
            <div className="hidden lg:grid grid-cols-[minmax(170px,1.1fr)_minmax(150px,1fr)_minmax(72px,0.45fr)_minmax(110px,0.55fr)_minmax(90px,0.45fr)_minmax(110px,0.55fr)_minmax(102px,0.5fr)_minmax(184px,0.75fr)] gap-3 border-b border-border/60 px-3 py-2.5 text-hh-status font-medium uppercase tracking-normal text-muted-foreground/70">
              <div>Customer</div>
              <div>Project</div>
              <div>Invoice #</div>
              <div className="text-right">Amount</div>
              <div>Method</div>
              <div>Account</div>
              <div>Date</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              {filteredPayments.map((row) => {
                const paymentVoided = isVoidedPaymentStatus(row.status);
                const highlighted = highlightPaymentId === row.id;
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "group px-3 py-3 transition-colors hover:bg-muted/25 lg:grid lg:grid-cols-[minmax(170px,1.1fr)_minmax(150px,1fr)_minmax(72px,0.45fr)_minmax(110px,0.55fr)_minmax(90px,0.45fr)_minmax(110px,0.55fr)_minmax(102px,0.5fr)_minmax(184px,0.75fr)] lg:items-center lg:gap-3",
                      paymentVoided && "bg-muted/20 opacity-80",
                      highlighted && "ring-2 ring-[var(--hh-border-strong)] ring-inset"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {row.customer_name || "—"}
                        </span>
                        {paymentVoided ? (
                          <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
                            Voided
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground lg:hidden">
                        {row.project_name ?? "—"} · Inv {row.invoice_no ?? "—"}
                      </div>
                    </div>

                    <div className="hidden min-w-0 lg:block">
                      <div className="truncate text-sm text-foreground">
                        {row.project_name ?? "—"}
                      </div>
                    </div>

                    <div className="hidden lg:block text-sm text-muted-foreground hh-fin tabular-nums">
                      {row.invoice_no ?? "—"}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 lg:mt-0 lg:block lg:text-right">
                      <div className="lg:hidden text-xs text-muted-foreground">
                        {formatDate(row.payment_date)}
                      </div>
                      <div className={cn(TYPO.amount, "text-sm text-[var(--hh-success)]")}>
                        {formatCurrency(row.amount)}
                      </div>
                    </div>

                    <div className="hidden min-w-0 lg:block">
                      <div className="text-sm text-muted-foreground">
                        {row.payment_method ?? "—"}
                      </div>
                      {(row.attachments ?? []).length > 0 ? (
                        <Button
                          type="button"
                          variant="quiet"
                          size="sm"
                          data-testid="payment-attachment-action"
                          disabled={openingPaymentAttachmentsId === row.id}
                          onClick={() => void openPaymentAttachments(row.id, row.attachments)}
                          className="mt-1 h-11 min-h-11 max-w-full rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-medium text-[var(--hh-text-secondary)] lg:h-7 lg:min-h-0"
                        >
                          <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                          <span className="truncate">
                            {openingPaymentAttachmentsId === row.id
                              ? "Opening..."
                              : `${row.attachments.length} file${row.attachments.length === 1 ? "" : "s"}`}
                          </span>
                        </Button>
                      ) : null}
                    </div>

                    <div className="hidden lg:block min-w-0 text-sm text-muted-foreground truncate">
                      {row.deposit_account ?? "—"}
                    </div>

                    <div className="hidden lg:block text-sm hh-fin tabular-nums text-muted-foreground">
                      {formatDate(row.payment_date)}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 lg:mt-0 lg:flex lg:justify-end">
                      <div className="lg:hidden text-xs text-muted-foreground">
                        <div>
                          {(row.payment_method ?? "—") + " · " + (row.deposit_account ?? "—")}
                        </div>
                        {(row.attachments ?? []).length > 0 ? (
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            data-testid="payment-attachment-action"
                            disabled={openingPaymentAttachmentsId === row.id}
                            onClick={() => void openPaymentAttachments(row.id, row.attachments)}
                            className="mt-1 h-11 min-h-11 max-w-full rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-medium text-[var(--hh-text-secondary)] lg:h-7 lg:min-h-0"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                            <span className="truncate">
                              {openingPaymentAttachmentsId === row.id
                                ? "Opening..."
                                : `${row.attachments.length} file${
                                    row.attachments.length === 1 ? "" : "s"
                                  }`}
                            </span>
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!paymentVoided ? (
                          <>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-11 min-h-[44px] lg:h-8 lg:min-h-0 rounded-hh-compact px-2 text-xs shadow-none"
                            >
                              <Link
                                href={`/financial/payments?editPayment=${encodeURIComponent(row.id)}`}
                              >
                                <Pencil className="mr-1 h-3.5 w-3.5" />
                                Edit
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-11 min-h-[44px] lg:h-8 lg:min-h-0 rounded-hh-compact px-2 text-xs shadow-none"
                            >
                              <Link
                                href={`/financial/payments?receipt=${encodeURIComponent(row.id)}`}
                              >
                                <ReceiptText className="mr-1 h-3.5 w-3.5" />
                                Receipt
                              </Link>
                            </Button>
                            {receiptActionBusyId === row.id ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-11 min-h-[44px] lg:h-8 lg:min-h-0 rounded-hh-compact px-2 text-xs shadow-none"
                                disabled
                              >
                                <Mail className="mr-1 h-3.5 w-3.5" />
                                Send
                              </Button>
                            ) : (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-11 min-h-[44px] lg:h-8 lg:min-h-0 rounded-hh-compact px-2 text-xs shadow-none"
                              >
                                <Link
                                  href={`/financial/payments?sendReceipt=${encodeURIComponent(row.id)}`}
                                >
                                  <Mail className="mr-1 h-3.5 w-3.5" />
                                  Send
                                </Link>
                              </Button>
                            )}
                          </>
                        ) : null}
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for payment ${row.invoice_no ?? ""}`}
                          actions={[
                            ...(!paymentVoided
                              ? [
                                  {
                                    label: (
                                      <span className="inline-flex items-center gap-2">
                                        <Download className="h-3.5 w-3.5" />
                                        Download PDF
                                      </span>
                                    ),
                                    onClick: () => openReceiptPreview(row.id, "download"),
                                  },
                                  {
                                    label: (
                                      <span className="inline-flex items-center gap-2">
                                        <Printer className="h-3.5 w-3.5" />
                                        Print receipt
                                      </span>
                                    ),
                                    onClick: () => openReceiptPreview(row.id, "print"),
                                  },
                                  {
                                    label: "Void payment",
                                    destructive: true,
                                    onClick: () => setVoidTarget(row),
                                  },
                                ]
                              : [
                                  {
                                    label: "Delete payment",
                                    destructive: true,
                                    onClick: () => void checkDeletePayment(row),
                                  },
                                ]),
                          ]}
                        />
                      </div>
                    </div>

                    {row.notes ? (
                      <div className="mt-2 text-xs text-muted-foreground line-clamp-2 lg:hidden">
                        {row.notes}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <ConfirmDialog
          open={!!voidTarget}
          onOpenChange={(open) => !open && setVoidTarget(null)}
          title="Void payment?"
          description={
            voidTarget
              ? `This will void the payment for ${voidTarget.customer_name || "customer"} on ${formatDate(
                  voidTarget.payment_date
                )}. This cannot be undone.`
              : undefined
          }
          confirmLabel="Void"
          cancelLabel="Cancel"
          destructive
          onConfirm={async () => {
            const row = voidTarget;
            if (!row) return;
            await voidPayment(row);
          }}
        />

        <PaymentDeleteDependenciesDialog
          open={!!deleteTarget && !!deleteDependencies && deleteDependencies.blockers.length > 0}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setDeleteDependencies(null);
            }
          }}
          dependencies={deleteDependencies}
          checking={checkingDelete}
          onRefresh={() => {
            if (deleteTarget) void checkDeletePayment(deleteTarget);
          }}
        />

        <ConfirmDialog
          open={!!deleteTarget && !!deleteDependencies && deleteDependencies.blockers.length === 0}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setDeleteDependencies(null);
            }
          }}
          title="Delete voided payment?"
          description={
            deleteTarget
              ? "This payment is voided and has no blocking links. This will permanently remove the payment record and related payment allocation rows. This cannot be undone."
              : undefined
          }
          confirmLabel="Delete permanently"
          cancelLabel="Cancel"
          destructive
          onConfirm={deleteVoidedPayment}
        />

        <ReceivePaymentModal
          open={modalOpen}
          onOpenChange={handleReceivePaymentOpenChange}
          onSuccess={(context) => {
            setPaymentReturnContext(context);
            void load();
          }}
          preselectedInvoiceId={prefillInvoiceId}
        />
        <EditPaymentReceivedModal
          open={!!editPaymentId}
          paymentId={editPaymentId}
          onOpenChange={(open) => {
            if (!open) {
              if (editPaymentId) clearPaymentQuery();
              setEditPaymentId(null);
            }
          }}
          onSuccess={load}
        />
        <PaymentReceiptPreviewModal
          open={!!receiptPreviewPaymentId}
          paymentId={receiptPreviewPaymentId}
          autoAction={receiptPreviewAction}
          onOpenChange={(open) => {
            if (!open) {
              if (receiptPreviewPaymentId) clearPaymentQuery();
              setReceiptPreviewPaymentId(null);
              setReceiptPreviewAction(null);
            }
          }}
          onSendReceipt={(data) => {
            setSendReceiptData(data);
            setSendReceiptOpen(true);
          }}
        />
        <SendPaymentReceiptModal
          open={sendReceiptOpen}
          data={sendReceiptData}
          onOpenChange={(open) => {
            if (!open && sendReceiptOpen) clearPaymentQuery();
            setSendReceiptOpen(open);
            if (!open) {
              setSendReceiptData(null);
            }
          }}
        />
      </div>
    </div>
  );
}
