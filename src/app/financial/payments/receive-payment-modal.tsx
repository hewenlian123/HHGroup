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
import { nextDecimalDraft, parseDecimalDraft } from "@/lib/decimal-draft";
import { formatMoneyInput, moneyToCents, roundMoney } from "@/lib/money";
import {
  getArPaymentIntent,
  beginArPaymentIntent,
  clearArPaymentIntent,
} from "@/lib/ar-payment-intent";
import { cn } from "@/lib/utils";
import { createPaymentReceivedAction } from "./actions";

type ReceivePaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (context: { paymentId: string; invoiceId: string; projectId: string | null }) => void;
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

const paymentFieldLabelClass = "text-hh-label font-[650] uppercase text-[var(--hh-muted)]";
const paymentFieldClass =
  "h-11 rounded-hh-standard border-[var(--hh-line-input)] bg-[var(--hh-surface)] text-[var(--hh-ink)] shadow-none";
const paymentSelectClass =
  "flex h-11 w-full rounded-hh-standard border border-[var(--hh-line-input)] bg-[var(--hh-surface)] px-3 text-hh-body text-[var(--hh-ink)]";

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
        "group flex min-h-[58px] items-center gap-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-selected)] px-3 py-2.5 transition-colors",
        attachment.status === "failed" &&
          "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]"
      )}
    >
      <button
        type="button"
        disabled={!canPreview}
        onClick={onPreview}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-hh-standard bg-[var(--hh-surface)] text-[var(--hh-muted)] ring-offset-background transition-colors hover:text-[var(--hh-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
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
        <p className="truncate text-hh-table-cell font-medium text-[var(--hh-ink)]">
          {attachment.file_name}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-hh-status text-[var(--hh-muted)]",
            attachment.status === "failed" && "text-[var(--hh-danger)]"
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
          className="shrink-0 rounded-hh-compact px-2 py-1.5 text-hh-metadata font-medium text-[var(--hh-ink)] transition-colors hover:bg-[var(--hh-surface-sunken)] disabled:pointer-events-none disabled:opacity-40"
        >
          Retry
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--hh-muted)] transition-colors hover:bg-[var(--hh-surface-sunken)] hover:text-[var(--hh-ink)] disabled:pointer-events-none disabled:opacity-40"
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
  const submissionInFlight = React.useRef(false);
  const [actorId, setActorId] = React.useState("");
  const [pendingPayment, setPendingPayment] = React.useState<CreatePaymentReceivedPayload | null>(
    null
  );
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);
  const [amountError, setAmountError] = React.useState<string | null>(null);
  const [invoices, setInvoices] = React.useState<InvoiceWithDerived[]>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [invoiceId, setInvoiceId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(
    remainingBalance != null ? formatMoneyInput(remainingBalance) : ""
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
  const appliedInvoiceAmountRef = React.useRef("");

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
    appliedInvoiceAmountRef.current = "";
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

  const restorePendingPayment = React.useCallback((userId: string, id: string) => {
    const pending = getArPaymentIntent(localStorage, userId, id);
    setPendingPayment(pending);
    if (pending) {
      preserveUploadedAttachmentsRef.current = true;
      setAmount(formatMoneyInput(pending.amount));
      setPaymentDate(pending.payment_date);
      setPaymentMethod(pending.payment_method);
      setDepositAccount(pending.deposit_account ?? "");
      setNotes(pending.notes ?? "");
    }
    return pending;
  }, []);

  const [contextLoading, setContextLoading] = React.useState(true);
  const [contextError, setContextError] = React.useState<string | null>(null);
  const [contextRetry, setContextRetry] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    setInvoices([]);
    setProjects([]);
    setInvoiceId("");
    setProjectId("");
    setCustomerName("");
    Promise.all([getInvoicesWithDerived(), getProjects(), supabase?.auth.getUser()])
      .then(([invList, projList, identity]) => {
        if (cancelled) return;
        if (identity?.error || !identity?.data.user)
          throw new Error("Payment session is unavailable.");
        const userId = identity.data.user.id;
        setActorId(userId);
        const pendingInvoiceId =
          preselectedInvoiceId ??
          invList.find((inv) => getArPaymentIntent(localStorage, userId, inv.id))?.id;
        const pending = pendingInvoiceId ? restorePendingPayment(userId, pendingInvoiceId) : null;
        if (!pending) setPendingPayment(null);
        const targetInvoiceId = preselectedInvoiceId ?? pending?.invoice_id;
        const receivable = invList.filter(
          (inv) => canReceivePayment(inv) || inv.id === pending?.invoice_id
        );
        setInvoices(receivable);
        setProjects(projList);
        if (targetInvoiceId) {
          const inv = receivable.find((i) => i.id === targetInvoiceId);
          if (!inv) throw new Error("The selected invoice is no longer available for payment.");
          if (inv) {
            setInvoiceId(inv.id);
            setProjectId(inv.projectId);
            setCustomerName(inv.clientName);
            setAmount(
              formatMoneyInput(remainingBalance != null ? remainingBalance : inv.balanceDue)
            );
            setNotes((prev) => nextPaymentMemo(prev, inv.invoiceNo));
          }
        } else {
          setInvoiceId("");
          setProjectId("");
          setCustomerName("");
          setAmount(remainingBalance != null ? formatMoneyInput(remainingBalance) : "");
          setNotes("");
        }
        if (pending) restorePendingPayment(userId, pending.invoice_id);
      })
      .catch((e) => {
        if (!cancelled) setContextError(e instanceof Error ? e.message : "Please try again.");
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, preselectedInvoiceId, remainingBalance, contextRetry, supabase, restorePendingPayment]);

  React.useEffect(() => {
    if (!invoiceId || preselectedInvoiceId) return;
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    setProjectId(inv.projectId);
    setCustomerName(inv.clientName);
    if (appliedInvoiceAmountRef.current !== invoiceId) {
      appliedInvoiceAmountRef.current = invoiceId;
      if (actorId && getArPaymentIntent(localStorage, actorId, invoiceId)) return;
      setAmount(formatMoneyInput(inv.balanceDue));
      setNotes((prev) => nextPaymentMemo(prev, inv.invoiceNo));
    }
  }, [actorId, invoiceId, invoices, preselectedInvoiceId]);

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
      if (pendingPayment || submissionInFlight.current) return;
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
    [selectedInvoiceId, supabase, toast, uploadDraft, pendingPayment]
  );

  const handleRemoveAttachment = React.useCallback(
    (draft: PaymentAttachmentDraft) => {
      if (pendingPayment || submissionInFlight.current) return;
      setAttachmentDrafts((prev) => prev.filter((item) => item.id !== draft.id));
      if (draft.localPreviewUrl) URL.revokeObjectURL(draft.localPreviewUrl);
      if (draft.status === "uploaded" && draft.file_url && supabase) {
        void removeUploadedPaymentAttachment(supabase, draft.file_url);
      }
    },
    [supabase, pendingPayment]
  );

  const handleRetryAttachment = React.useCallback(
    (draft: PaymentAttachmentDraft) => {
      if (!draft.sourceFile || !selectedInvoiceId || pendingPayment || submissionInFlight.current)
        return;
      void uploadDraft(draft.id, draft.sourceFile, selectedInvoiceId);
    },
    [selectedInvoiceId, uploadDraft, pendingPayment]
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
  const disableSubmit =
    saving ||
    contextLoading ||
    !!contextError ||
    !invoices.some((inv) => inv.id === (preselectedInvoiceId ?? invoiceId)) ||
    hasUploadingAttachments ||
    hasFailedAttachments;

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>
  ) => {
    e?.preventDefault();
    if (disableSubmit || submissionInFlight.current) return;
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
    const parsedAmount = parseDecimalDraft(amount);
    const num = roundMoney(parsedAmount);
    const selectedInvoice = invoices.find((inv) => inv.id === invId);
    const balanceCap = roundMoney(
      remainingBalance != null ? remainingBalance : (selectedInvoice?.balanceDue ?? 0)
    );
    if (!Number.isFinite(parsedAmount) || num <= 0) {
      setAmountError("Enter an amount greater than 0.");
      return;
    }
    if (moneyToCents(num) > moneyToCents(balanceCap)) {
      setAmountError(`Amount cannot exceed the balance of ${formatCurrency(balanceCap)}.`);
      return;
    }
    setAmountError(null);
    submissionInFlight.current = true;
    setSaving(true);
    setSubmissionError(null);
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
      const payloadWithoutKey: Omit<CreatePaymentReceivedPayload, "idempotency_key"> = {
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
      if (!actorId) throw new Error("Payment session is unavailable.");
      const existingPending = pendingPayment ?? getArPaymentIntent(localStorage, actorId, invId);
      const payload =
        existingPending ?? beginArPaymentIntent(localStorage, actorId, payloadWithoutKey);
      setPendingPayment(payload);
      preserveUploadedAttachmentsRef.current = true;
      const result = await createPaymentReceivedAction(payload);
      if (!result.ok) {
        if (result.outcome === "rejected" && !existingPending) {
          clearArPaymentIntent(localStorage, actorId, invId, payload.idempotency_key);
          setPendingPayment(null);
          preserveUploadedAttachmentsRef.current = false;
        }
        throw new Error(result.error);
      }
      clearArPaymentIntent(localStorage, actorId, invId, payload.idempotency_key);
      setPendingPayment(null);
      preserveUploadedAttachmentsRef.current = true;
      onSuccess({ paymentId: result.paymentId, invoiceId: invId, projectId: projectId || null });
      onOpenChange(false);
      toast({ title: "Payment recorded", variant: "success" });
      setAmount("");
      setNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment outcome is unavailable.";
      if (/exceeds remaining|invalid payment request|greater than 0/i.test(message)) {
        setAmountError(message);
      }
      setSubmissionError(message);
      toast({
        title: "Failed to record payment",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      submissionInFlight.current = false;
      setSaving(false);
    }
  };

  const onDragEnter = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!selectedInvoiceId || saving || pendingPayment || submissionInFlight.current) return;
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submissionInFlight.current) onOpenChange(next);
      }}
    >
      <DialogContent data-revenue-ar-v2 className="text-[var(--hh-text)]">
        <DialogHeader className="border-b border-[var(--hh-line)] pb-3">
          <DialogTitle className="text-title-card text-[var(--hh-ink)]">
            Receive Payment
          </DialogTitle>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="space-y-4 pt-3">
          {contextLoading && <p role="status">Loading payment context…</p>}
          {contextError && (
            <div role="alert">
              <p>Unable to load payment context. {contextError}</p>
              <Button type="button" variant="outline" onClick={() => setContextRetry((n) => n + 1)}>
                Retry
              </Button>
            </div>
          )}
          {submissionError && <p role="alert">{submissionError}</p>}
          {pendingPayment && (
            <p role="status">
              A previous payment request is awaiting confirmation. Receive Payment retries that same
              request.
            </p>
          )}
          <div className="space-y-2">
            <label className={paymentFieldLabelClass}>Invoice</label>
            <select
              value={invoiceId}
              onChange={(e) => {
                try {
                  setInvoiceId(e.target.value);
                  restorePendingPayment(actorId, e.target.value);
                } catch (error) {
                  setContextError(
                    error instanceof Error ? error.message : "Previous payment is unavailable."
                  );
                }
              }}
              className={paymentSelectClass}
              required
              disabled={
                saving || !!pendingPayment || !!preselectedInvoiceId || attachmentDrafts.length > 0
              }
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
            <label className={paymentFieldLabelClass}>Project</label>
            <Input
              value={projectId ? (projectNameById.get(projectId) ?? "") : ""}
              readOnly
              className={cn(paymentFieldClass, "bg-[var(--hh-surface-sunken)]")}
            />
          </div>
          <div className="space-y-2">
            <label className={paymentFieldLabelClass}>Customer</label>
            <Input
              value={customerName}
              readOnly
              className={paymentFieldClass}
              placeholder="Customer name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className={paymentFieldLabelClass}>Payment Date</label>
              <FinanceDatePicker
                value={paymentDate}
                onChange={(date) => {
                  if (!saving && !pendingPayment) setPaymentDate(date);
                }}
                size="md"
              />
            </div>
            <div className="space-y-2">
              <label className={paymentFieldLabelClass}>Amount Received</label>
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={saving || !!pendingPayment}
                onChange={(e) => {
                  setAmount((current) => nextDecimalDraft(current, e.target.value));
                  setAmountError(null);
                }}
                onBlur={() => {
                  const trimmed = amount.trim();
                  if (trimmed === "" || trimmed === ".") return;
                  setAmount(formatMoneyInput(parseDecimalDraft(trimmed)));
                }}
                placeholder="0.00"
                aria-invalid={amountError ? true : undefined}
                aria-describedby={amountError ? "receive-payment-amount-error" : undefined}
                className={cn(paymentFieldClass, "tabular-nums")}
              />
              {amountError ? (
                <p
                  id="receive-payment-amount-error"
                  role="alert"
                  className="text-hh-metadata font-medium text-[var(--hh-danger)]"
                >
                  {amountError}
                </p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <label className={paymentFieldLabelClass}>Payment Method</label>
            <select
              value={paymentMethod}
              disabled={saving || !!pendingPayment}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={paymentSelectClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={paymentFieldLabelClass}>Deposit Account</label>
            <Input
              value={depositAccount}
              disabled={saving || !!pendingPayment}
              onChange={(e) => setDepositAccount(e.target.value)}
              placeholder="e.g. Operating Account"
              className={paymentFieldClass}
            />
          </div>
          <div className="space-y-2">
            <label className={paymentFieldLabelClass}>Notes</label>
            <Input
              value={notes}
              disabled={saving || !!pendingPayment}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={paymentFieldClass}
            />
          </div>

          <div className="space-y-2">
            <label className={paymentFieldLabelClass}>Attachments</label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              disabled={saving || !!pendingPayment || !selectedInvoiceId}
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
              disabled={saving || !!pendingPayment || !selectedInvoiceId}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={saving || !!pendingPayment || !selectedInvoiceId}
                onClick={() => cameraInputRef.current?.click()}
                className="group flex min-h-[58px] items-center gap-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-left transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] disabled:pointer-events-none disabled:opacity-45"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--hh-chip)]">
                  <Camera className="h-[18px] w-[18px] text-[var(--hh-ink)]" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-hh-table-cell font-medium text-[var(--hh-ink)]">
                    Take photo
                  </span>
                  <span className="block truncate text-hh-status text-[var(--hh-muted)]">
                    Camera upload
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--hh-muted)]/70"
                  strokeWidth={1.5}
                />
              </button>
              <button
                type="button"
                disabled={saving || !!pendingPayment || !selectedInvoiceId}
                onClick={() => uploadInputRef.current?.click()}
                className="group flex min-h-[58px] items-center gap-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-left transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] disabled:pointer-events-none disabled:opacity-45"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--hh-chip)]">
                  <Upload className="h-[18px] w-[18px] text-[var(--hh-ink)]" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-hh-table-cell font-medium text-[var(--hh-ink)]">
                    Upload files
                  </span>
                  <span className="block truncate text-hh-status text-[var(--hh-muted)]">
                    Images or PDFs
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--hh-muted)]/70"
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
                "rounded-hh-standard border border-dashed px-3 py-3 transition-[border-color,background-color,box-shadow]",
                "border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)]",
                selectedInvoiceId && !saving && "hover:bg-[var(--hh-surface-sunken)]",
                dragActive && "border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)]",
                (!selectedInvoiceId || saving) && "opacity-55"
              )}
            >
              <p className="text-center text-hh-metadata font-medium text-[var(--hh-ink)]">
                Drop payment attachments here
              </p>
              <p className="mt-0.5 text-center text-hh-status text-[var(--hh-muted)]">
                Photos or PDFs
              </p>
            </div>
            {attachmentDrafts.length > 0 ? (
              <div className="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-0.5">
                {attachmentDrafts.map((draft) => (
                  <PaymentAttachmentRow
                    key={draft.id}
                    attachment={draft}
                    disabled={saving || !!pendingPayment}
                    onPreview={() => handlePreviewAttachment(draft)}
                    onRetry={() => handleRetryAttachment(draft)}
                    onRemove={() => handleRemoveAttachment(draft)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--hh-line)] pt-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11"
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
