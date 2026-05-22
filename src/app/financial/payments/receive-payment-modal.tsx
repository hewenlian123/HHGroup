"use client";

import * as React from "react";
import { Camera, ChevronRight, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FinanceDatePicker } from "@/components/ui/date-picker";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import {
  getInvoicesWithDerived,
  getProjectById,
  getProjects,
  PAYMENT_METHODS,
  type InvoiceWithDerived,
  type CreatePaymentReceivedAttachmentPayload,
  type CreatePaymentReceivedPayload,
} from "@/lib/data";
import { createBrowserClient } from "@/lib/supabase";
import {
  paymentAttachmentFileTypeForUpload,
  removeUploadedPaymentAttachment,
  uploadPaymentAttachmentToStorage,
} from "@/lib/payment-attachment-upload-browser";
import { useToast } from "@/components/toast/toast-provider";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { createPaymentReceivedAction } from "./actions";

type ReceivePaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-fill for invoice detail page: preselect this invoice and lock it. */
  preselectedInvoiceId?: string | null;
  /** Pre-fill remaining balance as default amount. */
  remainingBalance?: number;
};

type AttachmentDraftStatus = "uploading" | "uploaded" | "failed";

type PaymentAttachmentDraft = CreatePaymentReceivedAttachmentPayload & {
  id: string;
  dedupeKey: string;
  status: AttachmentDraftStatus;
  previewUrl: string | null;
  localPreviewUrl: string | null;
  error?: string;
  sourceFile?: File;
};

