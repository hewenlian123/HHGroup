"use client";

import * as React from "react";
import { Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentReceiptDocument } from "@/components/financial/payment-receipt-document";
import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";
import { downloadPaymentReceiptPdf } from "@/lib/payment-receipt-pdf";
import { formatCurrency, formatDate } from "@/lib/formatters";
import "@/styles/worker-payment-receipt-print.css";
import "@/styles/payment-receipt-a4.css";

type Props = {
  open: boolean;
  data: PaymentReceiptPreviewDto | null;
  onOpenChange: (open: boolean) => void;
};

function defaultSubject(data: PaymentReceiptPreviewDto): string {
  const invoice = data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8);
  return `Payment receipt ${data.receiptNo} for invoice ${invoice}`;
}

function defaultBody(data: PaymentReceiptPreviewDto): string {
  const invoice = data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8);
  return [
    `Hi ${data.customerName},`,
    "",
    `Thank you for your payment of ${formatCurrency(data.payment.amount)} received on ${formatDate(
      data.payment.paymentDate
    )}.`,
    "",
    `Receipt: ${data.receiptNo}`,
    `Invoice: ${invoice}`,
    data.projectName ? `Project: ${data.projectName}` : null,
    `Payment method: ${data.payment.paymentMethod ?? "—"}`,
    `Balance after payment: ${formatCurrency(data.invoice.balanceAfterPayment)}`,
    "",
    "The PDF receipt can be attached to this email after download.",
    "",
    "Thank you,",
    data.company.companyName,
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

export function SendPaymentReceiptModal({ open, data, onOpenChange }: Props) {
  const [recipient, setRecipient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const receiptExportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || !data) return;
    setRecipient(data.recipientEmail ?? "");
    setSubject(defaultSubject(data));
    setBody(defaultBody(data));
  }, [data, open]);

  const handleDownloadPdf = React.useCallback(async () => {
    if (!data) return;
    const root = receiptExportRef.current;
    const el = (root?.querySelector(".receipt-container") as HTMLElement | null) ?? root;
    if (!el) return;
    setPdfBusy(true);
    try {
      await downloadPaymentReceiptPdf(el, data.receiptNo);
    } finally {
      setPdfBusy(false);
    }
  }, [data]);

  const handleOpenDraft = React.useCallback(() => {
    if (!data) return;
    const mailto = `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(
      subject.trim()
    )}&body=${encodeURIComponent(body.trim())}`;
    window.location.href = mailto;
  }, [body, data, recipient, subject]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-revenue-ar-v2
        className="max-w-lg rounded-hh-task border-[var(--hh-border)]"
      >
        <DialogHeader className="border-b border-[var(--hh-border)] pb-3">
          <DialogTitle className="text-hh-section-title font-semibold text-[var(--hh-text-primary)]">
            Send payment receipt
          </DialogTitle>
        </DialogHeader>

        {data ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-hh-body">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--hh-text-primary)]">{data.receiptNo}</p>
                  <p className="mt-0.5 truncate text-hh-metadata text-[var(--hh-text-secondary)]">
                    {data.customerName} · {data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-[var(--hh-success)]">
                  {formatCurrency(data.payment.amount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="payment-receipt-recipient"
                className="text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
              >
                To
              </label>
              <Input
                id="payment-receipt-recipient"
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="customer@email.com"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="payment-receipt-subject"
                className="text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
              >
                Subject
              </label>
              <Input
                id="payment-receipt-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="payment-receipt-message"
                className="text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
              >
                Message
              </label>
              <Textarea
                id="payment-receipt-message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[170px] resize-none"
              />
            </div>

            <p className="text-hh-metadata text-[var(--hh-text-secondary)]">
              Email draft uses your mail app. The PDF cannot be attached automatically from the
              browser, so download it here and attach it to the draft.
            </p>

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--hh-border)] pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1"
                disabled={pdfBusy}
                onClick={() => void handleDownloadPdf()}
              >
                <Download className="h-3.5 w-3.5" />
                {pdfBusy ? "Generating..." : "Download PDF"}
              </Button>
              <Button type="button" size="sm" className="h-9 gap-1" onClick={handleOpenDraft}>
                <Mail className="h-3.5 w-3.5" />
                Open email draft
              </Button>
            </div>

            <div className="pointer-events-none fixed -left-[9999px] top-0 w-[210mm] bg-white">
              <div ref={receiptExportRef} className="payment-receipt-export-root">
                <PaymentReceiptDocument data={data} />
              </div>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-hh-body text-[var(--hh-text-secondary)]">
            Loading receipt...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
