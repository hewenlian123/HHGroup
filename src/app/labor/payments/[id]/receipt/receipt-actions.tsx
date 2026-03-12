"use client";

import { Button } from "@/components/ui/button";

export function ReceiptActions() {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button size="sm" variant="outline" className="h-8" onClick={() => window.print()}>
        Print
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => window.print()}>
        Download PDF
      </Button>
    </div>
  );
}

