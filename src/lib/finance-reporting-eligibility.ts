function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

export function reportingInvoiceEligible(status: string | null | undefined): boolean {
  return ["sent", "partially_paid", "paid"].includes(normalizeStatus(status));
}

export function reportingApEligible(status: string | null | undefined): boolean {
  return ["pending", "partially_paid"].includes(normalizeStatus(status));
}
