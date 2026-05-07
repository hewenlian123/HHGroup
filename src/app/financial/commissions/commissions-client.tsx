"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Paperclip,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  refreshRscNonBlocking,
  syncRouterNonBlocking,
} from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import {
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CommissionPaymentRecord,
  CommissionPaymentStatus,
  CommissionWithPaid,
} from "@/lib/data";
import {
  generateCommissionReceiptPdf,
  printAndDownloadCommissionReceipt,
} from "@/lib/commission-payment-receipt-pdf";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { useToast } from "@/components/toast/toast-provider";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { formatCurrency, formatDate } from "@/lib/formatters";

const PAYMENT_METHODS = ["Check", "Bank Transfer", "Cash", "Zelle", "Other"] as const;

const COMMISSION_ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"] as const;

const fmtUsd = (n: number) => formatCurrency(n);

async function postCommissionReceiptWithProgress(
  uploadUrl: string,
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<{ ok?: boolean; record?: CommissionPaymentRecord; message?: string; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((100 * ev.loaded) / ev.total));
    };
    xhr.onload = () => {
      let data: { ok?: boolean; record?: CommissionPaymentRecord; message?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        data = { message: xhr.responseText || "Invalid response" };
      }
      resolve({ ...data, status: xhr.status });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

const COMMISSION_PAGE_BG = "bg-zinc-50 dark:bg-background";
const COMMISSION_MODAL =
  "max-w-[480px] w-full gap-0 border-0 p-8 shadow-[0_8px_30px_rgba(0_0_0_0.08)] rounded-xl sm:rounded-xl sm:max-w-[480px]";
const COMMISSION_LABEL = "mb-1.5 block text-[12px] font-medium text-text-secondary";
const COMMISSION_FIELD =
  "h-10 rounded-lg border border-gray-100 bg-white text-[14px] focus-visible:border-black focus-visible:ring-1 focus-visible:ring-black";

const commissionsShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const kpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none";

const kpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100/45 text-zinc-400 dark:bg-muted/45 dark:text-muted-foreground";

const RECEIPT_UPLOAD_MODAL =
  "max-w-[480px] w-full gap-0 rounded-[14px] border-[0.5px] border-gray-100 bg-white p-8 shadow-[0_8px_30px_rgba(0_0_0_0.12)] sm:max-w-[480px]";
function PaymentStatusPill({ status }: { status: CommissionPaymentStatus }) {
  const map = {
    unpaid: {
      bg: "bg-zinc-100/80 ring-1 ring-zinc-200/70 dark:bg-muted/35 dark:ring-border/40",
      text: "text-muted-foreground",
      label: "Outstanding",
    },
    partial: {
      bg: "bg-amber-50 ring-1 ring-amber-200/60 dark:bg-amber-900/20 dark:ring-amber-900/30",
      text: "text-amber-800 dark:text-amber-200",
      label: "Partial",
    },
    paid: {
      bg: "bg-emerald-50 ring-1 ring-emerald-200/60 dark:bg-emerald-900/20 dark:ring-emerald-900/30",
      text: "text-emerald-800 dark:text-emerald-200",
      label: "Paid",
    },
  } as const;
  const c = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight",
        c.bg,
        c.text
      )}
    >
      {c.label}
    </span>
  );
}

type Row = CommissionWithPaid & { project_name: string };

function CommissionStatusChip({ row }: { row: Row }) {
  if ((Number(row.commission_amount) || 0) <= 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-zinc-100/80 text-muted-foreground ring-1 ring-zinc-200/70 dark:bg-muted/35 dark:ring-border/40">
        No commission
      </span>
    );
  }
  return <PaymentStatusPill status={row.payment_status} />;
}

