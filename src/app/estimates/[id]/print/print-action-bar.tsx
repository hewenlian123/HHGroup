"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

export function PrintActionBar({ estimateId }: { estimateId: string }) {
  return (
    <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3 shadow-sm">
      <Button variant="ghost" size="sm" className="rounded-lg" asChild>
        <Link href={`/estimates/${estimateId}`}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
      </Button>
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">Save as PDF via your browser&apos;s Print dialog.</span>
        <Button
          type="button"
          size="sm"
          className="rounded-lg"
          onClick={() => typeof window !== "undefined" && window.print()}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>
    </div>
  );
}
