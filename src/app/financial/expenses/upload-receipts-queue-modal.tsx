"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase";
import { inferExpenseCategoryFromVendor } from "@/lib/receipt-infer-category";
import { processReceiptQueueUpload } from "@/lib/receipt-queue-process-upload";
import { insertReceiptQueueProcessing, notifyReceiptQueueChanged } from "@/lib/receipt-queue";
import { compressImageFileForReceiptUpload } from "@/lib/image-compress-browser";
import { Camera, Upload } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type CaptureSource = "camera" | "files" | "drop";

export function UploadReceiptsQueueModal({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const openRef = React.useRef(open);
  openRef.current = open;
  const [dragOver, setDragOver] = React.useState(false);
  const [captureUploading, setCaptureUploading] = React.useState(false);
  const [receiptImagePreparing, setReceiptImagePreparing] = React.useState(false);
  const [addedToQueueHint, setAddedToQueueHint] = React.useState(false);
  const addedHintTimerRef = React.useRef<number | null>(null);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const openRetryPicker = React.useCallback(() => {
    uploadInputRef.current?.click();
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

  React.useEffect(() => {
    if (!open) {
      setAddedToQueueHint(false);
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

  const enqueueFiles = React.useCallback(
    async (files: FileList | File[] | null, source: CaptureSource = "files") => {
      if (!files?.length || !supabase) {
        if (!supabase) toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      const list = Array.from(files).filter((f) => f.size > 0);
      if (!list.length) return;

      setCaptureUploading(true);
      let ok = 0;
      let fail = 0;
      let shouldReopenCamera = false;

      let firstFailDetail: string | undefined;
      try {
        setReceiptImagePreparing(true);
        let compressed: File[];
        try {
          compressed = await Promise.all(
            list.map((file) => compressImageFileForReceiptUpload(file))
          );
        } finally {
          setReceiptImagePreparing(false);
        }

        const outcomes = await Promise.all(
          compressed.map(async (prepared) => {
            let qid: string;
            try {
              qid = await insertReceiptQueueProcessing(supabase, prepared);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Enqueue failed";
              return { ok: false as const, detail: msg };
            }
            notifyReceiptQueueChanged();
            try {
              const { storageSaved } = await processReceiptQueueUpload(
                supabase,
                qid,
                prepared,
                inferExpenseCategoryFromVendor,
                { alreadyCompressed: true }
              );
              if (storageSaved) return { ok: true as const };
              return {
                ok: false as const,
                detail: "Could not save file to storage.",
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Processing failed";
              return { ok: false as const, detail: msg };
            } finally {
              notifyReceiptQueueChanged();
            }
          })
        );

        for (const o of outcomes) {
          if (o.ok) ok += 1;
          else {
            fail += 1;
            if (!firstFailDetail) firstFailDetail = o.detail;
          }
        }

        if (ok > 0) {
          flashAddedToQueueHint();
          toast({
            title: ok === 1 ? "✔ Receipt added to queue" : `✔ ${ok} receipts added`,
            variant: "success",
          });
        }
        if (fail > 0) {
          toast({
            title: "❌ Upload failed",
            description:
              fail === list.length && firstFailDetail
                ? `${firstFailDetail} Tap to try again.`
                : `${fail} of ${list.length} could not be saved. Tap to retry.`,
            variant: "error",
            durationMs: 8000,
            onClick: openRetryPicker,
          });
        }

        if (ok > 0 && source === "camera") {
          shouldReopenCamera = true;
        }
      } finally {
        setCaptureUploading(false);
        onSuccess();
        if (shouldReopenCamera && openRef.current) {
          window.queueMicrotask(() => {
            window.requestAnimationFrame(() => {
              if (!openRef.current) return;
              cameraInputRef.current?.click();
            });
          });
        }
      }
    },
    [supabase, toast, onSuccess, openRetryPicker, flashAddedToQueueHint]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-sm border-border/60">
        {addedToQueueHint ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute right-14 top-4 z-[2] max-w-[min(12rem_calc(100%-5rem))] truncate rounded-sm border border-emerald-200/70 bg-emerald-50/95 px-2 py-0.5 text-[11px] font-medium leading-tight text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/55 dark:text-emerald-100"
          >
            ✔ Added to queue
          </div>
        ) : null}
        <DialogHeader className="space-y-1.5 border-b border-border/60 pb-3 text-left">
          <DialogTitle className="text-base font-medium">Upload receipts</DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">
            <span className="font-medium text-foreground/80">Take photo</span> reopens after each
            successful save for rapid capture until you close this dialog. Files are saved to your{" "}
            <Link
              href="/financial/receipt-queue"
              className="font-medium text-foreground/80 underline-offset-2 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Receipt queue
            </Link>
            ; you can finish later from the sidebar.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!supabase ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Configure Supabase to upload.
            </p>
          ) : (
            <>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={captureUploading}
                onChange={(e) => {
                  void enqueueFiles(e.target.files, "camera");
                  e.target.value = "";
                }}
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                disabled={captureUploading}
                onChange={(e) => {
                  void enqueueFiles(e.target.files, "files");
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={captureUploading}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  {captureUploading ? (
                    <InlineLoading className="mr-1.5" aria-hidden />
                  ) : (
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={captureUploading}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {captureUploading ? (
                    <InlineLoading className="mr-1.5" aria-hidden />
                  ) : (
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Upload files
                </Button>
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <Link href="/financial/receipt-queue" onClick={() => onOpenChange(false)}>
                    Open queue
                  </Link>
                </Button>
              </div>
              {captureUploading ? (
                <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                  {receiptImagePreparing ? "Preparing image…" : "Uploading…"}
                </p>
              ) : null}
              <div
                className={cn(
                  "flex min-h-[72px] flex-col items-center justify-center gap-1 border border-dashed border-border/60 py-6 text-xs text-muted-foreground transition-colors",
                  dragOver && !captureUploading && "border-foreground/50",
                  captureUploading && "pointer-events-none opacity-60"
                )}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!captureUploading) setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = captureUploading ? "none" : "copy";
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (captureUploading) return;
                  void enqueueFiles(e.dataTransfer.files, "drop");
                }}
              >
                <span>
                  {captureUploading
                    ? receiptImagePreparing
                      ? "Preparing image…"
                      : "Uploading…"
                    : "Drop files here"}
                </span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
