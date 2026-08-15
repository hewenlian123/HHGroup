"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, FileText, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  hhNeoFocusRevealDialog,
  hhNeoFocusRevealMobileSheet,
  hhNeoFocusRevealOverlay,
} from "@/lib/motion-system";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase";
import { createInboxDraftFromReceiptFile } from "@/lib/expense-inbox-draft-upload-browser";
import { notifyReceiptQueueChanged } from "@/lib/receipt-queue";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type PendingItem = { id: string; file: File };

type UploadFeedback = {
  tone: "error" | "success" | "neutral";
  title: string;
  detail?: string;
};

type StatusPhase = "ready" | "preparing" | "creating" | "added" | "failed";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function pendingKey(file: File): string {
  return `${file.name}:${file.size}`;
}

function appendPendingDeduped(prev: PendingItem[], files: File[]): PendingItem[] {
  const seen = new Set(prev.map((p) => pendingKey(p.file)));
  const next = [...prev];
  for (const file of files) {
    if (file.size <= 0) continue;
    const k = pendingKey(file);
    if (seen.has(k)) continue;
    seen.add(k);
    next.push({ id: crypto.randomUUID(), file });
  }
  return next;
}

function resolveStatusPhase(
  captureUploading: boolean,
  receiptImagePreparing: boolean,
  addedToQueueHint: boolean,
  uploadFailed: boolean
): StatusPhase {
  if (addedToQueueHint) return "added";
  if (uploadFailed && !captureUploading) return "failed";
  if (captureUploading && receiptImagePreparing) return "preparing";
  if (captureUploading) return "creating";
  return "ready";
}

const STATUS_COPY: Record<StatusPhase, string> = {
  ready: "Ready",
  preparing: "Preparing...",
  creating: "Creating drafts...",
  added: "Added to Inbox",
  failed: "Upload failed",
};

function PendingReceiptRow({
  item,
  disabled,
  onRemove,
}: {
  item: PendingItem;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    const f = item.file;
    if (f.type.startsWith("image/")) {
      const u = URL.createObjectURL(f);
      setPreview(u);
      return () => {
        URL.revokeObjectURL(u);
      };
    }
    setPreview(null);
    return undefined;
  }, [item.file, item.id]);

  return (
    <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-black/[0.06] bg-muted/[0.2] px-3 py-2.5 dark:border-white/[0.08]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob preview for local file selection
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{item.file.name}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatBytes(item.file.size)}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className={cn(
          "shrink-0 rounded-md px-2 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        )}
      >
        Remove
      </button>
    </div>
  );
}

