"use client";

import * as React from "react";
import { ReceiptQueueSkeleton } from "@/components/financial/receipt-queue-skeleton";
import { ReceiptQueueWorkspace } from "./receipt-queue-workspace";

export default function ReceiptQueuePage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-6">
          <ReceiptQueueSkeleton rows={5} />
        </div>
      }
    >
      <ReceiptQueueWorkspace />
    </React.Suspense>
  );
}
