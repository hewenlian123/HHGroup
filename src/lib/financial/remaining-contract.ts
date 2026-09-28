import {
  changeOrderAmountValue,
  type ChangeOrderAmountRow,
} from "@/lib/financial/change-order-amount";
import { centsToMoney, invoiceRevenueExTax, moneyToCents, roundMoney } from "@/lib/money";

/**
 * Remaining contract = revised contract − amount already invoiced, excluding tax.
 * Revised contract = original contract + approved change orders.
 * The result is not floored at zero: overbilling stays negative.
 */
export function computeRemainingContract(input: {
  originalContract: number;
  approvedChangeOrders: number;
  invoicedExcludingTax: number;
}): { revisedContract: number; remainingContract: number } {
  const revisedContract = roundMoney(
    roundMoney(input.originalContract) + roundMoney(input.approvedChangeOrders)
  );
  const remainingContract = roundMoney(revisedContract - roundMoney(input.invoicedExcludingTax));
  return { revisedContract, remainingContract };
}

export type InvoiceExTaxSource = {
  id?: string | null;
  status?: string | null;
  subtotal?: unknown;
  tax_amount?: unknown;
  taxAmount?: unknown;
  total?: unknown;
};

/** Drafts and voided invoices are not yet billed against the contract. */
export function invoiceCountsAsAlreadyInvoiced(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "draft") return false;
  if (
    normalized === "void" ||
    normalized === "voided" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return false;
  }
  return true;
}

export function sumInvoicedExcludingTax(
  invoices: readonly InvoiceExTaxSource[],
  options?: { excludeInvoiceId?: string | null }
): number {
  const excludeInvoiceId = options?.excludeInvoiceId ?? null;
  let cents = 0;
  for (const invoice of invoices) {
    if (excludeInvoiceId && invoice.id === excludeInvoiceId) continue;
    if (!invoiceCountsAsAlreadyInvoiced(invoice.status)) continue;
    cents += moneyToCents(invoiceRevenueExTax(invoice));
  }
  return centsToMoney(cents);
}

export function assembleInvoiceContractBilling(input: {
  originalContract: unknown;
  approvedChangeOrders: readonly ChangeOrderAmountRow[];
  invoices: readonly InvoiceExTaxSource[];
  excludeInvoiceId?: string | null;
}): {
  originalContract: number;
  approvedChangeOrders: number;
  previouslyInvoicedExcludingTax: number;
} {
  let changeOrderCents = 0;
  for (const row of input.approvedChangeOrders) {
    changeOrderCents += moneyToCents(changeOrderAmountValue(row));
  }
  return {
    originalContract: roundMoney(input.originalContract),
    approvedChangeOrders: centsToMoney(changeOrderCents),
    previouslyInvoicedExcludingTax: sumInvoicedExcludingTax(input.invoices, {
      excludeInvoiceId: input.excludeInvoiceId,
    }),
  };
}

/**
 * Contract billing well for the invoice editor.
 * Previously invoiced excludes this document. This invoice is its current
 * ex-tax subtotal, including an unsaved draft, so remaining is after this bill.
 */
export function contractBillingSummary(input: {
  originalContract: number;
  approvedChangeOrders: number;
  previouslyInvoicedExcludingTax: number;
  thisInvoiceExcludingTax: number;
}): {
  revisedContract: number;
  previouslyInvoicedExcludingTax: number;
  thisInvoiceExcludingTax: number;
  billedToDateExcludingTax: number;
  remainingContract: number;
  billedToDatePercent: number | null;
} {
  const previouslyInvoicedExcludingTax = roundMoney(input.previouslyInvoicedExcludingTax);
  const thisInvoiceExcludingTax = roundMoney(input.thisInvoiceExcludingTax);
  const billedToDateExcludingTax = roundMoney(
    previouslyInvoicedExcludingTax + thisInvoiceExcludingTax
  );
  const { revisedContract, remainingContract } = computeRemainingContract({
    originalContract: input.originalContract,
    approvedChangeOrders: input.approvedChangeOrders,
    invoicedExcludingTax: billedToDateExcludingTax,
  });
  const billedToDatePercent =
    revisedContract > 0 ? Math.round((billedToDateExcludingTax / revisedContract) * 100) : null;
  return {
    revisedContract,
    previouslyInvoicedExcludingTax,
    thisInvoiceExcludingTax,
    billedToDateExcludingTax,
    remainingContract,
    billedToDatePercent,
  };
}
