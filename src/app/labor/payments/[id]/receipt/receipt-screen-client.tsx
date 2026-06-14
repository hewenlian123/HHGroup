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
    <div className="receipt-print-shell min-h-screen bg-white text-zinc-900">
      <div className="mx-auto max-w-[8.5in] px-3 py-4 print:px-0 print:py-0">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2">
          <Link
            href="/labor/payments"
            className="text-sm text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline"
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
