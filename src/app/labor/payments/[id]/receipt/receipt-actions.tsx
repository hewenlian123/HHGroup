"use client";

import { Button } from "@/components/ui/button";

export function ReceiptActions({ paymentId }: { paymentId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => window.open(`/receipt/print/${paymentId}`, "_blank")}
      >
        View Receipt (PDF)
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => window.print()}>
        Print
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => window.print()}>
        Download PDF
      </Button>
    </div>
  );
}

