"use client";

import * as React from "react";
import { ReceiptQueueSkeleton } from "@/components/financial/receipt-queue-skeleton";
import { ReceiptQueueWorkspace } from "./receipt-queue-workspace";

export default function ReceiptQueuePage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-[40vh] bg-[#f5f7fa] px-4 py-6 dark:bg-background">
          <div className="mx-auto max-w-6xl">
            <ReceiptQueueSkeleton rows={5} />
          </div>
        </div>
      }
    >
      <ReceiptQueueWorkspace />
    </React.Suspense>
  );
}
