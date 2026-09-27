/** Cent-safe money helpers shared by client and server invoice math. */

export function moneyToCents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const cents = Math.round(Number((Math.abs(n) * 100).toFixed(8)));
  return sign * cents;
}

export function centsToMoney(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

export function roundMoney(value: unknown): number {
  return centsToMoney(moneyToCents(value));
}

/** Round one line extension to cents before it is summed. */
export function lineExtensionCents(qty: unknown, unitPrice: unknown): number {
  const quantity = typeof qty === "number" ? qty : Number(qty);
  const price = typeof unitPrice === "number" ? unitPrice : Number(unitPrice);
  const safeQty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  return moneyToCents(safeQty * safePrice);
}

export function lineExtension(qty: unknown, unitPrice: unknown): number {
  return centsToMoney(lineExtensionCents(qty, unitPrice));
}

export function computeInvoiceTotals(
  lines: Array<{ qty: unknown; unitPrice: unknown }>,
  taxPct: unknown
): { subtotal: number; taxAmount: number; total: number } {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + lineExtensionCents(line.qty, line.unitPrice),
    0
  );
  const rate = typeof taxPct === "number" ? taxPct : Number(taxPct);
  const safeRate = Number.isFinite(rate) ? Math.max(0, rate) : 0;
  const taxCents = Math.round(subtotalCents * (safeRate / 100));
  return {
    subtotal: centsToMoney(subtotalCents),
    taxAmount: centsToMoney(taxCents),
    total: centsToMoney(subtotalCents + taxCents),
  };
}

/** Two-decimal input string. Avoids IEEE leftovers such as 2710.2200000000003. */
export function formatMoneyInput(value: unknown): string {
  return roundMoney(value).toFixed(2);
}

export function invoiceRevenueExTax(invoice: {
  subtotal?: unknown;
  tax_amount?: unknown;
  taxAmount?: unknown;
  total?: unknown;
}): number {
  const subtotal = invoice.subtotal == null ? null : Number(invoice.subtotal);
  if (subtotal != null && Number.isFinite(subtotal)) return roundMoney(Math.max(0, subtotal));
  const total = Number(invoice.total);
  const taxRaw = invoice.tax_amount ?? invoice.taxAmount;
  const tax = taxRaw == null ? 0 : Number(taxRaw);
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeTax = Number.isFinite(tax) ? tax : 0;
  return roundMoney(Math.max(0, safeTotal - safeTax));
}

/** Cash collected toward revenue, excluding the sales-tax share of the invoice. */
export function paymentCollectedExTax(
  amount: unknown,
  invoice?: {
    subtotal?: unknown;
    tax_amount?: unknown;
    taxAmount?: unknown;
    total?: unknown;
  } | null
): number {
  const payment = roundMoney(amount);
  if (!invoice) return payment;
  const total = Number(invoice.total);
  if (!Number.isFinite(total) || total <= 0) return payment;
  return roundMoney(payment * (invoiceRevenueExTax(invoice) / total));
}
