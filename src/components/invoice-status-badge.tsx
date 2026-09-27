"use client";

import { NeoStatus, type StatusBadgeVariant } from "@/components/base";
import type { InvoiceComputedStatus } from "@/lib/invoices-db";

const invoiceStatusVariant: Record<InvoiceComputedStatus, StatusBadgeVariant> = {
  Paid: "success",
  Partial: "warning",
  Unpaid: "default",
  Overdue: "danger",
  Draft: "muted",
  Void: "danger",
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceComputedStatus;
  className?: string;
}) {
  return <NeoStatus label={status} variant={invoiceStatusVariant[status]} className={className} />;
}
