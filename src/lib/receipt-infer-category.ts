/** Heuristic category from vendor name (receipt OCR / queue). */
export function inferExpenseCategoryFromVendor(vendor: string): string {
  const v = vendor.toLowerCase();
  if (/home depot|lowe'?s|lowes/.test(v)) return "Materials";
  if (/gas|fuel|shell|chevron/.test(v)) return "Vehicle";
  return "Other";
}
