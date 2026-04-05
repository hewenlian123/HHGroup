"use client";

import * as React from "react";
import { ReceiptQueueWorkspace } from "@/app/financial/receipt-queue/receipt-queue-workspace";

export default function ReceiptQueuePage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-[40vh] bg-[#f5f7fa] px-4 py-8 text-sm text-[#6b7280] dark:bg-background dark:text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ReceiptQueueWorkspace />
    </React.Suspense>
  );
}
