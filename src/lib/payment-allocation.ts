import { moneyToCents } from "@/lib/money";

/** Void, cancelled, and rejected cash rows do not reduce a balance. */
export function isVoidCashStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  return (
    normalized === "void" ||
    normalized === "voided" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "rejected" ||
    normalized === "deleted"
  );
}

type AllocationRow = {
  amount?: unknown;
  status?: string | null;
  paymentReceivedId?: string | null;
};

type ReceivedRow = {
  id?: string | null;
  amount?: unknown;
  status?: string | null;
};

/**
 * Posted invoice allocations plus payments_received rows that were never
 * copied into invoice_payments. Linked ids are counted once.
 */
export function collectedAllocationCents(
  invoicePayments: AllocationRow[],
  paymentsReceived: ReceivedRow[] = []
): number {
  let cents = 0;
  const linked = new Set<string>();
  for (const payment of invoicePayments) {
    const linkedId = String(payment.paymentReceivedId ?? "").trim();
    if (linkedId) linked.add(linkedId);
    if (isVoidCashStatus(payment.status)) continue;
    cents += moneyToCents(payment.amount);
  }
  for (const payment of paymentsReceived) {
    const id = String(payment.id ?? "").trim();
    if (id && linked.has(id)) continue;
    if (isVoidCashStatus(payment.status)) continue;
    cents += moneyToCents(payment.amount);
  }
  return cents;
}
