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
      <DialogContent className="max-w-lg rounded-md border-border/60">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="text-base font-medium">Send payment receipt</DialogTitle>
        </DialogHeader>

        {data ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-black/[0.06] bg-muted/[0.18] px-3 py-3 text-sm dark:border-white/[0.08]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{data.receiptNo}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {data.customerName} · {data.invoice.invoiceNo ?? data.invoice.id.slice(0, 8)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(data.payment.amount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                To
              </label>
              <Input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="customer@email.com"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Subject
              </label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Message
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[170px] resize-none"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Email draft uses your mail app. The PDF cannot be attached automatically from the
              browser, so download it here and attach it to the draft.
            </p>

            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-2 sm:flex-row sm:justify-end">
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

            <div className="pointer-events-none fixed -left-[9999px] top-0 w-[8.5in] bg-white">
              <div ref={receiptExportRef}>
                <PaymentReceiptDocument data={data} />
              </div>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading receipt...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
