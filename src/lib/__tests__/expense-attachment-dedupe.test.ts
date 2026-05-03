import { describe, expect, it } from "vitest";
import {
  collapseMirrorReceiptUrlAndExpenseAttachmentItems,
  dedupeExpenseAttachmentsByStorageKey,
  dedupeExpenseReceiptItemsByStorageKey,
  expenseAttachmentStorageDedupeKey,
} from "@/lib/expense-attachment-dedupe";
import { getExpenseReceiptItemsFromParts } from "@/lib/expense-receipt-items";

describe("expenseAttachmentStorageDedupeKey", () => {
  it("aligns public URL path with bare storage path", () => {
    const pub =
      "https://example.supabase.co/storage/v1/object/public/expense-attachments/quick-expense/a.jpg";
    const path = "quick-expense/a.jpg";
    expect(expenseAttachmentStorageDedupeKey(pub)).toBe(expenseAttachmentStorageDedupeKey(path));
  });

  it("strips query from signed URLs", () => {
    const a = "https://x.test/storage/v1/object/sign/expense-attachments/q/f.jpg?token=abc";
    const b = "https://x.test/storage/v1/object/sign/expense-attachments/q/f.jpg?token=xyz";
    expect(expenseAttachmentStorageDedupeKey(a)).toBe(expenseAttachmentStorageDedupeKey(b));
  });
});

describe("dedupeExpenseAttachmentsByStorageKey", () => {
  it("merges duplicate storage paths", () => {
    const t0 = "2026-01-01T00:00:00.000Z";
    const out = dedupeExpenseAttachmentsByStorageKey([
      {
        id: "1",
        fileName: "Receipt",
        mimeType: "image/jpeg",
        size: 0,
        url: "quick-expense/x.jpg",
        createdAt: t0,
      },
      {
        id: "2",
        fileName: "receipt",
        mimeType: "image/jpeg",
        size: 0,
        url: "quick-expense/x.jpg",
        createdAt: t0,
      },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("dedupeExpenseReceiptItemsByStorageKey", () => {
  it("dedupes receipt header URL against attachment path when keys match", () => {
    const items = dedupeExpenseReceiptItemsByStorageKey([
      {
        url: "https://h.test/storage/v1/object/public/expense-attachments/quick-expense/z.jpg",
        fileName: "Receipt",
      },
      { url: "quick-expense/z.jpg", fileName: "receipt" },
    ]);
    expect(items).toHaveLength(1);
  });
});

describe("collapseMirrorReceiptUrlAndExpenseAttachmentItems", () => {
  it("collapses receipts-bucket public URL + expense-attachments path (quick expense mirror)", () => {
    const out = collapseMirrorReceiptUrlAndExpenseAttachmentItems(
      dedupeExpenseReceiptItemsByStorageKey([
        {
          url: "https://x.test/storage/v1/object/public/receipts/receipts/abc-receipt.jpg",
          fileName: "Receipt",
        },
        {
          url: "quick-expense/def-receipt.jpg",
          fileName: "receipt",
        },
      ])
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toContain("quick-expense");
  });

  it("does not collapse two different expense-attachments", () => {
    const out = collapseMirrorReceiptUrlAndExpenseAttachmentItems(
      dedupeExpenseReceiptItemsByStorageKey([
        { url: "quick-expense/a.jpg", fileName: "a" },
        { url: "quick-expense/b.jpg", fileName: "b" },
      ])
    );
    expect(out).toHaveLength(2);
  });
});

describe("getExpenseReceiptItemsFromParts (integration)", () => {
  it("returns one item for receipt_url + single quick-expense attachment (mirror)", () => {
    const items = getExpenseReceiptItemsFromParts({
      receiptUrl: "https://x.test/storage/v1/object/public/receipts/receipts/m.jpg",
      attachments: [
        {
          id: "1",
          fileName: "receipt",
          mimeType: "image/jpeg",
          size: 0,
          url: "quick-expense/m.jpg",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(items).toHaveLength(1);
  });

  it("returns two items for two distinct attachment paths", () => {
    const items = getExpenseReceiptItemsFromParts({
      receiptUrl: null,
      attachments: [
        {
          id: "1",
          fileName: "r1",
          mimeType: "image/jpeg",
          size: 0,
          url: "quick-expense/one.jpg",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          fileName: "r2",
          mimeType: "image/jpeg",
          size: 0,
          url: "quick-expense/two.jpg",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      ],
    });
    expect(items).toHaveLength(2);
  });
});
