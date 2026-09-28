"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { ApBillPaymentRow, ApBillWithProject } from "@/lib/ap-bills-db";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { openBillDetail } from "./bill-detail-sheet";

export function OutgoingPaymentDetail({
  payment,
}: {
  payment: ApBillPaymentRow & { bill: ApBillWithProject | null };
}) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const openingBill = React.useRef(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button ref={trigger} size="sm" variant="ghost">
          View payment
        </Button>
      </SheetTrigger>
      <SheetContent
        className="md:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (openingBill.current) {
            event.preventDefault();
            openingBill.current = false;
          }
        }}
      >
        <SheetHeader className="mb-4 pr-11 text-left">
          <SheetTitle>Outgoing payment details</SheetTitle>
          <SheetDescription>AP bill payment · Money out</SheetDescription>
        </SheetHeader>
        <dl className="grid grid-cols-2 gap-3 break-words text-hh-body">
          {Object.entries({
            Bill: payment.bill?.bill_no || payment.bill_id,
            Vendor: payment.bill?.vendor_name || "Unavailable",
            Project: payment.bill?.project_name || "—",
            Amount: formatCurrency(payment.amount),
            Method: payment.payment_method || "—",
            Date: formatDate(payment.payment_date),
            Reference: payment.reference_no || "—",
            Notes: payment.notes || "—",
            Source: "AP bill payment",
            Account: "Not recorded",
            Attachments: "Not recorded",
            Status: "Recorded payment; reversal status unavailable",
          }).map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-[var(--hh-text-secondary)]">{label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
        <Button
          className="mt-4"
          onClick={() => {
            openingBill.current = true;
            setOpen(false);
            openBillDetail(payment.bill_id, false, trigger.current);
          }}
        >
          Open related bill
        </Button>
        <p className="mt-4 text-hh-metadata">
          Editing, receipts, sending and payment reversal are unavailable for AP payments. Voiding a
          bill does not reverse its payments.
        </p>
      </SheetContent>
    </Sheet>
  );
}
