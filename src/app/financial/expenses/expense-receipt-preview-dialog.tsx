"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { InlineLoading, Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReceiptPreviewItem = { url: string; fileName: string };

function isPdfUrl(u: string): boolean {
  return /\.pdf(\?|#|$)/i.test(u);
}

function isImageUrl(u: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(u);
}

function safeDownloadName(name: string): string {
  const n = (name || "receipt").replace(/[/\\?%*:|"<>]/g, "_").trim() || "receipt";
  return n.includes(".") ? n : `${n}.bin`;
}

export async function downloadReceiptFile(url: string, fileName: string): Promise<void> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = safeDownloadName(fileName);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export type ExpenseReceiptPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReceiptPreviewItem[];
  index: number;
  onIndexChange: (index: number) => void;
  expenseId?: string;
  replaceInputRef: React.RefObject<HTMLInputElement>;
  receiptReplacing: boolean;
  onReplaceInputChange: React.ChangeEventHandler<HTMLInputElement>;
  onReplaceButtonClick: () => void;
};

export function ExpenseReceiptPreviewDialog({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
  expenseId,
  replaceInputRef,
  receiptReplacing,
  onReplaceInputChange,
  onReplaceButtonClick,
}: ExpenseReceiptPreviewDialogProps) {
  const current = items[index];
  const url = current?.url ?? "";
  const displayName = current?.fileName ?? "Receipt";
  const headerTitle =
    items.length > 1 ? `${displayName} (${index + 1}/${items.length})` : displayName;

  const [loadPhase, setLoadPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [iframeFallback, setIframeFallback] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadHint, setDownloadHint] = React.useState<string | null>(null);

  const showPdf = isPdfUrl(url);
  const treatAsImageFirst = !iframeFallback && (isImageUrl(url) || !showPdf);

  React.useEffect(() => {
    if (!open) return;
    setLoadPhase("loading");
    setIframeFallback(false);
    setDownloadHint(null);
  }, [open, url, index]);

  const onImgError = React.useCallback(() => {
    if (!iframeFallback) {
      setIframeFallback(true);
      setLoadPhase("loading");
      return;
    }
    setLoadPhase("error");
  }, [iframeFallback]);

  React.useEffect(() => {
    if (!open || !url || loadPhase !== "loading") return;
    const t = window.setTimeout(() => {
      setLoadPhase((p) => (p === "loading" ? "error" : p));
    }, 28000);
    return () => window.clearTimeout(t);
  }, [open, url, loadPhase]);

  const handleDownloadClick = React.useCallback(async () => {
    if (!url) return;
    setDownloadHint(null);
    setDownloading(true);
    try {
      await downloadReceiptFile(url, displayName);
    } catch {
      setDownloadHint("Download failed. Try again or check your connection.");
    } finally {
      setDownloading(false);
    }
  }, [url, displayName]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content asChild>
          <motion.div
            className={cn(
              "fixed left-1/2 top-1/2 z-[51] flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-xl",
              "focus:outline-none dark:bg-card"
            )}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <DialogPrimitive.Title className="sr-only">Receipt preview</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Preview of expense receipt. Use download or replace from the footer.
            </DialogPrimitive.Description>

            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3 pr-12">
              <span
                className="min-w-0 truncate text-sm font-medium text-foreground"
                title={headerTitle}
              >
                {headerTitle}
              </span>
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="btn-outline-ghost absolute right-3 top-3 h-9 w-9 shrink-0 rounded-sm"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </header>

            <div className="relative min-h-[200px] max-h-[70vh] flex-1 overflow-y-auto bg-muted/20 dark:bg-muted/10">
              {!url ? (
                <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground">
                  Preview not available
                </div>
              ) : loadPhase === "error" ? (
                <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground">
                  Preview not available
                </div>
              ) : (
                <>
                  {loadPhase === "loading" ? (
                    <div
                      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70 px-6 backdrop-blur-sm dark:bg-background/80"
                      aria-busy
                    >
                      <Skeleton className="h-[min(50vh,320px)] w-full max-w-lg rounded-md" />
                      <span className="sr-only">Loading preview</span>
                    </div>
                  ) : null}
                  {showPdf || iframeFallback ? (
                    <iframe
                      title={showPdf ? "Receipt PDF" : "Receipt"}
                      src={url}
                      className="block min-h-[50vh] w-full border-0"
                      onLoad={() => setLoadPhase("ready")}
                    />
                  ) : treatAsImageFirst ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- signed/public receipt URL */
                    <img
                      src={url}
                      alt=""
                      className="mx-auto max-h-[70vh] w-full object-contain"
                      onLoad={() => setLoadPhase("ready")}
                      onError={onImgError}
                    />
                  ) : (
                    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground">
                      Preview not available
                    </div>
                  )}
                </>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {expenseId ? (
                  <>
                    <input
                      type="file"
                      ref={replaceInputRef}
                      accept="image/*,.pdf"
                      capture="environment"
                      className="hidden"
                      onChange={onReplaceInputChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={receiptReplacing}
                      onClick={onReplaceButtonClick}
                    >
                      {receiptReplacing ? "Replacing…" : "Replace Receipt"}
                    </Button>
                  </>
                ) : null}
                {items.length > 1 ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-9"
                      onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-9"
                      onClick={() => onIndexChange((index + 1) % items.length)}
                    >
                      Next
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={!url || downloading}
                  onClick={() => void handleDownloadClick()}
                >
                  {downloading ? (
                    <>
                      <InlineLoading className="mr-2" size="md" aria-hidden />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" aria-hidden />
                      Download
                    </>
                  )}
                </Button>
                {downloadHint ? (
                  <span className="max-w-[220px] text-right text-xs text-destructive">
                    {downloadHint}
                  </span>
                ) : null}
              </div>
            </footer>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
