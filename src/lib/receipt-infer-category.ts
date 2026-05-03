/** Heuristic category from vendor name (receipt OCR / queue). */
export function inferExpenseCategoryFromVendor(vendor: string): string {
  const v = vendor.toLowerCase();
  if (/home depot|lowe'?s|lowes|costco|walmart|city mill|hardware hawaii/.test(v)) {
    return "Materials";
  }
  if (/gas\s+station|gas|fuel|shell|chevron|exxon|mobil|bp\b/.test(v)) return "Vehicle";
  return "Other";
}
