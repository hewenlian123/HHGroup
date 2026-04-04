"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase";
import { inferExpenseCategoryFromVendor } from "@/lib/receipt-infer-category";
import { processReceiptQueueUpload } from "@/lib/receipt-queue-process-upload";
import { insertReceiptQueueProcessing, notifyReceiptQueueChanged } from "@/lib/receipt-queue";
import { Camera, Upload } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function UploadReceiptsQueueModal({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const enqueueFiles = React.useCallback(
    (files: FileList | File[] | null) => {
      if (!files?.length || !supabase) {
        if (!supabase) toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      const list = Array.from(files).filter((f) => f.size > 0);
      if (!list.length) return;
      for (const file of list) {
        void (async () => {
          let qid: string;
          try {
            qid = await insertReceiptQueueProcessing(supabase, file);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Enqueue failed";
            toast({ title: "Receipt queue", description: msg, variant: "error" });
            return;
          }
          notifyReceiptQueueChanged();
          try {
            await processReceiptQueueUpload(supabase, qid, file, inferExpenseCategoryFromVendor);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Processing failed";
            toast({ title: "Upload processing", description: msg, variant: "error" });
          }
          notifyReceiptQueueChanged();
        })();
      }
      void onSuccess();
      toast({
        title: `${list.length} file${list.length === 1 ? "" : "s"} added to receipt queue`,
        description: "Open Receipt queue to review, edit, and confirm.",
        variant: "success",
      });
    },
    [supabase, toast, onSuccess]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-sm border-border/60">
        <DialogHeader className="space-y-1.5 border-b border-border/60 pb-3 text-left">
          <DialogTitle className="text-base font-medium">Upload receipts</DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">
            Files are saved to your{" "}
            <Link
              href="/financial/receipt-queue"
              className="font-medium text-foreground/80 underline-offset-2 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Receipt queue
            </Link>
            . You can close this dialog and finish later from the sidebar.
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
                onChange={(e) => {
                  enqueueFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  enqueueFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload files
                </Button>
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <Link href="/financial/receipt-queue" onClick={() => onOpenChange(false)}>
                    Open queue
                  </Link>
                </Button>
              </div>
              <div
                className={cn(
                  "flex min-h-[72px] flex-col items-center justify-center gap-1 border border-dashed border-border/60 py-6 text-xs text-muted-foreground transition-colors",
                  dragOver && "border-foreground/50"
                )}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  enqueueFiles(e.dataTransfer.files);
                }}
              >
                <span>Drop files here</span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
