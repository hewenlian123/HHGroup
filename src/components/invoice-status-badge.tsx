"use client";

import { cn } from "@/lib/utils";
import type { InvoiceComputedStatus } from "@/lib/invoices-db";

const invoiceStatusStyles: Record<InvoiceComputedStatus, string> = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/70",
  Partial: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/70",
  Unpaid: "bg-zinc-100 text-zinc-700 border-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  Overdue: "bg-red-50 text-red-700 border-red-200/70 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/70",
  Draft: "bg-zinc-100 text-zinc-600 border-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  Void: "bg-red-50 text-red-700 border-red-200/70 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/70",
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceComputedStatus;
  className?: string;
}) {
  const label = status === "Void" ? "VOID" : status;
  const styles = invoiceStatusStyles[status] ?? "bg-zinc-100 text-zinc-700 border-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        styles,
        className
      )}
    >
      {label}
    </span>
  );
}
