"use client";

import { cn } from "@/lib/utils";
import type { InvoiceComputedStatus } from "@/lib/invoices-db";

const invoiceStatusPill: Record<InvoiceComputedStatus, string> = {
  Paid: "hh-pill-success",
  Partial: "hh-pill-warning",
  Unpaid: "hh-pill-neutral",
  Overdue: "hh-pill-danger",
  Draft: "hh-pill-neutral",
  Void: "hh-pill-danger",
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceComputedStatus;
  className?: string;
}) {
  const label = status === "Void" ? "VOID" : status;
  const pill = invoiceStatusPill[status] ?? "hh-pill-neutral";
  return (
    <span className={cn("inline-flex items-center tabular-nums", pill, className)}>{label}</span>
  );
}
