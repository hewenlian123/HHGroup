"use client";

import * as React from "react";
import Link from "next/link";
import { ReceiptActions } from "./receipt-actions";

type Props = {
  paymentId: string;
  children: React.ReactNode;
};

export function WorkerPaymentReceiptScreen({ paymentId, children }: Props) {
  return (
    <div
      className="receipt-print-shell min-h-screen bg-[var(--hh-l0-canvas)] text-[var(--hh-ink)]"
      data-hh-context="document-route"
      data-hh-theme="document-light"
    >
      <div className="mx-auto max-w-[8.5in] px-3 py-4 print:px-0 print:py-0">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hh-line)] pb-2">
          <Link
            href="/labor/payments"
            className="text-sm text-[var(--hh-link)] underline-offset-4 hover:underline"
          >
            Back
          </Link>
          <ReceiptActions paymentId={paymentId} />
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
