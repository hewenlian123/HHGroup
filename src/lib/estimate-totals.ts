import { roundMoney } from "@/lib/money";

export type EstimatePricingInput = {
  subtotal: number;
  discount?: number | null;
  /** Legacy fixed tax dollars. Ignored when taxRatePct is set. */
  tax?: number | null;
  /** Percent applied to (subtotal − discount). */
  taxRatePct?: number | null;
};

export type EstimatePricing = {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  taxRatePct: number | null;
  total: number;
};

/**
 * Discount is applied to the subtotal, then tax is applied to what remains.
 * A stored tax rate recalculates when the scope changes. A legacy fixed tax
 * amount is kept only when no rate is stored.
 */
export function computeEstimatePricing(input: EstimatePricingInput): EstimatePricing {
  const subtotal = roundMoney(Math.max(0, Number(input.subtotal) || 0));
  const discount = roundMoney(Math.max(0, Number(input.discount) || 0));
  const taxableBase = roundMoney(Math.max(0, subtotal - discount));
  const rateRaw = input.taxRatePct;
  const rate = rateRaw == null ? null : Number(rateRaw);
  const taxRatePct = rate != null && Number.isFinite(rate) ? Math.max(0, rate) : null;
  const tax =
    taxRatePct != null
      ? roundMoney(taxableBase * (taxRatePct / 100))
      : roundMoney(Math.max(0, Number(input.tax) || 0));
  return {
    subtotal,
    discount,
    taxableBase,
    tax,
    taxRatePct,
    total: roundMoney(subtotal - discount + tax),
  };
}
