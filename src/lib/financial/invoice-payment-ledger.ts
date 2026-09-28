import { centsToMoney, moneyToCents } from "@/lib/money";

export type InvoicePaymentLedgerInput = {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
  voided: boolean;
};

export type InvoicePaymentLedgerRow = InvoicePaymentLedgerInput & {
  runningBalance: number;
};

/**
 * Posted payments reduce the invoice total in date order.
 * Voided rows stay on the ledger and do not change the running balance.
 * The balance is floored at zero, matching invoice balance due.
 */
export function buildInvoicePaymentLedger(
  invoiceTotal: number,
  payments: readonly InvoicePaymentLedgerInput[]
): InvoicePaymentLedgerRow[] {
  const ordered = [...payments].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) return byDate;
    return left.id.localeCompare(right.id);
  });

  let remainingCents = moneyToCents(invoiceTotal);
  return ordered.map((payment) => {
    if (!payment.voided) {
      remainingCents -= moneyToCents(payment.amount);
    }
    return {
      ...payment,
      runningBalance: centsToMoney(Math.max(0, remainingCents)),
    };
  });
}
