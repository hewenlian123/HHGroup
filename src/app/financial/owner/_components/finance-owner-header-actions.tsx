"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinanceOwnerHeaderActions({
  monthLabel,
  className,
}: {
  monthLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div
        className={cn(
          "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-sm font-medium tabular-nums sm:min-h-9 sm:py-0",
          "shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-border/60 dark:bg-muted/30"
        )}
        title="KPIs and invoicing totals use the current calendar month. Cash flow shows the last six months ending this month."
      >
        <span className="text-muted-foreground">Month</span>
        <span>{monthLabel}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="inline-flex min-h-[44px] items-center gap-1.5 border-zinc-200/90 bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-200 ease-out hover:bg-zinc-50 sm:h-9 sm:min-h-0 dark:border-border/60 dark:bg-muted/30"
        onClick={() => window.print()}
      >
        <Download className="h-4 w-4" aria-hidden />
        Export
      </Button>
    </div>
  );
}
