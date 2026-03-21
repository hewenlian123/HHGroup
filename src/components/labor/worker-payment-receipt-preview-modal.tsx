"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerPaymentReceiptDocument } from "@/components/labor/worker-payment-receipt-document";
import type { WorkerPaymentReceiptPreviewDto } from "@/lib/worker-payment-receipt-preview-dto";
import { cn } from "@/lib/utils";
import "./worker-payment-receipt-preview-modal.css";

type Props = {
  paymentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WorkerPaymentReceiptPreviewModal({ paymentId, open, onOpenChange }: Props) {
  const [data, setData] = React.useState<WorkerPaymentReceiptPreviewDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !paymentId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void (async () => {
      try {
        const res = await fetch(`/api/labor/worker-payments/${encodeURIComponent(paymentId)}/receipt-preview`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as { error?: string } | WorkerPaymentReceiptPreviewDto;
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof json === "object" && json && "error" in json && json.error ? String(json.error) : "Failed to load.");
          setData(null);
          return;
        }
        setData(json as WorkerPaymentReceiptPreviewDto);
      } catch {
        if (!cancelled) setError("Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, paymentId]);

  const handleDownloadPdf = React.useCallback(() => {
    if (!paymentId) return;
    window.open(`/receipt/print/${paymentId}`, "_blank");
  }, [paymentId]);

  const handlePrint = React.useCallback(() => {
    window.print();
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "receipt-preview-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "receipt-preview-dialog-root fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,880px)] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-sm border border-border/60 bg-background shadow-none duration-100",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "max-md:inset-x-3 max-md:top-6 max-md:max-h-[calc(100vh-3rem)] max-md:w-auto max-md:max-w-[calc(100vw-1.5rem)] max-md:-translate-x-1/2 max-md:translate-y-0"
          )}
        >
          <DialogPrimitive.Description className="sr-only">
            Worker payment receipt preview. Print from here or open the PDF page in a new tab.
          </DialogPrimitive.Description>
          <div className="modal-header flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">Receipt preview</DialogPrimitive.Title>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                disabled={!paymentId}
                onClick={handleDownloadPdf}
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </Button>
              <DialogPrimitive.Close asChild>
                <Button type="button" size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="receipt-preview-scroll min-h-0 flex-1 overflow-y-auto bg-[#f5f5f5] p-4">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading receipt…</p>
            ) : error ? (
              <p className="py-12 text-center text-sm text-destructive">{error}</p>
            ) : data ? (
              <WorkerPaymentReceiptDocument data={data} />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
