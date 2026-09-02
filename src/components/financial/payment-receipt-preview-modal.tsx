"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, Mail, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentReceiptDocument } from "@/components/financial/payment-receipt-document";
import {
  hhNeoFocusRevealDialog,
  hhNeoFocusRevealMobileSheet,
  hhNeoFocusRevealOverlay,
} from "@/lib/motion-system";
import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";
import { downloadPaymentReceiptPdf } from "@/lib/payment-receipt-pdf";
import { cn } from "@/lib/utils";
import "@/styles/worker-payment-receipt-print.css";
import "@/styles/payment-receipt-a4.css";
import "./payment-receipt-preview-modal.css";
import { useHhPortalContainer } from "@/contexts/hh-theme-context";

type Props = {
  paymentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendReceipt?: (data: PaymentReceiptPreviewDto) => void;
  autoAction?: "download" | "print" | null;
};

export function PaymentReceiptPreviewModal({
  paymentId,
  open,
  onOpenChange,
  onSendReceipt,
  autoAction,
}: Props) {
  const portalContainer = useHhPortalContainer();
  const [data, setData] = React.useState<PaymentReceiptPreviewDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const receiptExportRef = React.useRef<HTMLDivElement>(null);
  const autoActionKeyRef = React.useRef<string | null>(null);

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
        const res = await fetch(
          `/api/financial/payments/${encodeURIComponent(paymentId)}/receipt-preview`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | PaymentReceiptPreviewDto;
        if (cancelled) return;
        if (!res.ok) {
          setError(
            typeof json === "object" && json && "error" in json && json.error
              ? String(json.error)
              : "Failed to load."
          );
          setData(null);
          return;
        }
        setData(json as PaymentReceiptPreviewDto);
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

  React.useEffect(() => {
    if (!open) {
      document.documentElement.classList.remove("print-payment-receipt-preview");
    }
  }, [open]);

  const handleDownloadPdf = React.useCallback(async () => {
    if (!data?.receiptNo) return;
    const root = receiptExportRef.current;
    const el = (root?.querySelector(".receipt-container") as HTMLElement | null) ?? root;
    if (!el) return;
    setPdfBusy(true);
    try {
      await downloadPaymentReceiptPdf(el, data.receiptNo);
    } finally {
      setPdfBusy(false);
    }
  }, [data?.receiptNo]);

  const handlePrint = React.useCallback(() => {
    const root = document.documentElement;
    root.classList.add("print-payment-receipt-preview");
    const t = window.setTimeout(
      () => root.classList.remove("print-payment-receipt-preview"),
      10_000
    );
    const cleanup = () => {
      window.clearTimeout(t);
      root.classList.remove("print-payment-receipt-preview");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }, []);

  React.useEffect(() => {
    if (!open || !paymentId || !data || !autoAction) return;
    const key = `${paymentId}:${data.receiptNo}:${autoAction}`;
    if (autoActionKeyRef.current === key) return;
    autoActionKeyRef.current = key;
    const timer = window.setTimeout(() => {
      if (autoAction === "download") void handleDownloadPdf();
      if (autoAction === "print") handlePrint();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [autoAction, data, handleDownloadPdf, handlePrint, open, paymentId]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={portalContainer ?? undefined}>
        <DialogPrimitive.Overlay
          className={cn("receipt-preview-overlay fixed inset-0 z-50", hhNeoFocusRevealOverlay)}
        />
        <DialogPrimitive.Content
          data-revenue-ar-v2
          data-hh-context="viewer"
          data-hh-theme="operational-light"
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
          className={cn(
            "receipt-preview-dialog-root fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,880px)] w-[min(900px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-overlay outline-none",
            hhNeoFocusRevealDialog,
            "max-md:inset-x-2 max-md:bottom-0 max-md:top-auto max-md:max-h-[calc(100dvh-0.75rem)] max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-[var(--hh-radius-task)] max-md:border-b-0",
            hhNeoFocusRevealMobileSheet
          )}
        >
          <DialogPrimitive.Description className="sr-only">
            Payment receipt preview. Print from here or download PDF without leaving this page.
          </DialogPrimitive.Description>
          <div className="modal-header flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hh-border)] px-4 py-3">
            <DialogPrimitive.Title className="text-hh-section-title font-semibold text-[var(--hh-text-primary)]">
              Payment receipt
            </DialogPrimitive.Title>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 min-h-11 gap-1 md:h-8 md:min-h-0"
                disabled={!data}
                onClick={() => data && onSendReceipt?.(data)}
              >
                <Mail className="h-3.5 w-3.5" />
                Send
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 min-h-11 gap-1 md:h-8 md:min-h-0"
                disabled={!data}
                onClick={handlePrint}
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 min-h-11 gap-1 md:h-8 md:min-h-0"
                disabled={!data?.receiptNo || pdfBusy}
                onClick={() => void handleDownloadPdf()}
              >
                <Download className="h-3.5 w-3.5" />
                {pdfBusy ? "Generating..." : "Download PDF"}
              </Button>
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-11 min-h-11 w-11 min-w-11 shrink-0 p-0 md:h-8 md:min-h-0 md:w-8 md:min-w-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="receipt-preview-scroll receipt-print-shell mobile-native-scroll min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {loading ? (
              <p className="py-12 text-center text-hh-body text-[var(--hh-text-secondary)]">
                Loading receipt...
              </p>
            ) : error ? (
              <p className="py-12 text-center text-hh-body text-[var(--hh-danger)]">{error}</p>
            ) : data ? (
              <div
                ref={receiptExportRef}
                className="receipt-pdf-export-root payment-receipt-export-root"
              >
                <PaymentReceiptDocument data={data} />
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
