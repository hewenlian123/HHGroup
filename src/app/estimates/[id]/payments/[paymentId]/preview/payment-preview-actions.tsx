"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PaymentPreviewActions({ estimateId }: { estimateId: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[8.5in] items-center justify-between gap-3">
        <Button variant="outline" asChild>
          <Link href={`/estimates/${estimateId}`}>Back to estimate</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
          <Button onClick={() => window.print()}>Download / Print PDF</Button>
        </div>
      </div>
    </div>
  );
}
