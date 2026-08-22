"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, FileText, Plus, Upload, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addExpenseAttachment,
  deleteExpenseAttachment,
  type Expense,
  type ExpenseAttachment,
} from "@/lib/data";
import {
  getExpenseDisplayAttachments,
  isExpenseReceiptUrlAttachmentId,
} from "@/lib/expense-receipt-items";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";
import {
  buildExpenseAttachmentForUpload,
  storageFileTypeForExpenseUpload,
} from "@/lib/expense-attachment-upload-helpers";

function attachmentIsImage(att: ExpenseAttachment): boolean {
  if (att.mimeType.startsWith("image/")) return true;
  return (
    /\.(jpe?g|png|gif|webp)$/i.test(att.fileName) || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(att.url)
  );
}

const CARD_FRAME =
  "relative flex h-24 w-24 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] shadow-none transition-[box-shadow,border-color,background-color]";

export type ExpenseEditAttachmentsSectionProps = {
  expense: Expense;
  supabase: SupabaseClient | null;
  attachments: ExpenseAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<ExpenseAttachment[]>>;
  thumbById: Record<string, string | null>;
  disabled?: boolean;
  onExpenseUpdated?: (expense: Expense) => void;
  onPreviewAttachment: (att: ExpenseAttachment) => void | Promise<void>;
  showDelete?: boolean;
};

