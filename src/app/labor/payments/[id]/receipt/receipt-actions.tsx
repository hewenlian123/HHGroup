"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ReceiptActions({ paymentId }: { paymentId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button size="sm" variant="outline" className="h-8" asChild>
        <Link href={`/receipt/print/${encodeURIComponent(paymentId)}`}>View receipt page</Link>
      </Button>
      <Button size="sm" variant="outline" className="h-8" asChild>
        <Link
          href={`/receipt/print/${encodeURIComponent(paymentId)}?autoprint=1`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Print
        </Link>
      </Button>
      <Button size="sm" variant="outline" className="h-8" asChild>
        <a href={`/api/receipt/${encodeURIComponent(paymentId)}/pdf`} download>
          Download PDF
        </a>
      </Button>
    </div>
  );
}
