"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

const PAYMENT_METHODS = ["Check", "Bank Transfer", "Cash", "Zelle", "Other"] as const;

const COMMISSION_ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"] as const;

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

const COMMISSION_PAGE_BG = "bg-[#F8F7F4]";
const COMMISSION_MODAL =
  "max-w-[480px] w-full gap-0 border-0 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-xl sm:rounded-xl sm:max-w-[480px]";
const COMMISSION_LABEL = "mb-1.5 block text-[12px] font-medium text-[#6B7280]";
const COMMISSION_FIELD =
  "h-10 rounded-lg border border-[#E5E7EB] bg-white text-[14px] focus-visible:border-black focus-visible:ring-1 focus-visible:ring-black";

const RECEIPT_UPLOAD_MODAL =
  "max-w-[480px] w-full gap-0 rounded-[14px] border-[0.5px] border-[#E5E7EB] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:max-w-[480px]";
function PaymentStatusPill({ status }: { status: CommissionPaymentStatus }) {
  const map = {
    unpaid: { bg: "bg-[#F3F4F6]", text: "text-[#6B7280]", label: "Unpaid" },
    partial: { bg: "bg-[#FEF9C3]", text: "text-[#854D0E]", label: "Partial" },
    paid: { bg: "bg-[#DCFCE7]", text: "text-[#166534]", label: "Paid" },
  } as const;
  const c = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium leading-tight",
        c.bg,
        c.text
      )}
    >
      {c.label}
    </span>
  );
}