export function ExpenseEditAttachmentsSection({
  expense,
  supabase,
  attachments,
  setAttachments,
  thumbById,
  disabled = false,
  onExpenseUpdated,
  onPreviewAttachment,
  showDelete = true,
}: ExpenseEditAttachmentsSectionProps) {
  const { toast } = useToast();
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [failedUploads, setFailedUploads] = React.useState<File[]>([]);
  const [uploadFeedback, setUploadFeedback] = React.useState<{
    tone: "error" | "success";
    title: string;
    detail?: string;
  } | null>(null);
  const dragDepthRef = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const applyDedupedAttachments = React.useCallback(
    (next: Expense | null | undefined) => {
      if (!next) return;
      setAttachments(getExpenseDisplayAttachments(next));
    },
    [setAttachments]
  );

  const openFilePicker = React.useCallback(() => {
    if (!supabase || disabled || uploadBusy) return;
    fileInputRef.current?.click();
  }, [disabled, supabase, uploadBusy]);

  const handleUploadFiles = React.useCallback(
    async (files: FileList | File[] | null) => {
      if (!files?.length) return;
      const list = Array.from(files);
      if (!supabase) {
        setUploadFeedback({
          tone: "error",
          title: "Upload unavailable",
          detail: "Receipt upload is not configured for this environment.",
        });
        return;
      }
      const seenBatch = new Set<string>();
      const failures: File[] = [];
      let uploaded = 0;
      let firstFailure = "";
      setUploadFeedback(null);
      setFailedUploads([]);
      setUploadBusy(true);
      try {
        for (let i = 0; i < list.length; i++) {
          const file = list[i]!;
          const batchKey = `${file.name}:${file.size}`;
          if (seenBatch.has(batchKey)) continue;
          seenBatch.add(batchKey);

          const ft = storageFileTypeForExpenseUpload(file);
          if (!ft) {
            firstFailure ||= `${file.name} is not an image or PDF.`;
            continue;
          }
          try {
            const uploadData = new FormData();
            uploadData.set("file", file);
            const uploadResponse = await fetch("/api/quick-expense/upload-attachment", {
              method: "POST",
              body: uploadData,
              credentials: "same-origin",
            });
            const uploadBody = (await uploadResponse.json().catch(() => ({}))) as {
              ok?: boolean;
              path?: string;
            };
            if (!uploadResponse.ok || !uploadBody.ok || !uploadBody.path) {
              throw new Error("Attachment upload failed.");
            }
            const filePath = uploadBody.path;
            const att = buildExpenseAttachmentForUpload(file, filePath);
            const next = await addExpenseAttachment(expense.id, att);
            if (!next) throw new Error("Attachment could not be linked to this expense.");
            applyDedupedAttachments(next);
            onExpenseUpdated?.(next);
            uploaded += 1;
          } catch (error) {
            failures.push(file);
            firstFailure ||= error instanceof Error ? error.message : "Attachment upload failed.";
          }
        }
      } finally {
        setUploadBusy(false);
      }

      setFailedUploads(failures);
      if (failures.length > 0 || firstFailure) {
        setUploadFeedback({
          tone: "error",
          title:
            uploaded > 0
              ? `${uploaded} added · ${failures.length || 1} needs attention`
              : "Receipt upload failed",
          detail:
            firstFailure || "The failed file remains available to retry without selecting again.",
        });
      } else if (uploaded > 0) {
        setUploadFeedback({
          tone: "success",
          title: uploaded === 1 ? "Receipt attached" : `${uploaded} receipts attached`,
          detail: "The files are now linked to this expense.",
        });
      }
    },
    [applyDedupedAttachments, expense.id, onExpenseUpdated, supabase]
  );

  const handleDeleteAttachment = React.useCallback(
    async (e: React.MouseEvent, att: ExpenseAttachment) => {
      e.preventDefault();
      e.stopPropagation();
      if (isExpenseReceiptUrlAttachmentId(att.id)) return;
      if (!window.confirm("Delete this attachment?")) return;
      try {
        const next = await deleteExpenseAttachment(expense.id, att.id);
        if (next) {
          applyDedupedAttachments(next);
          onExpenseUpdated?.(next);
        }
      } catch (err) {
        toast({
          title: "Delete failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "error",
        });
      }
    },
    [applyDedupedAttachments, expense.id, onExpenseUpdated, toast]
  );

  const busy = Boolean(disabled || uploadBusy);

  const onDragEnter = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
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
  };

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    void handleUploadFiles(ev.dataTransfer.files);
  };

  const showEmptyIdle = attachments.length === 0 && !uploadBusy;

  return (
    <div className="space-y-1">
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept="image/*,application/pdf,.pdf"
        multiple
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          void handleUploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="sr-only"
        accept="image/*"
        capture="environment"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          void handleUploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        role="group"
        aria-label="Attachments"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "transition-[border-color,box-shadow,background-color,padding]",
          dragActive && "rounded-2xl border border-dashed border-primary/40 bg-primary/[0.05] p-2",
          !dragActive && "border border-transparent",
          !dragActive && (showEmptyIdle ? "p-0" : "p-1"),
          busy && "pointer-events-none opacity-60"
        )}
      >
        {!supabase ? (
          <p className="text-xs text-[var(--hh-text-secondary)]">
            Configure Supabase to add attachments.
          </p>
        ) : showEmptyIdle ? (
          <div className="grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
              className={cn(
                "group flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-3 text-center outline-none sm:hidden",
                "transition-[border-color,background-color] hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l2-operational-surface)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] disabled:opacity-50"
              )}
            >
              <Camera className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
              <span className="text-xs font-medium text-[var(--hh-text-primary)]">Take photo</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openFilePicker}
              className={cn(
                "group flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-3 text-center outline-none",
                "transition-[border-color,background-color] hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l2-operational-surface)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] disabled:opacity-50 sm:min-h-24"
              )}
            >
              <Upload className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
              <span className="text-xs font-medium text-[var(--hh-text-primary)]">Upload file</span>
              <span className="hidden text-hh-status text-[var(--hh-text-secondary)] sm:block">
                Drop, browse, or select a photo or PDF
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            {attachments.map((att) => {
              const thumb = thumbById[att.id];
              const isPdf = !attachmentIsImage(att);
              const canDelete = showDelete && !isExpenseReceiptUrlAttachmentId(att.id);
              return (
                <div
                  key={att.id}
                  data-testid="edit-expense-existing-attachment"
                  className={cn(CARD_FRAME, "group/card")}
                >
                  <button
                    type="button"
                    className="flex h-full w-full flex-col items-stretch justify-stretch outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={() => void onPreviewAttachment(att)}
                    aria-label={`Open ${att.fileName}`}
                  >
                    {isPdf ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1.5 pb-2 pt-3">
                        <FileText
                          className="h-7 w-7 shrink-0 text-[var(--hh-text-secondary)]"
                          strokeWidth={1.5}
                        />
                        <span className="line-clamp-2 w-full text-center text-hh-status leading-tight text-[var(--hh-text-secondary)]">
                          {att.fileName}
                        </span>
                      </div>
                    ) : thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-1 items-center justify-center bg-[var(--hh-l2-operational-surface)]">
                        <Skeleton className="h-16 w-16 rounded-md bg-[var(--hh-l3-hover)]" />
                      </div>
                    )}
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      className={cn(
                        "absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)] shadow-sm backdrop-blur-sm transition-opacity hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]",
                        "opacity-100 md:opacity-0 md:group-hover/card:opacity-100"
                      )}
                      aria-label="Remove attachment"
                      disabled={disabled}
                      onClick={(e) => void handleDeleteAttachment(e, att)}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>
              );
            })}

            {uploadBusy ? (
              <div className={cn(CARD_FRAME, "items-center justify-center")}>
                <Skeleton className="h-14 w-14 rounded-md bg-[var(--hh-l2-operational-surface)]" />
              </div>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={openFilePicker}
              aria-label="Add attachment"
              className={cn(
                CARD_FRAME,
                "cursor-pointer items-center justify-center border border-dashed border-[var(--hh-border-strong)] text-[var(--hh-text-secondary)] shadow-none transition-[border-color,box-shadow,background-color] duration-200 ease-out",
                "hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-selected)] hover:text-[var(--hh-text-primary)] active:bg-[var(--hh-l3-hover)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]"
              )}
            >
              <Plus className="h-7 w-7" strokeWidth={1.5} />
              <span className="mt-0.5 text-hh-status font-medium tracking-normal">Add</span>
            </button>
          </div>
        )}
      </div>
      {uploadFeedback ? (
        <div
          data-attachment-upload-feedback
          role={uploadFeedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "flex max-w-md items-start justify-between gap-3 rounded-lg border px-3 py-2.5",
            uploadFeedback.tone === "error"
              ? "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)] dark:text-[var(--hh-danger)]"
              : "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)] dark:text-[var(--hh-success)]"
          )}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold">{uploadFeedback.title}</p>
            {uploadFeedback.detail ? (
              <p className="mt-0.5 text-hh-status leading-snug opacity-85">
                {uploadFeedback.detail}
              </p>
            ) : null}
          </div>
          {failedUploads.length > 0 ? (
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-md px-2 text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]"
              disabled={busy}
              onClick={() => void handleUploadFiles(failedUploads)}
            >
              Retry upload
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
