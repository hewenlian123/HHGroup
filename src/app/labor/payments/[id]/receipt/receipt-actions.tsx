"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { downloadWorkerPaymentReceiptPdf } from "@/lib/worker-payment-receipt-pdf";

export function ReceiptActions({
  paymentId,
  receiptNo,
  exportRef,
}: {
  paymentId: string;
  receiptNo: string;
  exportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const getExportEl = () => {
    const root = exportRef.current;
    if (!root) return null;
    return (root.querySelector(".receipt-container") as HTMLElement | null) ?? root;
  };

  const handleDownloadPdf = async () => {
    const el = getExportEl();
    if (!el) return;
    setPdfBusy(true);
    try {
      await downloadWorkerPaymentReceiptPdf(el, receiptNo);
    } catch (e) {
      console.error("[receipt-pdf]", e);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button size="sm" variant="outline" className="h-8" asChild>
        <Link href={`/receipt/print/${encodeURIComponent(paymentId)}`}>View receipt page</Link>
      </Button>
      <Button size="sm" variant="outline" className="h-8" type="button" onClick={() => window.print()}>
        Print
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        type="button"
        disabled={pdfBusy}
        onClick={() => void handleDownloadPdf()}
      >
        {pdfBusy ? "Generating…" : "Download PDF"}
      </Button>
    </div>
  );
}
