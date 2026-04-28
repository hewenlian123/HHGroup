/** Buckets used for commission payment attachment files (upload API + DB receipt_url). */
export const COMMISSION_RECEIPT_BUCKETS = [
  "commission-receipts",
  "commission-payment-receipts",
] as const;

/**
 * Parse bucket + object path from a Supabase Storage public or signed URL.
 */
export function parseCommissionReceiptStorageUrl(
  url: string
): { bucket: string; path: string } | null {
  try {
    const pathname = new URL(url.trim()).pathname;
    for (const b of COMMISSION_RECEIPT_BUCKETS) {
      for (const marker of [
        `/storage/v1/object/public/${b}/`,
        `/storage/v1/object/sign/${b}/`,
        `/object/public/${b}/`,
        `/object/sign/${b}/`,
      ]) {
        const i = pathname.indexOf(marker);
        if (i !== -1) {
          return { bucket: b, path: decodeURIComponent(pathname.slice(i + marker.length)) };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function commissionReceiptPathForPayment(paymentId: string): string {
  return `commission-payments/${paymentId}/`;
}

export function isStoragePathForCommissionReceipt(paymentId: string, storagePath: string): boolean {
  const prefix = commissionReceiptPathForPayment(paymentId);
  return storagePath.startsWith(prefix);
}

export function fileNameFromStoragePath(path: string): string {
  const seg = path.split("/").filter(Boolean).pop() || "receipt";
  return seg.split("?")[0] || "receipt";
}

export function isPdfStoragePath(path: string): boolean {
  return /\.pdf$/i.test(path.split("/").pop() ?? "");
}
