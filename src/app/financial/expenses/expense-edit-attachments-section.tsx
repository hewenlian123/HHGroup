"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FileText, Plus, Upload, X } from "lucide-react";
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
  "relative flex h-24 w-24 shrink-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-background shadow-sm transition-[box-shadow,border-color]";

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
  const dragDepthRef = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
        toast({
          title: "Upload failed",
          description: "Supabase is not configured.",
          variant: "error",
        });
        return;
      }
      const seenBatch = new Set<string>();
      setUploadBusy(true);
      try {
        for (let i = 0; i < list.length; i++) {
          const file = list[i]!;
          const batchKey = `${file.name}:${file.size}`;
          if (seenBatch.has(batchKey)) continue;
          seenBatch.add(batchKey);

          const ft = storageFileTypeForExpenseUpload(file);
          if (!ft) {
            toast({
              title: "Skipped file",
              description: `${file.name} is not an image or PDF.`,
              variant: "error",
            });
            continue;
          }
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
          const filePath = `expenses/${expense.id}/${Date.now()}-${i}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("expense-attachments")
            .upload(filePath, file, {
              contentType: file.type || undefined,
              upsert: false,
            });
          if (upErr) throw upErr;
          const att = buildExpenseAttachmentForUpload(file, filePath);
          const next = await addExpenseAttachment(expense.id, att);
          if (next) {
            applyDedupedAttachments(next);
            onExpenseUpdated?.(next);
          }
        }
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "error",
        });
      } finally {
        setUploadBusy(false);
      }
    },
    [applyDedupedAttachments, expense.id, onExpenseUpdated, supabase, toast]
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
          <p className="text-xs text-muted-foreground">Configure Supabase to add attachments.</p>
        ) : showEmptyIdle ? (
          <button
            type="button"
            disabled={busy}
            onClick={openFilePicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFilePicker();
              }
            }}
            className={cn(
              "group flex w-full max-w-md cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-muted bg-muted/25 px-5 py-5 text-center outline-none ring-offset-background",
              "transition-[border-color,box-shadow,transform,background-color] duration-200 ease-out",
              "hover:border-foreground/20 hover:bg-muted/40 hover:shadow-sm",
              "active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <Upload
              className="size-[18px] shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
              strokeWidth={2}
              aria-hidden
            />
            <div className="flex flex-col gap-0.5 pt-0.5">
              <span className="text-sm font-medium tracking-tight text-foreground">
                Add receipt
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                Tap to upload or take a photo
              </span>
            </div>
          </button>
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
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <span className="line-clamp-2 w-full text-center text-[10px] leading-tight text-muted-foreground">
                          {att.fileName}
                        </span>
                      </div>
                    ) : thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-1 items-center justify-center bg-foreground/[0.03]">
                        <Skeleton className="h-16 w-16 rounded-md" />
                      </div>
                    )}
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      className={cn(
                        "absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity hover:bg-destructive/10 hover:text-destructive",
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
              <div className={cn(CARD_FRAME, "items-center justify-center bg-background")}>
                <Skeleton className="h-14 w-14 rounded-md" />
              </div>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={openFilePicker}
              aria-label="Add attachment"
              className={cn(
                CARD_FRAME,
                "cursor-pointer items-center justify-center border border-dashed border-muted bg-background text-muted-foreground shadow-none transition-[border-color,box-shadow,background-color] duration-200 ease-out",
                "hover:border-foreground/20 hover:bg-muted/30 hover:text-foreground hover:shadow-sm active:scale-[0.98]"
              )}
            >
              <Plus className="h-7 w-7" strokeWidth={1.5} />
              <span className="mt-0.5 text-[10px] font-medium tracking-wide">Add</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
