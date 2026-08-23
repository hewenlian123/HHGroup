export type EstimateMilestoneInvoiceAllocation = {
  subtotal: number;
  taxPct: number;
  taxAmount: number;
  total: number;
};

function finiteNonnegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function moneyToCents(value: unknown): number {
  return Math.round(finiteNonnegative(value) * 100);
}

function centsToMoney(value: number): number {
  return value / 100;
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

/**
 * Split a tax-inclusive final milestone into the Invoice model's tax-exclusive
 * subtotal plus tax. Estimate discount is already embedded in the milestone and
 * is deliberately not applied a second time.
 */
export function allocateTaxInclusiveMilestoneToInvoice(input: {
  milestoneAmount: unknown;
  estimateSubtotal: unknown;
  estimateTax: unknown;
  estimateDiscount: unknown;
}): EstimateMilestoneInvoiceAllocation {
  const milestoneCents = moneyToCents(input.milestoneAmount);
  const estimateSubtotal = finiteNonnegative(input.estimateSubtotal);
  const estimateTax = finiteNonnegative(input.estimateTax);
  const estimateDiscount = finiteNonnegative(input.estimateDiscount);
  const estimateTotalCents = moneyToCents(estimateSubtotal + estimateTax - estimateDiscount);

  if (milestoneCents <= 0) throw new Error("Payment milestone amount must be greater than 0.");
  if (milestoneCents > estimateTotalCents) {
    throw new Error("Payment milestone amount cannot exceed the authoritative Estimate total.");
  }
  if (estimateTax <= 0) {
    const total = centsToMoney(milestoneCents);
    return { subtotal: total, taxPct: 0, taxAmount: 0, total };
  }
  if (estimateSubtotal <= 0) {
    throw new Error("Cannot derive Invoice tax from an Estimate with tax but no taxable subtotal.");
  }

  const taxRate = estimateTax / estimateSubtotal;
  const initialSubtotalCents = Math.round(milestoneCents / (1 + taxRate));
  let subtotalCents = initialSubtotalCents;
  let taxCents = Math.round(subtotalCents * taxRate);

  // Find the nearest cent allocation whose normal Invoice rounding lands on
  // the authoritative final milestone exactly.
  for (let distance = 0; distance <= 100; distance++) {
    const candidates =
      distance === 0
        ? [initialSubtotalCents]
        : [initialSubtotalCents - distance, initialSubtotalCents + distance];
    const match = candidates.find((candidate) => {
      if (candidate < 0) return false;
      return candidate + Math.round(candidate * taxRate) === milestoneCents;
    });
    if (match != null) {
      subtotalCents = match;
      taxCents = milestoneCents - match;
      break;
    }
  }

  let taxPct = roundRate(taxRate * 100);
  if (subtotalCents + taxCents !== milestoneCents) {
    subtotalCents = Math.max(1, Math.min(initialSubtotalCents, milestoneCents));
    taxCents = milestoneCents - subtotalCents;
    taxPct = roundRate((taxCents / subtotalCents) * 100);
  }

  const subtotal = centsToMoney(subtotalCents);
  const taxAmount = centsToMoney(taxCents);
  const total = centsToMoney(milestoneCents);
  const recomputedTax = Math.round(subtotal * (taxPct / 100) * 100) / 100;
  if (Math.round((subtotal + recomputedTax) * 100) !== milestoneCents) {
    throw new Error("Invoice tax rounding cannot represent the authoritative milestone total.");
  }

  return { subtotal, taxPct, taxAmount, total };
}