function formatBytes(n: number | null | undefined): string {
  const size = Number(n ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileDedupeKey(file: File): string {
  return `${file.name}:${file.size}`;
}

function makeLocalPreview(file: File): string | null {
  if (!file.type.startsWith("image/")) return null;
  return URL.createObjectURL(file);
}

function nextPaymentMemo(previous: string, invoiceNo: string): string {
  const trimmed = previous.trim();
  return !trimmed || trimmed.startsWith("Payment for ") ? `Payment for ${invoiceNo}` : previous;
}

function canReceivePayment(inv: InvoiceWithDerived): boolean {
  return (
    inv.status !== "Draft" &&
    inv.balanceDue > 0 &&
    (inv.computedStatus === "Unpaid" ||
      inv.computedStatus === "Partial" ||
      inv.computedStatus === "Overdue")
  );
}

function PaymentAttachmentRow({
  attachment,
  disabled,
  onPreview,
  onRetry,
  onRemove,
}: {
  attachment: PaymentAttachmentDraft;
  disabled: boolean;
  onPreview: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const isImage = attachment.file_type === "image";
  const canPreview = Boolean(attachment.previewUrl || attachment.localPreviewUrl);
  return (
    <div
      className={cn(
        "group flex min-h-[58px] items-center gap-3 rounded-xl border border-black/[0.06] bg-muted/[0.18] px-3 py-2.5 transition-colors dark:border-white/[0.08]",
        attachment.status === "failed" && "border-red-200 bg-red-50/60 dark:border-red-900/40"
      )}
    >
      <button
        type="button"
        disabled={!canPreview}
        onClick={onPreview}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
        aria-label={`Preview ${attachment.file_name}`}
      >
        {isImage && attachment.localPreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob thumbnail
          <img src={attachment.localPreviewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5" strokeWidth={1.5} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{attachment.file_name}</p>
        <p
          className={cn(
            "mt-0.5 truncate text-[11px] text-muted-foreground",
            attachment.status === "failed" && "text-red-600 dark:text-red-400"
          )}
        >
          {attachment.status === "uploading"
            ? "Uploading..."
            : attachment.status === "failed"
              ? attachment.error || "Upload failed"
              : [formatBytes(attachment.size_bytes), attachment.file_type.toUpperCase()]
                  .filter(Boolean)
                  .join(" · ")}
        </p>
      </div>
      {attachment.status === "failed" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/80 disabled:pointer-events-none disabled:opacity-40"
        >
          Retry
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        aria-label="Remove attachment"
      >
        <X className="h-4 w-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}

export function ReceivePaymentModal({
  open,
  onOpenChange,
  onSuccess,
  preselectedInvoiceId,
  remainingBalance,
}: ReceivePaymentModalProps) {
  const { toast } = useToast();
  const { openPreview } = useAttachmentPreview();
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragDepthRef = React.useRef(0);
  const preserveUploadedAttachmentsRef = React.useRef(false);
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
  const [attachmentDrafts, setAttachmentDrafts] = React.useState<PaymentAttachmentDraft[]>([]);
  const [dragActive, setDragActive] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const attachmentDraftsRef = React.useRef(attachmentDrafts);
  React.useEffect(() => {
    attachmentDraftsRef.current = attachmentDrafts;
  }, [attachmentDrafts]);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const selectedInvoiceId = preselectedInvoiceId ?? invoiceId;

  const cleanupDrafts = React.useCallback(
    async (drafts: PaymentAttachmentDraft[], removeStorage: boolean) => {
      for (const draft of drafts) {
        if (draft.localPreviewUrl) URL.revokeObjectURL(draft.localPreviewUrl);
        if (removeStorage && draft.status === "uploaded" && draft.file_url && supabase) {
          try {
            await removeUploadedPaymentAttachment(supabase, draft.file_url);
          } catch {
            /* best effort cleanup */
          }
        }
      }
    },
    [supabase]
  );

  React.useEffect(() => {
    if (open) {
      preserveUploadedAttachmentsRef.current = false;
      return;
    }
    const drafts = attachmentDraftsRef.current;
    setAttachmentDrafts([]);
    setDragActive(false);
    dragDepthRef.current = 0;
    void cleanupDrafts(drafts, !preserveUploadedAttachmentsRef.current);
    preserveUploadedAttachmentsRef.current = false;
  }, [cleanupDrafts, open]);

  React.useEffect(
    () => () => {
      void cleanupDrafts(attachmentDraftsRef.current, !preserveUploadedAttachmentsRef.current);
    },
    [cleanupDrafts]
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getInvoicesWithDerived(), getProjects()]).then(([invList, projList]) => {
      if (cancelled) return;
      const receivable = invList.filter(canReceivePayment);
      setInvoices(receivable);
      setProjects(projList);
      if (preselectedInvoiceId) {
        const inv = receivable.find((i) => i.id === preselectedInvoiceId);
        if (inv) {
          setInvoiceId(inv.id);
          setProjectId(inv.projectId);
          setCustomerName(inv.clientName);
          setAmount(remainingBalance != null ? String(remainingBalance) : String(inv.balanceDue));
          setNotes((prev) => nextPaymentMemo(prev, inv.invoiceNo));
        }
      } else {
        setInvoiceId("");
        setProjectId("");
        setCustomerName("");
        setAmount(remainingBalance != null ? String(remainingBalance) : "");
        setNotes("");
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
      setNotes((prev) => nextPaymentMemo(prev, inv.invoiceNo));
    }
  }, [invoiceId, invoices, preselectedInvoiceId, remainingBalance, amount]);

  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );
  React.useEffect(() => {
    if (!projectId || projectNameById.has(projectId)) return;
    let cancelled = false;
    getProjectById(projectId)
      .then((project) => {
        if (cancelled || !project) return;
        setProjects((prev) => (prev.some((p) => p.id === project.id) ? prev : [project, ...prev]));
      })
      .catch(() => {
        /* Keep the field blank rather than showing a raw project UUID. */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, projectNameById]);

  const updateDraft = React.useCallback((id: string, patch: Partial<PaymentAttachmentDraft>) => {
    setAttachmentDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft))
    );
  }, []);

  const uploadDraft = React.useCallback(
    async (draftId: string, file: File, invoiceIdForPath: string) => {
      if (!supabase) return;
      updateDraft(draftId, { status: "uploading", error: undefined });
      try {
        const uploaded = await uploadPaymentAttachmentToStorage(
          supabase,
          file,
          invoiceIdForPath,
          draftId.slice(0, 8)
        );
        updateDraft(draftId, {
          ...uploaded,
          status: "uploaded",
          previewUrl: uploaded.preview_url,
          error: undefined,
        });
      } catch (err) {
        updateDraft(draftId, {
          status: "failed",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [supabase, updateDraft]
  );

  const handleFiles = React.useCallback(
    (files: FileList | File[] | null) => {
      if (!files?.length) return;
      if (!supabase) {
        toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      const invId = selectedInvoiceId;
      if (!invId) {
        toast({ title: "Select an invoice before adding attachments", variant: "error" });
        return;
      }

      const existing = new Set(attachmentDraftsRef.current.map((d) => d.dedupeKey));
      const nextDrafts: PaymentAttachmentDraft[] = [];
      for (const file of Array.from(files)) {
        if (file.size <= 0) continue;
        const fileType = paymentAttachmentFileTypeForUpload(file);
        if (!fileType) {
          toast({
            title: "Skipped file",
            description: `${file.name || "This file"} is not an image or PDF.`,
            variant: "error",
          });
          continue;
        }
        const key = fileDedupeKey(file);
        if (existing.has(key)) continue;
        existing.add(key);
        const id = crypto.randomUUID();
        nextDrafts.push({
          id,
          dedupeKey: key,
          file_url: "",
          file_name:
            file.name || (fileType === "pdf" ? "Payment attachment.pdf" : "Payment photo.jpg"),
          mime_type: file.type || null,
          size_bytes: file.size,
          file_type: fileType,
          status: "uploading",
          previewUrl: null,
          localPreviewUrl: makeLocalPreview(file),
          sourceFile: file,
        });
      }
      if (nextDrafts.length === 0) return;
      setAttachmentDrafts((prev) => [...prev, ...nextDrafts]);
      for (const draft of nextDrafts) {
        const file = draft.sourceFile;
        if (file) void uploadDraft(draft.id, file, invId);
      }
    },
    [selectedInvoiceId, supabase, toast, uploadDraft]
  );

  const handleRemoveAttachment = React.useCallback(
    (draft: PaymentAttachmentDraft) => {
      setAttachmentDrafts((prev) => prev.filter((item) => item.id !== draft.id));
      if (draft.localPreviewUrl) URL.revokeObjectURL(draft.localPreviewUrl);
      if (draft.status === "uploaded" && draft.file_url && supabase) {
        void removeUploadedPaymentAttachment(supabase, draft.file_url);
      }
    },
    [supabase]
  );

  const handleRetryAttachment = React.useCallback(
    (draft: PaymentAttachmentDraft) => {
      if (!draft.sourceFile || !selectedInvoiceId) return;
      void uploadDraft(draft.id, draft.sourceFile, selectedInvoiceId);
    },
    [selectedInvoiceId, uploadDraft]
  );

  const handlePreviewAttachment = React.useCallback(
    (draft: PaymentAttachmentDraft) => {
      const url = draft.previewUrl || draft.localPreviewUrl;
      if (!url) return;
      openPreview({
        url,
        fileName: draft.file_name,
        fileType: draft.file_type,
        mimeType: draft.mime_type ?? undefined,
      });
    },
    [openPreview]
  );

  const hasUploadingAttachments = attachmentDrafts.some((draft) => draft.status === "uploading");
  const hasFailedAttachments = attachmentDrafts.some((draft) => draft.status === "failed");
  const disableSubmit = saving || hasUploadingAttachments || hasFailedAttachments;

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>
  ) => {
    e?.preventDefault();
    if (saving) return;
    const invId = preselectedInvoiceId ?? invoiceId;
    if (!invId) {
      toast({ title: "Select an invoice", variant: "error" });
      return;
    }
    if (hasUploadingAttachments) {
      toast({ title: "Attachments are still uploading", variant: "error" });
      return;
    }
    if (hasFailedAttachments) {
      toast({ title: "Remove or retry failed attachments", variant: "error" });
      return;
    }
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast({ title: "Enter a valid amount", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const attachments = attachmentDrafts
        .filter((draft) => draft.status === "uploaded" && draft.file_url)
        .map<CreatePaymentReceivedAttachmentPayload>((draft) => ({
          file_url: draft.file_url,
          file_name: draft.file_name,
          mime_type: draft.mime_type ?? null,
          size_bytes: draft.size_bytes ?? null,
          file_type: draft.file_type,
        }));
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
        attachments,
      };
      const result = await createPaymentReceivedAction(payload);
      if (!result.ok) throw new Error(result.error);
      preserveUploadedAttachmentsRef.current = true;
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

  const onDragEnter = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!selectedInvoiceId || saving) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onDragLeave = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDragActive(false);
    }
  };

  const onDragOver = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = selectedInvoiceId && !saving ? "copy" : "none";
  };

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (saving) return;
    handleFiles(ev.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto rounded-md border-border/60">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="text-base font-medium">Receive Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Invoice
            </label>
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              required
              disabled={!!preselectedInvoiceId || attachmentDrafts.length > 0}
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Project
            </label>
            <Input
              value={projectId ? (projectNameById.get(projectId) ?? "") : ""}
              readOnly
              className="h-9 bg-muted/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Payment Date
              </label>
              <FinanceDatePicker value={paymentDate} onChange={setPaymentDate} size="md" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Attachments
            </label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              disabled={saving || !selectedInvoiceId}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              className="hidden"
              aria-hidden
              tabIndex={-1}
              disabled={saving || !selectedInvoiceId}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={saving || !selectedInvoiceId}
                onClick={() => cameraInputRef.current?.click()}
                className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-black/[0.07] bg-background px-3 py-3 text-left transition-[background-color,border-color,transform] hover:border-black/[0.12] hover:bg-muted/30 active:scale-[0.995] disabled:pointer-events-none disabled:opacity-45 dark:border-white/[0.09]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/55">
                  <Camera className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">Take photo</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    Camera upload
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                />
              </button>
              <button
                type="button"
                disabled={saving || !selectedInvoiceId}
                onClick={() => uploadInputRef.current?.click()}
                className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-black/[0.07] bg-background px-3 py-3 text-left transition-[background-color,border-color,transform] hover:border-black/[0.12] hover:bg-muted/30 active:scale-[0.995] disabled:pointer-events-none disabled:opacity-45 dark:border-white/[0.09]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/55">
                  <Upload className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">
                    Upload files
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    Images or PDFs
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                />
              </button>
            </div>
            <div
              role="group"
              aria-label="Payment attachments"
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={cn(
                "rounded-xl border border-dashed px-3 py-3 transition-[border-color,background-color,box-shadow]",
                "border-black/[0.12] bg-muted/[0.22] dark:border-white/[0.12]",
                selectedInvoiceId && !saving && "hover:bg-muted/[0.34]",
                dragActive &&
                  "border-foreground/25 bg-muted/50 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]",
                (!selectedInvoiceId || saving) && "opacity-55"
              )}
            >
              <p className="text-center text-[12px] font-medium text-foreground/85">
                Drop payment attachments here
              </p>
              <p className="mt-0.5 text-center text-[11px] text-muted-foreground">Photos or PDFs</p>
            </div>
            {attachmentDrafts.length > 0 ? (
              <div className="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-0.5">
                {attachmentDrafts.map((draft) => (
                  <PaymentAttachmentRow
                    key={draft.id}
                    attachment={draft}
                    disabled={saving}
                    onPreview={() => handlePreviewAttachment(draft)}
                    onRetry={() => handleRetryAttachment(draft)}
                    onRemove={() => handleRemoveAttachment(draft)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-ghost h-8"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={disableSubmit}
              onClick={(e) => void handleSubmit(e)}
            >
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving..." : "Receive Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
