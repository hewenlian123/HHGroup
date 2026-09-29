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
  payment_received_id?: string | null;
};

/**
 * Posted invoice_payments only. A payments_received row is unapplied until an
 * allocation references it, and that receipt must not change paid or balance.
 */
export function collectedAllocationCents(invoicePayments: AllocationRow[]): number {
  let cents = 0;
  for (const payment of invoicePayments) {
    if (isVoidCashStatus(payment.status)) continue;
    cents += moneyToCents(payment.amount);
  }
  return cents;
}

export function appliedReceiptIds(
  allocations: Array<{
    paymentReceivedId?: string | null;
    payment_received_id?: string | null;
    status?: string | null;
  }>
): Set<string> {
  const applied = new Set<string>();
  for (const allocation of allocations) {
    if (isVoidCashStatus(allocation.status)) continue;
    const id = String(allocation.paymentReceivedId ?? allocation.payment_received_id ?? "").trim();
    if (id) applied.add(id);
  }
  return applied;
}

export function unappliedCustomerReceipts<T extends { id: string; status?: string | null }>(
  receipts: T[],
  allocations: Array<{
    paymentReceivedId?: string | null;
    payment_received_id?: string | null;
    status?: string | null;
  }>
): T[] {
  const applied = appliedReceiptIds(allocations);
  return receipts.filter((receipt) => {
    const id = String(receipt.id ?? "").trim();
    if (!id || isVoidCashStatus(receipt.status)) return false;
    return !applied.has(id);
  });
}

export type PaymentLinkReceipt = {
  id: string;
  projectId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  amount: number;
  status?: string | null;
};

export type PaymentLinkInvoice = {
  id: string;
  projectId?: string | null;
  customerId?: string | null;
  clientName?: string | null;
  status?: string | null;
  balanceDue: number;
};

export type PaymentLinkDecision =
  | { ok: true; alreadyApplied: boolean }
  | { ok: false; error: string };

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = String(left ?? "")
    .trim()
    .toLowerCase();
  const b = String(right ?? "")
    .trim()
    .toLowerCase();
  return a.length > 0 && a === b;
}

function closedInvoiceStatus(status: string | null | undefined): string | null {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "draft") return "Only issued invoices can receive payments.";
  if (normalized === "void" || normalized === "voided")
    return "Voided invoices cannot receive payments.";
  if (normalized === "paid") return "This invoice is already paid.";
  return null;
}

/**
 * An unapplied receipt can be allocated only to an open invoice for the same
 * project and customer, and only when the full amount fits the invoice balance.
 */
export function paymentLinkDecision(input: {
  receipt: PaymentLinkReceipt;
  invoice: PaymentLinkInvoice;
  appliedInvoiceId?: string | null;
}): PaymentLinkDecision {
  if (isVoidCashStatus(input.receipt.status)) {
    return { ok: false, error: "Voided payments cannot be linked." };
  }
  if (!Number.isFinite(input.receipt.amount) || input.receipt.amount <= 0) {
    return { ok: false, error: "Payment amount must be positive." };
  }
  const appliedInvoiceId = String(input.appliedInvoiceId ?? "").trim();
  if (appliedInvoiceId) {
    if (appliedInvoiceId === input.invoice.id) return { ok: true, alreadyApplied: true };
    return { ok: false, error: "This payment is already applied to another invoice." };
  }
  const closed = closedInvoiceStatus(input.invoice.status);
  if (closed) return { ok: false, error: closed };
  if (!Number.isFinite(input.invoice.balanceDue)) {
    return { ok: false, error: "Invoice balance is unavailable." };
  }
  if (moneyToCents(input.receipt.amount) > moneyToCents(input.invoice.balanceDue)) {
    return { ok: false, error: "Payment exceeds the invoice balance." };
  }
  const receiptProjectId = String(input.receipt.projectId ?? "").trim();
  const invoiceProjectId = String(input.invoice.projectId ?? "").trim();
  if (!receiptProjectId || !invoiceProjectId || receiptProjectId !== invoiceProjectId) {
    return { ok: false, error: "Choose an open invoice for the same project." };
  }
  const receiptCustomerId = String(input.receipt.customerId ?? "").trim();
  const invoiceCustomerId = String(input.invoice.customerId ?? "").trim();
  const customerIdsMatch =
    receiptCustomerId.length > 0 &&
    invoiceCustomerId.length > 0 &&
    receiptCustomerId === invoiceCustomerId;
  const customerNamesMatch = sameText(input.receipt.customerName, input.invoice.clientName);
  if (!customerIdsMatch && !customerNamesMatch) {
    return { ok: false, error: "Choose an open invoice for the same customer." };
  }
  return { ok: true, alreadyApplied: false };
}
