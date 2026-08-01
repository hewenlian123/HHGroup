"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

export function PrintActionBar({ estimateId }: { estimateId: string }) {
  return (
    <div className="estimate-print-action-bar print:hidden relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Button
        variant="outline"
        size="sm"
        className="estimate-preview-tool-button min-h-11 sm:min-h-8"
        asChild
      >
        <Link href={`/estimates/${estimateId}`}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
      </Button>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="estimate-preview-tool-button min-h-11 sm:min-h-8"
          onClick={() => typeof window !== "undefined" && window.print()}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>
    </div>
  );
}