export function UploadReceiptsQueueModal({ open, onOpenChange, onSuccess }: Props) {
  const router = useRouter();
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [pendingItems, setPendingItems] = React.useState<PendingItem[]>([]);
  const [captureUploading, setCaptureUploading] = React.useState(false);
  const [receiptImagePreparing, setReceiptImagePreparing] = React.useState(false);
  const [addedToQueueHint, setAddedToQueueHint] = React.useState(false);
  const [uploadFailed, setUploadFailed] = React.useState(false);
  const [uploadFeedback, setUploadFeedback] = React.useState<UploadFeedback | null>(null);
  const addedHintTimerRef = React.useRef<number | null>(null);
  const createdReferenceNosRef = React.useRef<string[]>([]);
  /** Ignore outside closes briefly after open — same pointer/touch can otherwise dismiss on iOS (Radix). */
  const suppressOutsideUntilRef = React.useRef(0);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const setCameraInputNode = React.useCallback((node: HTMLInputElement | null) => {
    cameraInputRef.current = node;
  }, []);

  const setUploadInputNode = React.useCallback((node: HTMLInputElement | null) => {
    uploadInputRef.current = node;
  }, []);

  const flashAddedToQueueHint = React.useCallback(() => {
    if (addedHintTimerRef.current) {
      window.clearTimeout(addedHintTimerRef.current);
      addedHintTimerRef.current = null;
    }
    setAddedToQueueHint(true);
    addedHintTimerRef.current = window.setTimeout(() => {
      setAddedToQueueHint(false);
      addedHintTimerRef.current = null;
    }, 1000);
  }, []);

  const addPendingFiles = React.useCallback((files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.size > 0);
    if (!list.length) return;
    setUploadFailed(false);
    setUploadFeedback(null);
    setPendingItems((prev) => appendPendingDeduped(prev, list));
  }, []);

  React.useEffect(() => {
    if (open) {
      suppressOutsideUntilRef.current = Date.now() + 400;
    } else {
      setPendingItems([]);
      setAddedToQueueHint(false);
      setUploadFailed(false);
      setUploadFeedback(null);
      createdReferenceNosRef.current = [];
      if (addedHintTimerRef.current) {
        window.clearTimeout(addedHintTimerRef.current);
        addedHintTimerRef.current = null;
      }
    }
  }, [open]);

  React.useEffect(
    () => () => {
      if (addedHintTimerRef.current) window.clearTimeout(addedHintTimerRef.current);
    },
    []
  );

  const performUpload = React.useCallback(
    async (list: File[]) => {
      if (!list.length || !supabase) {
        if (!supabase) {
          setUploadFailed(true);
          setUploadFeedback({
            tone: "error",
            title: "Storage unavailable",
            detail: "Receipt upload is not configured for this environment.",
          });
        }
        return;
      }

      setUploadFailed(false);
      setUploadFeedback(null);
      setCaptureUploading(true);
      let ok = 0;
      let fail = 0;
      let dup = 0;
      const createdReferenceNos: string[] = [];

      let firstFailDetail: string | undefined;
      try {
        setReceiptImagePreparing(true);
        try {
          const outcomes = await Promise.all(
            list.map(async (file) => {
              try {
                const r = await createInboxDraftFromReceiptFile(supabase, file);
                if (!r.ok) return { file, ok: false as const, detail: r.message };
                if (r.duplicate)
                  return {
                    file,
                    ok: true as const,
                    duplicate: true,
                    referenceNo: r.referenceNo,
                  };
                notifyReceiptQueueChanged();
                return {
                  file,
                  ok: true as const,
                  duplicate: false,
                  referenceNo: r.referenceNo,
                };
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Could not create draft expense";
                return { file, ok: false as const, detail: msg };
              }
            })
          );

          const failedFiles: File[] = [];
          for (const o of outcomes) {
            if (o.ok) {
              if (o.duplicate) dup += 1;
              else {
                ok += 1;
                createdReferenceNos.push(o.referenceNo);
              }
            } else {
              fail += 1;
              failedFiles.push(o.file);
              if (!firstFailDetail && "detail" in o) firstFailDetail = o.detail;
            }
          }

          if (createdReferenceNos.length > 0) {
            createdReferenceNosRef.current = Array.from(
              new Set([...createdReferenceNosRef.current, ...createdReferenceNos])
            );
          }

          if (fail > 0) {
            setPendingItems(failedFiles.map((file) => ({ id: crypto.randomUUID(), file })));
          } else {
            setPendingItems([]);
          }
        } finally {
          setReceiptImagePreparing(false);
        }

        if (ok > 0 && fail === 0) {
          setUploadFailed(false);
          flashAddedToQueueHint();
          setUploadFeedback({
            tone: "success",
            title: ok === 1 ? "1 receipt added to Inbox" : `${ok} receipts added to Inbox`,
            detail: "Opening the new drafts for review.",
          });
          if (createdReferenceNosRef.current.length > 0) {
            const sp = new URLSearchParams();
            sp.set("highlight", createdReferenceNosRef.current.join(","));
            router.push(`/financial/inbox?${sp.toString()}`);
            onOpenChange(false);
          }
        }

        if (fail > 0) {
          setUploadFailed(true);
          setUploadFeedback({
            tone: "error",
            title:
              ok > 0
                ? `${ok} added · ${fail} ${fail === 1 ? "file needs" : "files need"} retry`
                : "Upload could not complete",
            detail:
              firstFailDetail ||
              "Only the files that failed remain selected. Retry when the connection is ready.",
          });
        } else if (dup > 0 && ok === 0) {
          setUploadFeedback({
            tone: "neutral",
            title: dup === 1 ? "Receipt already in Inbox" : `${dup} receipts already in Inbox`,
            detail: "No duplicate drafts were created.",
          });
        }
      } finally {
        setCaptureUploading(false);
        onSuccess();
      }
    },
    [supabase, onSuccess, flashAddedToQueueHint, router, onOpenChange]
  );

  const handleConfirmUpload = React.useCallback(() => {
    const files = pendingItems.map((p) => p.file);
    void performUpload(files);
  }, [pendingItems, performUpload]);

  const handleDialogOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleTakePhotoClick = React.useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const handleUploadFilesClick = React.useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const busy = captureUploading;
  const statusPhase = resolveStatusPhase(
    captureUploading,
    receiptImagePreparing,
    addedToQueueHint,
    uploadFailed
  );

  const handleCancelSelection = React.useCallback(() => {
    if (busy) return;
    setPendingItems([]);
    setUploadFailed(false);
    setUploadFeedback(null);
  }, [busy]);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogPortal>
        <DialogOverlay
          className={cn(
            "upload-receipt-mobile-overlay !z-[100] max-md:!z-[9998]",
            hhNeoFocusRevealOverlay
          )}
        />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) {
              e.preventDefault();
              return;
            }
            if (Date.now() < suppressOutsideUntilRef.current) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) {
              e.preventDefault();
              return;
            }
            if (Date.now() < suppressOutsideUntilRef.current) e.preventDefault();
          }}
          className={cn(
            "expenses-ui-dialog upload-receipt-mobile-dialog fixed !z-[101] flex min-h-0 w-full flex-col overflow-hidden overflow-x-hidden border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[var(--eo-shadow-overlay)] outline-none",
            "p-0 md:rounded-[14px] md:p-6",
            "max-md:fixed max-md:inset-x-2 max-md:bottom-0 max-md:top-auto max-md:!z-[9999] max-md:max-h-[calc(100dvh-0.75rem)] max-md:w-auto max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-[14px] max-md:border-b-0",
            "max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pl-[max(1rem,env(safe-area-inset-left))] max-md:pr-[max(1rem,env(safe-area-inset-right))]",
            "md:max-h-[min(92vh,900px)]",
            "md:left-1/2 md:top-1/2 md:max-w-[460px] md:-translate-x-1/2 md:-translate-y-1/2",
            hhNeoFocusRevealDialog,
            hhNeoFocusRevealMobileSheet
          )}
          data-expense-component-surface="receipt-upload"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border/60 bg-background pb-4 max-md:gap-2 max-md:pb-3">
              <div className="min-w-0 flex-1 space-y-2 text-left">
                <DialogTitle className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                  Upload receipt
                </DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
                  Photos and PDFs are saved to Inbox as drafts. Review and approve before they count
                  as expenses.
                </DialogDescription>
              </div>
              <DialogPrimitive.Close
                type="button"
                disabled={busy}
                data-testid="upload-receipt-modal-close"
                className={cn(
                  "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40",
                  "touch-manipulation"
                )}
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </DialogPrimitive.Close>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pt-6 max-md:pt-4">
              <input
                ref={setCameraInputNode}
                data-testid="upload-receipt-camera-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                disabled={busy}
                onChange={(e) => {
                  addPendingFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={setUploadInputNode}
                data-testid="upload-receipt-files-input"
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                tabIndex={-1}
                disabled={busy}
                onChange={(e) => {
                  addPendingFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {!supabase ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Configure Supabase to upload.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="upload-receipt-take-photo"
                      onClick={handleTakePhotoClick}
                      className={cn(
                        "group flex min-h-[76px] w-full items-center gap-4 rounded-[20px] border border-black/[0.07] bg-background px-4 py-4 text-left transition-[background-color,border-color,opacity] duration-120 disabled:pointer-events-none disabled:opacity-45 dark:border-white/[0.09]",
                        "hover:bg-muted/35 hover:border-black/[0.1] dark:hover:border-white/[0.12]",
                        "touch-manipulation"
                      )}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted/55 dark:bg-muted/40">
                        <Camera className="h-5 w-5 text-foreground/80" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium tracking-[-0.01em] text-foreground">
                          Take Photo
                        </span>
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">
                          Scan one receipt
                        </span>
                      </span>
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-muted-foreground/70"
                        strokeWidth={1.5}
                      />
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      data-testid="upload-receipt-upload-files"
                      onClick={handleUploadFilesClick}
                      className={cn(
                        "group flex min-h-[76px] w-full items-center gap-4 rounded-[20px] border border-black/[0.07] bg-background px-4 py-4 text-left transition-[background-color,border-color,opacity] duration-120 disabled:pointer-events-none disabled:opacity-45 dark:border-white/[0.09]",
                        "hover:bg-muted/35 hover:border-black/[0.1] dark:hover:border-white/[0.12]",
                        "touch-manipulation"
                      )}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted/55 dark:bg-muted/40">
                        <Upload className="h-5 w-5 text-foreground/80" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium tracking-[-0.01em] text-foreground">
                          Upload Files
                        </span>
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">
                          Photos or PDFs · Multiple files
                        </span>
                      </span>
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-muted-foreground/70"
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>

                  <div
                    role="presentation"
                    aria-label="Drop receipts to add to selection"
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!busy) setDragOver(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = busy ? "none" : "copy";
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOver(false);
                      if (busy) return;
                      addPendingFiles(e.dataTransfer.files);
                    }}
                    className={cn(
                      "flex w-full flex-col items-center justify-center overflow-hidden rounded-[18px] border border-dashed px-4 transition-[border-color,background-color] duration-200",
                      "min-h-[72px] md:min-h-[96px]",
                      "border-black/[0.14] bg-muted/[0.35] dark:border-white/[0.12] dark:bg-muted/25",
                      !busy &&
                        "hover:border-black/[0.22] hover:bg-muted/45 dark:hover:border-white/[0.18]",
                      dragOver &&
                        !busy &&
                        "border-foreground/22 bg-muted/55 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:bg-muted/40",
                      busy && "pointer-events-none opacity-45"
                    )}
                  >
                    <div className="hidden w-full flex-col items-center justify-center gap-0.5 py-3 text-center md:flex">
                      <span className="text-[14px] font-medium tracking-[-0.01em] text-foreground/90">
                        Drop receipts here
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        Photos or PDFs · Multiple files supported
                      </span>
                    </div>
                    <p className="w-full px-1 py-2 text-center text-[13px] leading-snug text-foreground/85 md:hidden">
                      Drop or upload multiple receipts
                    </p>
                  </div>

                  {pendingItems.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        Selected receipts
                      </p>
                      <div className="flex max-h-[min(40vh,280px)] flex-col gap-2 overflow-y-auto pr-0.5">
                        {pendingItems.map((item) => (
                          <PendingReceiptRow
                            key={item.id}
                            item={item}
                            disabled={busy}
                            onRemove={() =>
                              setPendingItems((prev) => prev.filter((p) => p.id !== item.id))
                            }
                          />
                        ))}
                      </div>
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className="h-11 rounded-xl"
                          onClick={handleCancelSelection}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || pendingItems.length === 0}
                          className="h-11 rounded-xl"
                          onClick={handleConfirmUpload}
                        >
                          {uploadFailed ? "Retry failed" : "Confirm Upload"} ({pendingItems.length})
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3">
                    {uploadFeedback ? (
                      <div
                        data-upload-feedback
                        role={uploadFeedback.tone === "error" ? "alert" : "status"}
                        aria-live="polite"
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left",
                          uploadFeedback.tone === "error"
                            ? "border-rose-500/25 bg-rose-500/[0.07] text-rose-700 dark:text-rose-200"
                            : uploadFeedback.tone === "success"
                              ? "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-200"
                              : "border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-text-secondary)]"
                        )}
                      >
                        <p className="text-[13px] font-semibold text-current">
                          {uploadFeedback.title}
                        </p>
                        {uploadFeedback.detail ? (
                          <p className="mt-0.5 text-[12px] leading-snug opacity-85">
                            {uploadFeedback.detail}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div
                      role="status"
                      aria-live="polite"
                      className={cn(
                        "inline-flex w-fit max-w-full items-center rounded-full border border-black/[0.06] bg-muted/25 px-3 py-1.5 text-[12px] font-medium tracking-wide text-muted-foreground dark:border-white/[0.08] dark:bg-muted/20"
                      )}
                    >
                      {STATUS_COPY[statusPhase]}
                    </div>
                    <p className="text-[12px] leading-snug text-muted-foreground/90">
                      Drafts stay in Inbox until approved.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
