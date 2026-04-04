"use client";

import * as React from "react";
import { ReceiptQueueWorkspace } from "./receipt-queue-workspace";

export default function ReceiptQueuePage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <ReceiptQueueWorkspace />
    </React.Suspense>
  );
}
