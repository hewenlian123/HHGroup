import { describe, expect, it } from "vitest";

import {
  isWorkerReceiptUploadPath,
  parseWorkerReceiptStoragePath,
  WORKER_RECEIPT_BUCKET,
} from "@/lib/worker-receipt-storage";

function pathFor(index: number): string {
  return `uploads/00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}.png`;
}

describe("worker receipt Storage references", () => {
  it("resolves legacy public-style receipt URLs to canonical private paths", () => {
    const legacyReferences = Array.from({ length: 48 }, (_, offset) => {
      const path = pathFor(offset + 1);
      return {
        path,
        url: `https://example.supabase.co/storage/v1/object/public/${WORKER_RECEIPT_BUCKET}/${path}`,
      };
    });

    expect(legacyReferences).toHaveLength(48);
    for (const reference of legacyReferences) {
      expect(parseWorkerReceiptStoragePath(reference.url)).toBe(reference.path);
    }
  });

  it("keeps canonical and signed bucket references reviewable but rejects external URLs", () => {
    const path = pathFor(99);
    const signedUrl = `https://example.supabase.co/storage/v1/object/sign/${WORKER_RECEIPT_BUCKET}/${path}?token=fixture`;

    expect(isWorkerReceiptUploadPath(path)).toBe(true);
    expect(parseWorkerReceiptStoragePath(path)).toBe(path);
    expect(parseWorkerReceiptStoragePath(signedUrl)).toBe(path);
    expect(parseWorkerReceiptStoragePath("https://legacy.example.invalid/receipt.png")).toBeNull();
  });
});