export function CommissionsClient({
  summary,
  rows,
  loadError,
}: {
  summary: {
    totalCommission: number;
    paidCommission: number;
    outstandingCommission: number;
    thisMonthPaid: number;
  };
  rows: Row[];
  loadError?: string | null;
}) {
  const router = useRouter();
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);
  const [selectedCommission, setSelectedCommission] = React.useState<Row | null>(null);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<Row | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [editSubmitting, setEditSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "Check" as string,
    note: "",
  });
  const [editForm, setEditForm] = React.useState({
    person_name: "",
    role: "Other" as string,
    commission_amount: "",
  });

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set());
  const [paymentsByCommission, setPaymentsByCommission] = React.useState<
    Record<string, CommissionPaymentRecord[] | undefined>
  >({});
  const [paymentsLoadingId, setPaymentsLoadingId] = React.useState<string | null>(null);

  const [paymentEditOpen, setPaymentEditOpen] = React.useState(false);
  const [paymentEditParent, setPaymentEditParent] = React.useState<Row | null>(null);
  const [paymentEditRecord, setPaymentEditRecord] = React.useState<CommissionPaymentRecord | null>(
    null
  );
  const [paymentEditSubmitting, setPaymentEditSubmitting] = React.useState(false);
  const [paymentEditError, setPaymentEditError] = React.useState<string | null>(null);
  const [paymentEditForm, setPaymentEditForm] = React.useState({
    amount: "",
    payment_date: "",
    payment_method: "Check" as string,
    note: "",
  });

  const [filterSearch, setFilterSearch] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<"all" | CommissionPaymentStatus>("all");
  const [filterPerson, setFilterPerson] = React.useState<string>("all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [paymentDeleteTarget, setPaymentDeleteTarget] = React.useState<{
    parent: Row;
    record: CommissionPaymentRecord;
  } | null>(null);
  const [paymentDeleteSubmitting, setPaymentDeleteSubmitting] = React.useState(false);
  const [commissionDeleteTarget, setCommissionDeleteTarget] = React.useState<Row | null>(null);
  const [commissionDeleteSubmitting, setCommissionDeleteSubmitting] = React.useState(false);
  /** Commission summary PDF modal (`/commission/[id]/pdf`). */
  const [commissionPdfOpenId, setCommissionPdfOpenId] = React.useState<string | null>(null);
  /** Single payment receipt PDF (`/commission-payment/[payment_id]/pdf`). */
  const [paymentReceiptPdfOpenId, setPaymentReceiptPdfOpenId] = React.useState<string | null>(null);

  const receiptUploadInputRef = React.useRef<HTMLInputElement>(null);
  const [receiptUploadModal, setReceiptUploadModal] = React.useState<{
    parent: Row;
    payment: CommissionPaymentRecord;
  } | null>(null);
  const [receiptUploadProgress, setReceiptUploadProgress] = React.useState(0);
  const [receiptUploadDragging, setReceiptUploadDragging] = React.useState(false);
  const [receiptUploadError, setReceiptUploadError] = React.useState<string | null>(null);
  const [receiptUploadSubmitting, setReceiptUploadSubmitting] = React.useState(false);
  const [receiptPreview, setReceiptPreview] = React.useState<{
    parent: Row;
    payment: CommissionPaymentRecord;
    url: string;
    fileName: string;
    isPdf: boolean;
  } | null>(null);
  /** Resolving validated signed URL from /receipt/view-url (must match commission-receipts path). */
  const [receiptViewLoading, setReceiptViewLoading] = React.useState<{
    parent: Row;
    payment: CommissionPaymentRecord;
  } | null>(null);
  const [receiptPreviewDownloading, setReceiptPreviewDownloading] = React.useState(false);
  const [receiptPrinting, setReceiptPrinting] = React.useState(false);
  const receiptPreviewRef = React.useRef(receiptPreview);
  receiptPreviewRef.current = receiptPreview;
  const { openPreview, patchPreview, closePreview } = useAttachmentPreview();
  const { toast } = useToast();
  const [receiptDeletingPaymentId, setReceiptDeletingPaymentId] = React.useState<string | null>(
    null
  );

  const personOptions = React.useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      const n = (r.person_name ?? "").trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus !== "all" && r.payment_status !== filterStatus) return false;
      if (filterPerson !== "all" && (r.person_name ?? "").trim() !== filterPerson) return false;
      if (!q) return true;
      const hay = [
        r.project_name,
        r.person_name,
        r.role,
        fmtUsd(r.commission_amount),
        fmtUsd(r.paid_amount),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filterSearch, filterStatus, filterPerson]);

  // Rows come from RSC props — refresh only, no full sync (avoids duplicate hh:app-sync).
  useOnAppSync(
    React.useCallback(() => {
      refreshRscNonBlocking(router);
    }, [router]),
    [router]
  );

  const loadPaymentsForCommission = React.useCallback(
    async (projectId: string, commissionId: string) => {
      setPaymentsLoadingId(commissionId);
      try {
        const res = await fetch(`/api/projects/${projectId}/commissions/${commissionId}/payments`);
        const data = (await res.json()) as {
          ok?: boolean;
          records?: CommissionPaymentRecord[];
          message?: string;
        };
        if (!res.ok) throw new Error(data.message ?? "Failed to load payments");
        setPaymentsByCommission((prev) => ({
          ...prev,
          [commissionId]: data.records ?? [],
        }));
      } catch {
        setPaymentsByCommission((prev) => ({ ...prev, [commissionId]: [] }));
      } finally {
        setPaymentsLoadingId(null);
      }
    },
    []
  );

  const invalidatePaymentsCache = React.useCallback((commissionId: string) => {
    setPaymentsByCommission((prev) => {
      const next = { ...prev };
      delete next[commissionId];
      return next;
    });
  }, []);

  const toggleExpanded = (row: Row, e: React.MouseEvent) => {
    e.stopPropagation();
    const wasExpanded = expandedIds.has(row.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    if (!wasExpanded && paymentsByCommission[row.id] === undefined) {
      void loadPaymentsForCommission(row.project_id, row.id);
    }
  };

  const openEditModal = (row: Row) => {
    setEditRow(row);
    setEditForm({
      person_name: row.person_name ?? "",
      role: COMMISSION_ROLES.includes(row.role as (typeof COMMISSION_ROLES)[number])
        ? row.role
        : "Other",
      commission_amount: String(row.commission_amount ?? ""),
    });
    setEditError(null);
    setPaymentModalOpen(false);
    setSelectedCommission(null);
    setEditModalOpen(true);
  };

  const openPaymentRecordEdit = (
    parent: Row,
    record: CommissionPaymentRecord,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setPaymentEditParent(parent);
    setPaymentEditRecord(record);
    setPaymentEditForm({
      amount: String(record.amount),
      payment_date: record.payment_date?.slice(0, 10) ?? "",
      payment_method: PAYMENT_METHODS.includes(
        record.payment_method as (typeof PAYMENT_METHODS)[number]
      )
        ? record.payment_method
        : "Other",
      note: record.note ?? "",
    });
    setPaymentEditError(null);
    setPaymentEditOpen(true);
  };

  const handlePaymentRecordEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!paymentEditParent || !paymentEditRecord) return;
    setPaymentEditError(null);
    const amt = Number(paymentEditForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPaymentEditError("Enter an amount greater than zero.");
      return;
    }
    setPaymentEditSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${paymentEditParent.project_id}/commissions/${paymentEditParent.id}/payments/${paymentEditRecord.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            payment_date: paymentEditForm.payment_date,
            payment_method: paymentEditForm.payment_method,
            note: paymentEditForm.note.trim() || null,
          }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to update payment");
      if (data.ok === false) throw new Error(data.message ?? "Failed to update payment");
      setPaymentEditOpen(false);
      setPaymentEditRecord(null);
      setPaymentEditParent(null);
      invalidatePaymentsCache(paymentEditParent.id);
      if (expandedIds.has(paymentEditParent.id)) {
        void loadPaymentsForCommission(paymentEditParent.project_id, paymentEditParent.id);
      }
      syncRouterNonBlocking(router);
    } catch (err) {
      setPaymentEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPaymentEditSubmitting(false);
    }
  };

  const openPaymentDelete = (parent: Row, record: CommissionPaymentRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setPaymentDeleteTarget({ parent, record });
  };

  const resetReceiptUploadModal = React.useCallback(() => {
    setReceiptUploadModal(null);
    setReceiptUploadProgress(0);
    setReceiptUploadDragging(false);
    setReceiptUploadError(null);
    setReceiptUploadSubmitting(false);
    if (receiptUploadInputRef.current) receiptUploadInputRef.current.value = "";
  }, []);

  const openReceiptUploadModal = (
    parent: Row,
    payment: CommissionPaymentRecord,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setReceiptUploadError(null);
    setReceiptUploadProgress(0);
    setReceiptUploadDragging(false);
    setReceiptUploadSubmitting(false);
    setReceiptUploadModal({ parent, payment });
  };

  const receiptAcceptMime = React.useMemo(
    () => ["image/jpeg", "image/png", "application/pdf"] as const,
    []
  );

  const isAllowedReceiptFile = (file: File) => {
    const t = file.type.toLowerCase();
    if (receiptAcceptMime.includes(t as (typeof receiptAcceptMime)[number])) return true;
    const n = file.name.toLowerCase();
    return /\.(jpe?g|png|pdf)$/.test(n);
  };

  const submitReceiptFile = async (file: File) => {
    if (!receiptUploadModal) return;
    if (!isAllowedReceiptFile(file)) {
      setReceiptUploadError("Please choose a JPG, PNG, or PDF file.");
      return;
    }
    const { parent, payment } = receiptUploadModal;
    setReceiptUploadError(null);
    setReceiptUploadSubmitting(true);
    setReceiptUploadProgress(0);
    const fd = new FormData();
    fd.append("file", file);
    const uploadUrl = `/api/projects/${parent.project_id}/commissions/${parent.id}/payments/${payment.id}/receipt`;
    try {
      const data = await postCommissionReceiptWithProgress(uploadUrl, fd, setReceiptUploadProgress);
      if (data.status >= 400 || data.ok === false) {
        throw new Error(data.message ?? "Failed to upload receipt");
      }
      if (data.record) {
        setPaymentsByCommission((prev) => {
          const list = prev[parent.id];
          if (!list) return prev;
          return {
            ...prev,
            [parent.id]: list.map((x) => (x.id === data.record!.id ? { ...x, ...data.record } : x)),
          };
        });
      }
      resetReceiptUploadModal();
      syncRouterNonBlocking(router);
    } catch (err) {
      setReceiptUploadError(err instanceof Error ? err.message : "Failed to upload receipt");
    } finally {
      setReceiptUploadSubmitting(false);
    }
  };

  const onReceiptUploadInputChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (file) void submitReceiptFile(file);
  };

  const handlePreviewDownload = React.useCallback(async () => {
    const r = receiptPreviewRef.current;
    if (!r?.url?.trim()) {
      toast({
        title: "Nothing to download",
        description: "Receipt URL is missing.",
        variant: "default",
      });
      return;
    }
    setReceiptPreviewDownloading(true);
    try {
      const res = await fetch(r.url, { mode: "cors" });
      if (!res.ok) throw new Error("Could not download file");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.fileName;
      a.rel = "noopener noreferrer";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch {
      try {
        window.open(r.url, "_blank", "noopener,noreferrer");
      } catch {
        toast({
          title: "Download failed",
          description: "Could not open the receipt. Try again or copy the link from storage.",
          variant: "error",
        });
      }
    } finally {
      setReceiptPreviewDownloading(false);
    }
  }, [toast]);

  const handlePreviewPrintReceipt = React.useCallback(async () => {
    const r = receiptPreviewRef.current;
    if (!r) return;
    const { parent, payment } = r;
    setReceiptPrinting(true);
    try {
      const blob = await generateCommissionReceiptPdf({
        paymentId: payment.id,
        paymentDate: payment.payment_date || "—",
        personName: parent.person_name ?? "",
        projectName: parent.project_name ?? "",
        role: parent.role ?? "",
        commissionAmount: parent.commission_amount,
        paymentAmount: payment.amount,
        paymentMethod: payment.payment_method ?? "",
        notes: payment.note,
      });
      printAndDownloadCommissionReceipt(blob, payment.id);
    } catch (err) {
      toast({
        title: "Print failed",
        description: err instanceof Error ? err.message : "Failed to generate receipt PDF",
        variant: "error",
      });
    } finally {
      setReceiptPrinting(false);
    }
  }, [toast]);

  const commissionPrintFooter = React.useCallback(
    (printing: boolean) => (
      <Button
        type="button"
        className="h-8 rounded-lg bg-emerald-600 text-[13px] font-medium text-white hover:bg-emerald-700"
        disabled={printing}
        onClick={() => void handlePreviewPrintReceipt()}
      >
        {printing ? (
          <>
            <InlineLoading className="mr-2" size="md" aria-hidden />
            Preparing…
          </>
        ) : (
          "Print Receipt"
        )}
      </Button>
    ),
    [handlePreviewPrintReceipt]
  );

  const openReceiptPreview = (parent: Row, p: CommissionPaymentRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!p.receipt_url) {
      toast({
        title: "No receipt",
        description: "Upload a receipt for this payment to preview it.",
        variant: "default",
      });
      return;
    }
    setReceiptPreview(null);
    setReceiptViewLoading({ parent, payment: p });
    openPreview({
      url: "",
      fileName: "Receipt",
      fileType: "image",
      isLoading: true,
      onClosed: () => {
        setReceiptPreview(null);
        setReceiptViewLoading(null);
      },
      onDownload: () => void handlePreviewDownload(),
      downloadBusy: receiptPreviewDownloading,
      extraFooter: commissionPrintFooter(receiptPrinting),
    });
    void (async () => {
      try {
        const res = await fetch(
          `/api/projects/${parent.project_id}/commissions/${parent.id}/payments/${p.id}/receipt/view-url`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok?: boolean;
          url?: string;
          fileName?: string;
          isPdf?: boolean;
          message?: string;
        };
        if (!res.ok || data.ok === false || !data.url) {
          throw new Error(data.message ?? "Could not load receipt preview.");
        }
        setReceiptPreview({
          parent,
          payment: p,
          url: data.url,
          fileName: data.fileName ?? "receipt",
          isPdf: !!data.isPdf,
        });
        patchPreview({
          url: data.url,
          fileName: data.fileName ?? "receipt",
          fileType: data.isPdf ? "pdf" : "image",
          isLoading: false,
          onDownload: () => void handlePreviewDownload(),
          extraFooter: commissionPrintFooter(receiptPrinting),
        });
      } catch (err) {
        toast({
          title: "Receipt preview failed",
          description: err instanceof Error ? err.message : "Could not load receipt.",
          variant: "error",
        });
        closePreview();
      } finally {
        setReceiptViewLoading(null);
      }
    })();
  };

  React.useEffect(() => {
    patchPreview({ downloadBusy: receiptPreviewDownloading });
  }, [receiptPreviewDownloading, patchPreview]);

  React.useEffect(() => {
    if (!receiptPreview) return;
    patchPreview({ extraFooter: commissionPrintFooter(receiptPrinting) });
  }, [receiptPrinting, receiptPreview, commissionPrintFooter, patchPreview]);

  const deleteCommissionPaymentReceipt = async (
    parent: Row,
    p: CommissionPaymentRecord,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!p.receipt_url?.trim()) {
      toast({
        title: "No receipt",
        description: "Upload a receipt before removing one.",
        variant: "default",
      });
      return;
    }
    if (
      !window.confirm(
        "Remove the uploaded receipt file from this payment? You can upload a new file afterward."
      )
    )
      return;
    setReceiptDeletingPaymentId(p.id);
    try {
      const res = await fetch(
        `/api/projects/${parent.project_id}/commissions/${parent.id}/payments/${p.id}/receipt`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        record?: CommissionPaymentRecord;
      };
      if (!res.ok || data.ok === false) throw new Error(data.message ?? "Failed to remove receipt");
      if (data.record) {
        setPaymentsByCommission((prev) => {
          const list = prev[parent.id];
          if (!list) return prev;
          return {
            ...prev,
            [parent.id]: list.map((x) => (x.id === data.record!.id ? { ...x, ...data.record } : x)),
          };
        });
      }
      setReceiptPreview((prev) => (prev?.payment.id === p.id ? null : prev));
      syncRouterNonBlocking(router);
    } catch (err) {
      toast({
        title: "Remove receipt failed",
        description: err instanceof Error ? err.message : "Failed to remove receipt",
        variant: "error",
      });
    } finally {
      setReceiptDeletingPaymentId(null);
    }
  };

  const confirmDeletePaymentRecord = async () => {
    if (!paymentDeleteTarget) return;
    const { parent, record } = paymentDeleteTarget;
    setPaymentDeleteSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${parent.project_id}/commissions/${parent.id}/payments/${record.id}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to delete");
      if (data.ok === false) throw new Error(data.message ?? "Failed to delete");
      setPaymentDeleteTarget(null);
      invalidatePaymentsCache(parent.id);
      if (expandedIds.has(parent.id)) {
        void loadPaymentsForCommission(parent.project_id, parent.id);
      }
      syncRouterNonBlocking(router);
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete",
        variant: "error",
      });
    } finally {
      setPaymentDeleteSubmitting(false);
    }
  };

  const confirmDeleteCommission = async () => {
    if (!commissionDeleteTarget) return;
    const row = commissionDeleteTarget;
    setCommissionDeleteSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${row.project_id}/commissions/${encodeURIComponent(row.id)}`,
        { method: "DELETE" }
      );
      let data: { ok?: boolean; message?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; message?: string };
      } catch {
        /* non-JSON */
      }
      if (!res.ok) throw new Error(data.message ?? "Failed to delete commission");
      setCommissionDeleteTarget(null);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      invalidatePaymentsCache(row.id);
      syncRouterNonBlocking(router);
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete",
        variant: "error",
      });
    } finally {
      setCommissionDeleteSubmitting(false);
    }
  };

  const openPaymentModal = (row: Row) => {
    setEditModalOpen(false);
    setEditRow(null);
    setSelectedCommission(row);
    setPaymentForm({
      amount: row.outstanding_amount > 0 ? String(row.outstanding_amount) : "",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "Check",
      note: "",
    });
    setError(null);
    setPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommission) {
      setError("No commission selected. Close the dialog and try Pay again.");
      return;
    }
    setError(null);
    const amt = Number(paymentForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${selectedCommission.project_id}/commissions/${selectedCommission.id}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            payment_date: paymentForm.payment_date,
            payment_method: paymentForm.payment_method,
            note: paymentForm.note.trim() || null,
          }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to record payment");
      if (data.ok === false) throw new Error(data.message ?? "Failed to record payment");
      const commissionId = selectedCommission.id;
      const projectId = selectedCommission.project_id;
      setPaymentModalOpen(false);
      setSelectedCommission(null);
      invalidatePaymentsCache(commissionId);
      if (expandedIds.has(commissionId)) {
        void loadPaymentsForCommission(projectId, commissionId);
      }
      syncRouterNonBlocking(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRow) return;
    setEditError(null);
    const name = editForm.person_name.trim();
    if (!name) {
      setEditError("Person name is required.");
      return;
    }
    const commissionAmt = Number(editForm.commission_amount);
    if (!Number.isFinite(commissionAmt) || commissionAmt < 0) {
      setEditError("Enter a valid commission amount.");
      return;
    }
    if (commissionAmt + 1e-9 < editRow.paid_amount) {
      setEditError(
        `Commission amount cannot be less than the amount already paid (${fmtUsd(editRow.paid_amount)}).`
      );
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${editRow.project_id}/commissions/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_name: name,
          role: editForm.role,
          commission_amount: commissionAmt,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to update commission");
      if (data.ok === false) throw new Error(data.message ?? "Failed to update commission");
      setEditModalOpen(false);
      setEditRow(null);
      syncRouterNonBlocking(router);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSubmitting(false);
    }
  };

  const activeDrawerFilterCount =
    (filterStatus !== "all" ? 1 : 0) + (filterPerson !== "all" ? 1 : 0);

  function CommissionPaymentDetailsPanel({ r }: { r: Row }) {
    return (
      <>
        {paymentsLoadingId === r.id ? (
          <p className="text-[12px] text-text-secondary">Loading payments…</p>
        ) : (paymentsByCommission[r.id] ?? []).length === 0 ? (
          <p className="text-[12px] text-text-secondary">No payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[13px] lg:min-w-0">
              <thead>
                <tr className="border-b border-[#D6D3CD] text-left text-[#9CA3AF]">
                  <th className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-wide">
                    Date
                  </th>
                  <th className="py-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-wide">
                    Method
                  </th>
                  <th className="min-w-[8rem] py-2 pr-4 text-[11px] font-semibold uppercase tracking-wide">
                    Note
                  </th>
                  <th className="min-w-[11rem] py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    {/* actions */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(paymentsByCommission[r.id] ?? []).map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[#D6D3CD]/80 last:border-b-0"
                    data-testid={`financial-payment-row-${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-text-secondary">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-text-primary">
                      {fmtUsd(p.amount)}
                    </td>
                    <td className="py-2.5 pr-4 text-[#374151]">{p.payment_method}</td>
                    <td className="max-w-[16rem] truncate py-2.5 pr-4 text-text-secondary">
                      {p.note || "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {p.receipt_url ? (
                          <>
                            <button
                              type="button"
                              disabled={receiptViewLoading?.payment.id === p.id}
                              className="rounded-md p-1.5 text-emerald-700 transition-all duration-150 ease-out hover:-translate-y-px hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.95] active:duration-100 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                              data-testid={`financial-payment-receipt-view-${p.id}`}
                              aria-label="View uploaded receipt"
                              onClick={(e) => openReceiptPreview(r, p, e)}
                            >
                              {receiptViewLoading?.payment.id === p.id ? (
                                <InlineLoading size="md" aria-hidden />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={receiptDeletingPaymentId === p.id}
                              className="rounded-md p-1.5 text-red-600 transition-all duration-150 ease-out hover:-translate-y-px hover:bg-gray-100 hover:text-red-700 active:scale-[0.95] active:duration-100 disabled:opacity-50 dark:hover:bg-muted/50"
                              data-testid={`financial-payment-receipt-remove-${p.id}`}
                              aria-label="Remove uploaded receipt"
                              onClick={(e) => void deleteCommissionPaymentReceipt(r, p, e)}
                            >
                              {receiptDeletingPaymentId === p.id ? (
                                <InlineLoading size="md" aria-hidden />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-[#9CA3AF] transition-all duration-150 ease-out hover:-translate-y-px hover:bg-gray-100 hover:text-text-secondary active:scale-[0.95] active:duration-100 dark:hover:bg-muted/50"
                            data-testid={`financial-payment-receipt-upload-${p.id}`}
                            aria-label="Upload receipt"
                            onClick={(e) => openReceiptUploadModal(r, p, e)}
                          >
                            <Paperclip className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-text-secondary hover:bg-white hover:text-text-primary"
                          data-testid={`financial-payment-view-pdf-${p.id}`}
                          aria-label="View payment receipt PDF"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPaymentReceiptPdfOpenId(p.id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-text-secondary hover:bg-white hover:text-text-primary"
                          data-testid={`financial-payment-edit-${p.id}`}
                          aria-label="Edit payment"
                          onClick={(e) => openPaymentRecordEdit(r, p, e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-red-600 hover:bg-white hover:text-red-700"
                          data-testid={`financial-payment-delete-${p.id}`}
                          aria-label="Delete payment"
                          onClick={(e) => openPaymentDelete(r, p, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[14px] leading-normal",
        COMMISSION_PAGE_BG,
        mobileListPagePaddingClass,
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:max-w-6xl md:gap-4 md:px-6 md:pb-6 md:pt-3"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Commission Payments"
            subtitle="Commission tracking and payout history by project, person, and role."
          />
        </div>
        <MobileListHeader
          title="Commissions"
          fab={<span className="inline-block h-10 w-10 shrink-0" aria-hidden />}
        />
        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <Input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search project, person, role…"
                className={cn("h-10 pl-8 text-sm", COMMISSION_FIELD)}
                aria-label="Search commissions"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Status</p>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className={cn("w-full px-3", COMMISSION_FIELD)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Outstanding</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Person</p>
            <select
              value={filterPerson}
              onChange={(e) => setFilterPerson(e.target.value)}
              className={cn("w-full px-3", COMMISSION_FIELD)}
              aria-label="Filter by person"
            >
              <option value="all">All people</option>
              {personOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        {loadError ? (
          <p className="border-b border-gray-100 pb-3 text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : null}

        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <FileText className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total commission
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {fmtUsd(summary.totalCommission)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Eye className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Paid commission
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {fmtUsd(summary.paidCommission)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Outstanding
                </div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                  {fmtUsd(summary.outstandingCommission)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Paperclip className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  This month paid
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {fmtUsd(summary.thisMonthPaid)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={cn(commissionsShell, "hidden md:block p-3")}>
          <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Search
              </label>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Search project, person, role…"
                  className={cn("h-10 min-h-[44px] pl-8 text-sm", COMMISSION_FIELD)}
                  aria-label="Search commissions"
                />
              </div>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                className={cn("h-10 min-h-[44px] w-full px-3 sm:w-[180px]", COMMISSION_FIELD)}
                aria-label="Filter by status"
              >
                <option value="all">All</option>
                <option value="unpaid">Outstanding</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Person
              </label>
              <select
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
                className={cn("h-10 min-h-[44px] w-full px-3 sm:w-[220px]", COMMISSION_FIELD)}
                aria-label="Filter by person"
              >
                <option value="all">All people</option>
                {personOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {!loadError && rows.length === 0 ? (
          <div className={cn(commissionsShell, "px-4 py-10 text-center")}>
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No commissions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Commission records will appear here when project commissions are created.
            </p>
          </div>
        ) : null}
        {!loadError && rows.length > 0 && filteredRows.length === 0 ? (
          <EmptyState
            title="No commissions match your filters"
            description="Try adjusting your search, status, or person filter."
            icon={null}
          />
        ) : null}

        <div className="md:hidden">
          {!loadError && filteredRows.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-border/60">
              {filteredRows.map((r) => (
                <div key={r.id} className="py-2.5">
                  <div className="flex min-h-[48px] items-start gap-2">
                    <button
                      type="button"
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-[#F3F4F6]"
                      data-testid={`financial-commission-expand-${r.id}`}
                      aria-expanded={expandedIds.has(r.id)}
                      aria-label={expandedIds.has(r.id) ? "Collapse payments" : "Expand payments"}
                      onClick={(e) => toggleExpanded(r, e)}
                    >
                      {expandedIds.has(r.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      data-testid={`financial-commission-row-${r.id}`}
                      onClick={() => router.push(`/projects/${r.project_id}`)}
                    >
                      <p className="truncate text-sm font-medium text-text-primary">
                        {r.project_name || "—"}
                      </p>
                      <p className="truncate text-xs text-text-secondary">
                        {r.person_name || "—"} · {r.role}
                      </p>
                      <p className="mt-1 text-xs font-mono tabular-nums text-text-secondary">
                        Out {fmtUsd(r.outstanding_amount)} · Paid {fmtUsd(r.paid_amount)}
                      </p>
                    </button>
                    <div className="shrink-0 pt-0.5">
                      <CommissionStatusChip row={r} />
                    </div>
                  </div>
                  <div
                    className="mt-2 flex flex-wrap justify-end gap-2 border-t border-gray-100/80 pt-2 dark:border-border/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RowActionsMenu
                      appearance="list"
                      ariaLabel={`Actions for ${r.project_name || "commission"}`}
                      actions={[
                        ...(r.payment_status !== "paid"
                          ? [{ label: "Pay", onClick: () => openPaymentModal(r) }]
                          : []),
                        { label: "View", onClick: () => setCommissionPdfOpenId(r.id) },
                        { label: "Edit", onClick: () => openEditModal(r) },
                        {
                          label: "Delete",
                          destructive: true,
                          onClick: () => setCommissionDeleteTarget(r),
                        },
                      ]}
                      touchFriendly
                    />
                  </div>
                  {expandedIds.has(r.id) ? (
                    <div className="mt-2 border-t border-gray-100 bg-slate-50/80 px-2 py-3 dark:border-border/40">
                      <CommissionPaymentDetailsPanel r={r} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className={cn(commissionsShell, "hidden md:block")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-[13px] lg:min-w-0">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="w-10 px-3 py-3" aria-label="Expand" />
                  <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Project
                  </th>
                  <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Person
                  </th>
                  <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Role
                  </th>
                  <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Commission
                  </th>
                  <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Paid
                  </th>
                  <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Outstanding
                  </th>
                  <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="w-[11rem] px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-[14px] text-text-secondary">
                      No commissions.
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-[14px] text-text-secondary">
                      No rows match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <React.Fragment key={r.id}>
                      <tr
                        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/25"
                        data-testid={`financial-commission-row-${r.id}`}
                        onClick={() => router.push(`/projects/${r.project_id}`)}
                      >
                        <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                            data-testid={`financial-commission-expand-${r.id}`}
                            aria-expanded={expandedIds.has(r.id)}
                            aria-label={
                              expandedIds.has(r.id) ? "Collapse payments" : "Expand payments"
                            }
                            onClick={(e) => toggleExpanded(r, e)}
                          >
                            {expandedIds.has(r.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-4 font-medium text-foreground hover:underline">
                          {r.project_name || "—"}
                        </td>
                        <td className="px-3 py-4 text-foreground/80">{r.person_name || "—"}</td>
                        <td className="px-3 py-4 text-muted-foreground">{r.role}</td>
                        <td className="px-3 py-4 text-right tabular-nums text-foreground">
                          {fmtUsd(r.commission_amount)}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums text-muted-foreground">
                          {fmtUsd(r.paid_amount)}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums font-semibold text-foreground">
                          {fmtUsd(r.outstanding_amount)}
                        </td>
                        <td className="px-3 py-4">
                          <CommissionStatusChip row={r} />
                        </td>
                        <td className="px-3 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu
                            appearance="list"
                            ariaLabel={`Actions for ${r.project_name || "commission"}`}
                            actions={[
                              ...(r.payment_status !== "paid"
                                ? [{ label: "Pay", onClick: () => openPaymentModal(r) }]
                                : []),
                              { label: "View", onClick: () => setCommissionPdfOpenId(r.id) },
                              { label: "Edit", onClick: () => openEditModal(r) },
                              {
                                label: "Delete",
                                destructive: true,
                                onClick: () => setCommissionDeleteTarget(r),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                      {expandedIds.has(r.id) ? (
                        <tr className="border-b border-[#E8E4DD]">
                          <td colSpan={9} className="bg-slate-50/90 p-0">
                            <div className="px-6 py-4 pl-14">
                              <CommissionPaymentDetailsPanel r={r} />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) setEditRow(null);
          }}
        >
          <DialogContent className={COMMISSION_MODAL}>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold text-text-primary">
                Edit Commission
              </DialogTitle>
            </DialogHeader>
            {editRow && (
              <p className="text-[13px] leading-snug text-text-secondary">
                {editRow.project_name || "Project"} · Paid {fmtUsd(editRow.paid_amount)}
              </p>
            )}
            <form onSubmit={handleEditCommission} className="mt-4 flex flex-col gap-4">
              <div>
                <label className={COMMISSION_LABEL}>Person</label>
                <Input
                  value={editForm.person_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, person_name: e.target.value }))}
                  className={COMMISSION_FIELD}
                  required
                  autoComplete="off"
                  data-testid="financial-commission-edit-person"
                />
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Role</label>
                <Select
                  value={editForm.role}
                  onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                  className={cn("w-full", COMMISSION_FIELD)}
                  data-testid="financial-commission-edit-role"
                >
                  {COMMISSION_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Commission Amount</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editForm.commission_amount}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, commission_amount: e.target.value }))
                  }
                  className={COMMISSION_FIELD}
                  required
                  data-testid="financial-commission-edit-amount"
                />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
                  data-testid="financial-commission-edit-cancel"
                  onClick={() => setEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 rounded-lg bg-[#111827] text-[14px] font-medium text-white hover:bg-black/90"
                  disabled={editSubmitting}
                  data-testid="financial-commission-edit-save"
                >
                  <SubmitSpinner loading={editSubmitting} className="mr-2" />
                  {editSubmitting ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={paymentEditOpen}
          onOpenChange={(open) => {
            setPaymentEditOpen(open);
            if (!open) {
              setPaymentEditRecord(null);
              setPaymentEditParent(null);
            }
          }}
        >
          <DialogContent className={COMMISSION_MODAL}>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold text-text-primary">
                Edit Payment
              </DialogTitle>
            </DialogHeader>
            {paymentEditParent && paymentEditRecord && (
              <p className="text-[13px] leading-snug text-text-secondary">
                {paymentEditParent.person_name} · {paymentEditParent.project_name}
              </p>
            )}
            <form onSubmit={handlePaymentRecordEdit} className="mt-4 flex flex-col gap-4">
              <div>
                <label className={COMMISSION_LABEL}>Amount</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentEditForm.amount}
                  onChange={(e) => setPaymentEditForm((p) => ({ ...p, amount: e.target.value }))}
                  className={COMMISSION_FIELD}
                  required
                  data-testid="financial-payment-edit-amount"
                />
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Payment Date</label>
                <Input
                  type="date"
                  value={paymentEditForm.payment_date}
                  onChange={(e) =>
                    setPaymentEditForm((p) => ({ ...p, payment_date: e.target.value }))
                  }
                  className={COMMISSION_FIELD}
                  required
                  data-testid="financial-payment-edit-date"
                />
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Payment Method</label>
                <Select
                  value={paymentEditForm.payment_method}
                  onChange={(e) =>
                    setPaymentEditForm((p) => ({ ...p, payment_method: e.target.value }))
                  }
                  className={cn("w-full", COMMISSION_FIELD)}
                  data-testid="financial-payment-edit-method"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Note</label>
                <Input
                  value={paymentEditForm.note}
                  onChange={(e) => setPaymentEditForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Optional"
                  className={COMMISSION_FIELD}
                  data-testid="financial-payment-edit-note"
                />
              </div>
              {paymentEditError && <p className="text-sm text-destructive">{paymentEditError}</p>}
              <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
                  data-testid="financial-payment-edit-cancel"
                  onClick={() => setPaymentEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 rounded-lg bg-[#111827] text-[14px] font-medium text-white hover:bg-black/90"
                  disabled={paymentEditSubmitting}
                  data-testid="financial-payment-edit-save"
                >
                  <SubmitSpinner loading={paymentEditSubmitting} className="mr-2" />
                  {paymentEditSubmitting ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={paymentModalOpen}
          onOpenChange={(open) => {
            setPaymentModalOpen(open);
            if (!open) setSelectedCommission(null);
          }}
        >
          <DialogContent className={COMMISSION_MODAL}>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold text-text-primary">
                Record Payment
              </DialogTitle>
            </DialogHeader>
            {selectedCommission && (
              <p className="text-[13px] leading-snug text-text-secondary">
                {selectedCommission.person_name} · {selectedCommission.project_name} · Outstanding:
                {fmtUsd(selectedCommission.outstanding_amount)}
              </p>
            )}
            <form onSubmit={handleRecordPayment} className="mt-4 flex flex-col gap-4">
              <div>
                <label className={COMMISSION_LABEL}>Amount</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                  className={COMMISSION_FIELD}
                  required
                  data-testid="financial-record-payment-amount"
                />
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Payment Date</label>
                <Input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))}
                  className={COMMISSION_FIELD}
                  required
                  data-testid="financial-record-payment-date"
                />
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Payment Method</label>
                <Select
                  value={paymentForm.payment_method}
                  onChange={(e) =>
                    setPaymentForm((p) => ({ ...p, payment_method: e.target.value }))
                  }
                  className={cn("w-full", COMMISSION_FIELD)}
                  data-testid="financial-record-payment-method"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Note</label>
                <Input
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Optional"
                  className={COMMISSION_FIELD}
                  data-testid="financial-record-payment-note"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
                  data-testid="financial-record-payment-cancel"
                  onClick={() => setPaymentModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 rounded-lg bg-[#111827] text-[14px] font-medium text-white hover:bg-black/90"
                  disabled={submitting}
                  data-testid="financial-record-payment-save"
                >
                  <SubmitSpinner loading={submitting} className="mr-2" />
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={paymentDeleteTarget != null}
          onOpenChange={(open) => {
            if (!open) setPaymentDeleteTarget(null);
          }}
        >
          <DialogContent className={COMMISSION_MODAL}>
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl font-bold text-text-primary">
                Delete payment
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] leading-relaxed text-text-secondary">
              Remove this payment record? This cannot be undone.
            </p>
            <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
                onClick={() => setPaymentDeleteTarget(null)}
                disabled={paymentDeleteSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-lg bg-red-600 text-[14px] font-medium text-white hover:bg-red-700"
                disabled={paymentDeleteSubmitting}
                onClick={() => void confirmDeletePaymentRecord()}
              >
                {paymentDeleteSubmitting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={commissionDeleteTarget != null}
          onOpenChange={(open) => {
            if (!open) setCommissionDeleteTarget(null);
          }}
        >
          <DialogContent className={COMMISSION_MODAL}>
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl font-bold text-text-primary">
                Delete commission
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] leading-relaxed text-text-secondary">
              Remove commission for{" "}
              <span className="font-medium text-text-primary">
                {commissionDeleteTarget?.person_name?.trim() || "this person"}
              </span>
              ? This cannot be undone.
            </p>
            <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
                onClick={() => setCommissionDeleteTarget(null)}
                disabled={commissionDeleteSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-lg bg-red-600 text-[14px] font-medium text-white hover:bg-red-700"
                disabled={commissionDeleteSubmitting}
                onClick={() => void confirmDeleteCommission()}
              >
                {commissionDeleteSubmitting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={receiptUploadModal != null}
          onOpenChange={(open) => {
            if (!open) resetReceiptUploadModal();
          }}
        >
          <DialogContent className={RECEIPT_UPLOAD_MODAL}>
            {receiptUploadModal ? (
              <>
                <DialogHeader className="space-y-2 text-left">
                  <DialogTitle className="text-lg font-semibold text-text-primary">
                    Upload Receipt
                  </DialogTitle>
                  <DialogDescription className="text-[13px] text-text-secondary">
                    {formatDate(receiptUploadModal.payment.payment_date)} ·{" "}
                    {fmtUsd(receiptUploadModal.payment.amount)}
                  </DialogDescription>
                </DialogHeader>
                <input
                  ref={receiptUploadInputRef}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={onReceiptUploadInputChange}
                />
                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-6 py-10 transition-colors outline-none",
                    receiptUploadDragging
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-[#D1D5DB] bg-[#F9FAFB]",
                    receiptUploadSubmitting && "pointer-events-none opacity-70"
                  )}
                  onClick={() => !receiptUploadSubmitting && receiptUploadInputRef.current?.click()}
                  onKeyDown={(ev) => {
                    if (receiptUploadSubmitting) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      receiptUploadInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setReceiptUploadDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setReceiptUploadDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setReceiptUploadDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setReceiptUploadDragging(false);
                    if (receiptUploadSubmitting) return;
                    const f = e.dataTransfer.files?.[0];
                    if (f) void submitReceiptFile(f);
                  }}
                >
                  <Upload className="mb-3 h-8 w-8 text-[#9CA3AF]" aria-hidden />
                  <p className="text-center text-[14px] font-medium text-[#374151]">
                    Drag &amp; drop or click to upload
                  </p>
                  <p className="mt-1 text-center text-[12px] text-[#9CA3AF]">JPG, PNG, or PDF</p>
                </div>
                {receiptUploadSubmitting ? (
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
                        style={{ width: `${Math.max(0, Math.min(100, receiptUploadProgress))}%` }}
                      />
                    </div>
                    <p className="text-center text-[12px] text-text-secondary">Uploading…</p>
                  </div>
                ) : null}
                {receiptUploadError ? (
                  <p className="mt-3 text-[13px] text-red-600" role="alert">
                    {receiptUploadError}
                  </p>
                ) : null}
                <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
                    disabled={receiptUploadSubmitting}
                    onClick={() => resetReceiptUploadModal()}
                  >
                    Cancel
                  </Button>
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={commissionPdfOpenId != null}
          onOpenChange={(open) => {
            if (!open) setCommissionPdfOpenId(null);
          }}
        >
          <DialogContent className="flex max-h-[90vh] max-w-[920px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 pr-14">
              <DialogTitle className="text-left text-base font-semibold text-text-primary">
                Commission summary
              </DialogTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a
                    href={
                      commissionPdfOpenId
                        ? `/commission/${commissionPdfOpenId}/pdf?download=1`
                        : "#"
                    }
                    download
                  >
                    Download PDF
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const el = document.getElementById(
                      "commission-summary-pdf-frame"
                    ) as HTMLIFrameElement | null;
                    try {
                      el?.contentWindow?.focus();
                      el?.contentWindow?.print();
                    } catch {
                      if (commissionPdfOpenId) {
                        window.open(
                          `/commission/${commissionPdfOpenId}/pdf`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }
                  }}
                >
                  Print PDF
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3">
              {commissionPdfOpenId ? (
                <iframe
                  id="commission-summary-pdf-frame"
                  key={commissionPdfOpenId}
                  title="Commission summary PDF"
                  src={`/commission/${commissionPdfOpenId}/pdf`}
                  className="h-[min(72vh_640px)] w-full rounded-sm border border-border/60 bg-white"
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={paymentReceiptPdfOpenId != null}
          onOpenChange={(open) => {
            if (!open) setPaymentReceiptPdfOpenId(null);
          }}
        >
          <DialogContent className="flex max-h-[90vh] max-w-[920px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 pr-14">
              <DialogTitle className="text-left text-base font-semibold text-text-primary">
                Payment Receipt
              </DialogTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a
                    href={
                      paymentReceiptPdfOpenId
                        ? `/commission-payment/${paymentReceiptPdfOpenId}/pdf?download=1`
                        : "#"
                    }
                    download
                  >
                    Download PDF
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const el = document.getElementById(
                      "commission-payment-pdf-frame"
                    ) as HTMLIFrameElement | null;
                    try {
                      el?.contentWindow?.focus();
                      el?.contentWindow?.print();
                    } catch {
                      if (paymentReceiptPdfOpenId) {
                        window.open(
                          `/commission-payment/${paymentReceiptPdfOpenId}/pdf`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }
                  }}
                >
                  Print PDF
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3">
              {paymentReceiptPdfOpenId ? (
                <iframe
                  id="commission-payment-pdf-frame"
                  key={paymentReceiptPdfOpenId}
                  title="Payment Receipt PDF"
                  src={`/commission-payment/${paymentReceiptPdfOpenId}/pdf`}
                  className="h-[min(72vh_640px)] w-full rounded-sm border border-border/60 bg-white"
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
