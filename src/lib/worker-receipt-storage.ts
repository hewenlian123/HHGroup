export const WORKER_RECEIPT_BUCKET = "worker-receipts";

export const WORKER_RECEIPT_UPLOAD_PATH_RE =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|pdf)$/i;

export function isWorkerReceiptUploadPath(value: string): boolean {
  return WORKER_RECEIPT_UPLOAD_PATH_RE.test(value.trim());
}

/** Accept only a worker-receipts upload path or a legacy Storage URL for that same object. */
export function parseWorkerReceiptStoragePath(value: string): string | null {
  const raw = value.trim();
  if (isWorkerReceiptUploadPath(raw)) return raw;

  try {
    const pathname = new URL(raw).pathname;
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/object/public/",
      "/object/sign/",
    ] as const;
    for (const marker of markers) {
      const index = pathname.indexOf(marker);
      if (index < 0) continue;
      const [bucket, ...parts] = pathname
        .slice(index + marker.length)
        .split("/")
        .filter(Boolean);
      const path = decodeURIComponent(parts.join("/")).replace(/^\/+/, "");
      if (bucket === WORKER_RECEIPT_BUCKET && isWorkerReceiptUploadPath(path)) return path;
    }
  } catch {
    return null;
  }

  return null;
}
