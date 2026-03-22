"use client";

import * as React from "react";
import { downloadWorkerPaymentReceiptPdf } from "@/lib/worker-payment-receipt-pdf";

type Props = {
  receiptNo: string;
  children: React.ReactNode;
};

export function ReceiptPrintClientShell({ receiptNo, children }: Props) {
  const exportRef = React.useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const getReceiptEl = () => {
    const root = exportRef.current;
    if (!root) return null;
    return (root.querySelector(".receipt-container") as HTMLElement | null) ?? root;
  };

  const handleDownloadPdf = async () => {
    const el = getReceiptEl();
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
    <div className="mx-auto max-w-[8.5in] print:max-w-none">
      <div
        data-receipt-toolbar="true"
        className="no-print mb-3 flex flex-wrap items-center justify-end gap-2 print:mb-0"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-[#ddd] bg-white px-3 py-1.5 text-sm hover:bg-[#fafafa]"
        >
          Print
        </button>
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => void handleDownloadPdf()}
          className="rounded-sm border border-[#ddd] bg-white px-3 py-1.5 text-sm hover:bg-[#fafafa] disabled:opacity-60"
        >
          {pdfBusy ? "Generating…" : "Download PDF"}
        </button>
      </div>
      <div ref={exportRef} className="receipt-print-shell">
        {children}
      </div>
    </div>
  );
}