type Row = CommissionWithPaid & { project_name: string };

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
  const [, startTransition] = React.useTransition();
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

  // Rows come from RSC props — refresh only, do not call syncRouterAndClients here (would re-dispatch hh:app-sync).
  useOnAppSync(
    React.useCallback(() => {
      void Promise.resolve(router.refresh());
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
      startTransition(() => {
        void syncRouterAndClients(router);
      });
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
      startTransition(() => {
        void syncRouterAndClients(router);
      });
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
    if (!r) return;
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
      window.open(r.url, "_blank", "noopener,noreferrer");
    } finally {
      setReceiptPreviewDownloading(false);
    }
  }, []);

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
      alert(err instanceof Error ? err.message : "Failed to generate receipt PDF");
    } finally {
      setReceiptPrinting(false);
    }
  }, []);

  const commissionPrintFooter = React.useCallback(
    (printing: boolean) => (
      <Button
        type="button"
        className="h-8 rounded-lg bg-[#2563EB] text-[13px] font-medium text-white hover:bg-[#1D4ED8]"
        disabled={printing}
        onClick={() => void handlePreviewPrintReceipt()}
      >
        {printing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
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
    if (!p.receipt_url) return;
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
        alert(err instanceof Error ? err.message : "Could not load receipt.");
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
    if (!p.receipt_url) return;
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
      startTransition(() => {
        void syncRouterAndClients(router);
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove receipt");
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
      startTransition(() => {
        void syncRouterAndClients(router);
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
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
      startTransition(() => {
        void syncRouterAndClients(router);
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
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
      await syncRouterAndClients(router);
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
      startTransition(() => {
        void syncRouterAndClients(router);
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "page-container page-stack py-8 text-[14px] leading-normal",
        COMMISSION_PAGE_BG
      )}
    >
      <PageHeader
        className="text-[#111827]"
        title="Commission Payments"
        description="Track commissions and record payments."
      />

      {loadError ? (
        <p className="border-b border-[#E5E7EB] pb-3 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["TOTAL COMMISSION", summary.totalCommission],
            ["PAID COMMISSION", summary.paidCommission],
            ["OUTSTANDING", summary.outstandingCommission],
            ["THIS MONTH PAID", summary.thisMonthPaid],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
              {label}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#111827]">
              ${fmtUsd(value)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search project, person, role…"
            className={cn("pl-9", COMMISSION_FIELD)}
            aria-label="Search commissions"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className={cn("min-w-[140px] px-3", COMMISSION_FIELD)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <select
          value={filterPerson}
          onChange={(e) => setFilterPerson(e.target.value)}
          className={cn("min-w-[160px] px-3", COMMISSION_FIELD)}
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

      <div className="overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b-2 border-[#E5E7EB]">
                <th className="w-10 px-3 py-3" aria-label="Expand" />
                <th className="px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Project
                </th>
                <th className="px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Person
                </th>
                <th className="px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Role
                </th>
                <th className="px-3 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Commission
                </th>
                <th className="px-3 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Paid
                </th>
                <th className="px-3 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Outstanding
                </th>
                <th className="px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Status
                </th>
                <th className="w-[11rem] px-3 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[14px] text-[#6B7280]">
                    No commissions.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[14px] text-[#6B7280]">
                    No rows match your filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr
                      className="cursor-pointer border-b border-[#E8E4DD] transition-shadow duration-150 hover:bg-white hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
                      data-testid={`financial-commission-row-${r.id}`}
                      onClick={() => router.push(`/projects/${r.project_id}`)}
                    >
                      <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"
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
                      <td className="px-3 py-4 font-medium text-[#111827] hover:underline">
                        {r.project_name || "—"}
                      </td>
                      <td className="px-3 py-4 text-[#374151]">{r.person_name || "—"}</td>
                      <td className="px-3 py-4 text-[#6B7280]">{r.role}</td>
                      <td className="px-3 py-4 text-right font-mono tabular-nums text-[#111827]">
                        ${fmtUsd(r.commission_amount)}
                      </td>
                      <td className="px-3 py-4 text-right font-mono tabular-nums text-[#6B7280]">
                        ${fmtUsd(r.paid_amount)}
                      </td>
                      <td className="px-3 py-4 text-right font-mono tabular-nums font-medium text-[#111827]">
                        ${fmtUsd(r.outstanding_amount)}
                      </td>
                      <td className="px-3 py-4">
                        <PaymentStatusPill status={r.payment_status} />
                      </td>
                      <td className="px-3 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex flex-wrap items-center justify-end gap-3">
                          {r.payment_status !== "paid" ? (
                            <button
                              type="button"
                              className="text-[14px] font-medium text-[#111827] hover:underline"
                              data-testid={`financial-commission-record-payment-${r.id}`}
                              aria-label="Record payment"
                              onClick={() => openPaymentModal(r)}
                            >
                              Pay
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-[14px] font-medium text-[#6B7280] hover:text-[#111827] hover:underline"
                            data-testid={`financial-commission-view-pdf-${r.id}`}
                            aria-label="View commission summary PDF"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCommissionPdfOpenId(r.id);
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="text-[14px] font-medium text-[#6B7280] hover:text-[#111827] hover:underline"
                            data-testid={`financial-commission-edit-${r.id}`}
                            onClick={() => openEditModal(r)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-[14px] font-medium text-red-600 hover:text-red-700 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCommissionDeleteTarget(r);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedIds.has(r.id) ? (
                      <tr className="border-b border-[#E8E4DD]">
                        <td colSpan={9} className="bg-[#EDE9E1]/90 p-0">
                          <div className="px-6 py-4 pl-14">
                            {paymentsLoadingId === r.id ? (
                              <p className="text-[12px] text-[#6B7280]">Loading payments…</p>
                            ) : (paymentsByCommission[r.id] ?? []).length === 0 ? (
                              <p className="text-[12px] text-[#6B7280]">No payments recorded.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-[13px]">
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
                                        <td className="py-2.5 pr-4 font-mono tabular-nums text-[#6B7280]">
                                          {p.payment_date || "—"}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-[#111827]">
                                          ${fmtUsd(p.amount)}
                                        </td>
                                        <td className="py-2.5 pr-4 text-[#374151]">
                                          {p.payment_method}
                                        </td>
                                        <td className="max-w-[16rem] truncate py-2.5 pr-4 text-[#6B7280]">
                                          {p.note || "—"}
                                        </td>
                                        <td className="py-2.5 text-right">
                                          <div className="inline-flex items-center justify-end gap-1">
                                            {p.receipt_url ? (
                                              <>
                                                <button
                                                  type="button"
                                                  disabled={receiptViewLoading?.payment.id === p.id}
                                                  className="rounded-md p-1.5 text-blue-600 hover:bg-white hover:text-blue-700 disabled:opacity-50"
                                                  data-testid={`financial-payment-receipt-view-${p.id}`}
                                                  aria-label="View uploaded receipt"
                                                  onClick={(e) => openReceiptPreview(r, p, e)}
                                                >
                                                  {receiptViewLoading?.payment.id === p.id ? (
                                                    <Loader2
                                                      className="h-4 w-4 animate-spin"
                                                      aria-hidden
                                                    />
                                                  ) : (
                                                    <FileText className="h-4 w-4" />
                                                  )}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={receiptDeletingPaymentId === p.id}
                                                  className="rounded-md p-1.5 text-red-600 hover:bg-white hover:text-red-700 disabled:opacity-50"
                                                  data-testid={`financial-payment-receipt-remove-${p.id}`}
                                                  aria-label="Remove uploaded receipt"
                                                  onClick={(e) =>
                                                    void deleteCommissionPaymentReceipt(r, p, e)
                                                  }
                                                >
                                                  {receiptDeletingPaymentId === p.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                  )}
                                                </button>
                                              </>
                                            ) : (
                                              <button
                                                type="button"
                                                className="rounded-md p-1.5 text-[#9CA3AF] hover:bg-white hover:text-[#6B7280]"
                                                data-testid={`financial-payment-receipt-upload-${p.id}`}
                                                aria-label="Upload receipt"
                                                onClick={(e) => openReceiptUploadModal(r, p, e)}
                                              >
                                                <Paperclip className="h-4 w-4" />
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              className="rounded-md p-1.5 text-[#6B7280] hover:bg-white hover:text-[#111827]"
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
                                              className="rounded-md p-1.5 text-[#6B7280] hover:bg-white hover:text-[#111827]"
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
            <DialogTitle className="text-xl font-bold text-[#111827]">Edit Commission</DialogTitle>
          </DialogHeader>
          {editRow && (
            <p className="text-[13px] leading-snug text-[#6B7280]">
              {editRow.project_name || "Project"} · Paid ${fmtUsd(editRow.paid_amount)}
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
                onChange={(e) => setEditForm((p) => ({ ...p, commission_amount: e.target.value }))}
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
                className="h-10 rounded-lg border-[#E5E7EB] bg-white text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
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
            <DialogTitle className="text-xl font-bold text-[#111827]">Edit Payment</DialogTitle>
          </DialogHeader>
          {paymentEditParent && paymentEditRecord && (
            <p className="text-[13px] leading-snug text-[#6B7280]">
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
                className="h-10 rounded-lg border-[#E5E7EB] bg-white text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
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
            <DialogTitle className="text-xl font-bold text-[#111827]">Record Payment</DialogTitle>
          </DialogHeader>
          {selectedCommission && (
            <p className="text-[13px] leading-snug text-[#6B7280]">
              {selectedCommission.person_name} · {selectedCommission.project_name} · Outstanding: $
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
                onChange={(e) => setPaymentForm((p) => ({ ...p, payment_method: e.target.value }))}
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
                className="h-10 rounded-lg border-[#E5E7EB] bg-white text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
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
            <DialogTitle className="text-xl font-bold text-[#111827]">Delete payment</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-[#6B7280]">
            Remove this payment record? This cannot be undone.
          </p>
          <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-[#E5E7EB] bg-white text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
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
            <DialogTitle className="text-xl font-bold text-[#111827]">
              Delete commission
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-[#6B7280]">
            Remove commission for{" "}
            <span className="font-medium text-[#111827]">
              {commissionDeleteTarget?.person_name?.trim() || "this person"}
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-[#E5E7EB] bg-white text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
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
                <DialogTitle className="text-lg font-semibold text-[#111827]">
                  Upload Receipt
                </DialogTitle>
                <DialogDescription className="text-[13px] text-[#6B7280]">
                  {receiptUploadModal.payment.payment_date || "—"} · $
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
                    ? "border-[#2563EB] bg-[#EFF6FF]"
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
                      className="h-full rounded-full bg-[#2563EB] transition-[width] duration-150"
                      style={{ width: `${Math.max(0, Math.min(100, receiptUploadProgress))}%` }}
                    />
                  </div>
                  <p className="text-center text-[12px] text-[#6B7280]">Uploading…</p>
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
                  className="h-10 rounded-lg border-[#E5E7EB] bg-white text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB]"
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
            <DialogTitle className="text-left text-base font-semibold text-[#111827]">
              Commission summary
            </DialogTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-8" asChild>
                <a
                  href={
                    commissionPdfOpenId ? `/commission/${commissionPdfOpenId}/pdf?download=1` : "#"
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
                className="h-[min(72vh,640px)] w-full rounded-sm border border-border/60 bg-white"
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
            <DialogTitle className="text-left text-base font-semibold text-[#111827]">
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
                className="h-[min(72vh,640px)] w-full rounded-sm border border-border/60 bg-white"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
