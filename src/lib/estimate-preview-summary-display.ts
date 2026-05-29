import {
  buildEstimatePreviewTaxLabel,
  ratePctFromTaxAndSubtotal,
} from "@/app/estimates/_components/estimate-tax-presets";

export type EstimatePreviewSummaryDisplay = {
  showTax: boolean;
  taxLabel: string;
  showDiscount: boolean;
  totalLabel: string;
};

export function resolveEstimatePreviewSummaryDisplay(params: {
  subtotal: number;
  tax: number;
  discount: number;
  isProposalStyle: boolean;
  /** Optional persisted rate when tax amount is zero but a taxable rate was selected. */
  selectedTaxRatePct?: number | null;
  /** Optional persisted label paired with selectedTaxRatePct. */
  selectedTaxLabel?: string | null;
}): EstimatePreviewSummaryDisplay {
  const subtotal = Math.max(0, Number(params.subtotal) || 0);
  const tax = Math.max(0, Number(params.tax) || 0);
  const discount = Math.max(0, Number(params.discount) || 0);
  const selectedRate = normalizeSelectedTaxRate(params.selectedTaxRatePct);

  const impliedRate = ratePctFromTaxAndSubtotal(subtotal, tax);
  const hasTaxableRate = (impliedRate ?? 0) > 0 || selectedRate > 0;
  const showTax = tax > 0 || hasTaxableRate;
  const taxLabel =
    tax > 0
      ? buildEstimatePreviewTaxLabel(subtotal, tax)
      : selectedRate > 0
        ? formatSelectedTaxLabel(params.selectedTaxLabel, selectedRate)
        : "Tax";

  return {
    showTax,
    taxLabel,
    showDiscount: discount > 0,
    totalLabel: params.isProposalStyle ? "Contract Price" : "Grand Total",
  };
}

function normalizeSelectedTaxRate(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function formatSelectedTaxLabel(label: string | null | undefined, ratePct: number): string {
  const trimmed = label?.trim();
  if (trimmed) {
    const rateText = formatRateForLabel(ratePct);
    return trimmed.includes("%") ? `Tax (${trimmed})` : `Tax (${trimmed} ${rateText})`;
  }
  return `Tax (${formatRateForLabel(ratePct)})`;
}

function formatRateForLabel(ratePct: number): string {
  const normalized = Math.round((ratePct + Number.EPSILON) * 1000) / 1000;
  const text = Number.isInteger(normalized)
    ? String(normalized)
    : String(normalized).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}
