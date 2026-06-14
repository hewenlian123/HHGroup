"use client";

import * as React from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, ExternalLink, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerPaymentReceiptDocument } from "@/components/labor/worker-payment-receipt-document";
import {
  hhNeoFocusRevealDialog,
  hhNeoFocusRevealMobileSheet,
  hhNeoFocusRevealOverlay,
} from "@/lib/motion-system";
import type { WorkerPaymentReceiptPreviewDto } from "@/lib/worker-payment-receipt-preview-dto";
import { cn } from "@/lib/utils";
import "@/styles/worker-payment-receipt-print.css";
import "./worker-payment-receipt-preview-modal.css";

type Props = {
  paymentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const receiptPreviewButtonClass =
  "min-h-[44px] rounded-lg border-white/[0.12] bg-white/[0.035] px-3 text-[var(--neo-text-secondary)] shadow-[var(--neo-shadow-control)] hover:border-white/[0.2] hover:bg-white/[0.08] hover:text-[var(--neo-text-primary)] sm:min-h-9";

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
        const res = await fetch(
          `/api/labor/worker-payments/${encodeURIComponent(paymentId)}/receipt-preview`,
          {
            cache: "no-store",
          }
        );
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | WorkerPaymentReceiptPreviewDto;
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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn("receipt-preview-overlay fixed inset-0 z-50", hhNeoFocusRevealOverlay)}
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
          className={cn(
            "receipt-preview-dialog-root fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh_880px)] w-[min(720px_94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[1.5rem] border border-white/10 bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[0_30px_90px_rgb(0_0_0_/_0.46),inset_0_1px_0_rgb(255_255_255_/_0.05)] outline-none",
            hhNeoFocusRevealDialog,
            "max-md:inset-x-2 max-md:bottom-0 max-md:top-auto max-md:max-h-[calc(100dvh-0.75rem)] max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-[1.5rem] max-md:border-b-0",
            hhNeoFocusRevealMobileSheet
          )}
        >
          <DialogPrimitive.Description className="sr-only">
            Worker payment receipt preview. Open the clean print view or download a server-generated
            PDF.
          </DialogPrimitive.Description>
          <div className="modal-header flex shrink-0 flex-col gap-3 border-b border-white/[0.08] bg-[var(--neo-surface-raised)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <DialogPrimitive.Title className="text-sm font-semibold text-[var(--neo-text-primary)]">
              Receipt preview
            </DialogPrimitive.Title>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              {paymentId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(receiptPreviewButtonClass, "gap-1")}
                  asChild
                >
                  <Link
                    href={`/labor/payments/${encodeURIComponent(paymentId)}/receipt`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View receipt
                  </Link>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className={cn(receiptPreviewButtonClass, "gap-1")}
                disabled={!paymentId}
                asChild={Boolean(paymentId)}
              >
                {paymentId ? (
                  <Link
                    href={`/receipt/print/${encodeURIComponent(paymentId)}?autoprint=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Link>
                ) : (
                  <>
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(receiptPreviewButtonClass, "gap-1")}
                disabled={!data?.receiptNo || !paymentId}
                asChild={Boolean(data?.receiptNo && paymentId)}
              >
                {data?.receiptNo && paymentId ? (
                  <a href={`/api/receipt/${encodeURIComponent(paymentId)}/pdf`} download>
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </a>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </>
                )}
              </Button>
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(receiptPreviewButtonClass, "w-full shrink-0 p-0 sm:w-9")}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="receipt-preview-scroll receipt-print-shell mobile-native-scroll min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading receipt…</p>
            ) : error ? (
              <p className="py-12 text-center text-sm text-destructive">{error}</p>
            ) : data ? (
              <div className="receipt-pdf-export-root">
                <WorkerPaymentReceiptDocument data={data} />
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
