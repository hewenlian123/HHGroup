import { describe, expect, it } from "vitest";
import { normalizeReceiptLocation, receiptReferenceVersion } from "@/lib/expense-receipt-reference";

describe("expense receipt reference normalization", () => {
  it.each([
    [
      "quick-expense/2026/receipt one.jpg",
      { bucket: "expense-attachments", path: "quick-expense/2026/receipt one.jpg" },
    ],
    [
      "expense-attachments/quick-expense/receipt.jpg",
      { bucket: "expense-attachments", path: "quick-expense/receipt.jpg" },
    ],
    ["receipts/receipts/legacy.png", { bucket: "receipts", path: "receipts/legacy.png" }],
    [
      "http://127.0.0.1:54321/storage/v1/object/public/receipts/receipts/legacy.png",
      { bucket: "receipts", path: "receipts/legacy.png" },
    ],
    [
      "http://127.0.0.1:54321/storage/v1/object/sign/expense-attachments/folder/receipt%20one.jpg?token=secret",
      { bucket: "expense-attachments", path: "folder/receipt one.jpg" },
    ],
    [
      "http://127.0.0.1:54321/storage/v1/object/authenticated/expense-attachments/folder/a.pdf#fragment",
      { bucket: "expense-attachments", path: "folder/a.pdf" },
    ],
  ])("normalizes %s without retaining URL tokens", (raw, expected) => {
    expect(normalizeReceiptLocation(raw)).toEqual(expected);
  });

  it.each([
    "",
    "https://files.example.test/receipt.jpg",
    "other-bucket/receipt.jpg",
    "../receipt.jpg",
    "folder/../../receipt.jpg",
    "folder/%2e%2e/receipt.jpg",
    "folder\\receipt.jpg",
    "http://127.0.0.1:54321/storage/v1/object/public/other-bucket/receipt.jpg",
    "http://127.0.0.1:54321/storage/v1/object/public/receipts/%E0%A4%A",
  ])("rejects unsupported or unsafe reference %s", (raw) => {
    expect(normalizeReceiptLocation(raw)).toBeNull();
  });

  it("versions source identity and the exact stored reference without exposing either", async () => {
    const base = {
      expenseId: "11111111-1111-4111-8111-111111111111",
      rawReference: "quick-expense/a.jpg",
      sourceId: "22222222-2222-4222-8222-222222222222",
      sourceKind: "attachment" as const,
    };

    const first = await receiptReferenceVersion(base);
    const same = await receiptReferenceVersion(base);
    const changed = await receiptReferenceVersion({
      ...base,
      rawReference: "quick-expense/b.jpg",
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).not.toContain(base.rawReference);
    expect(first).not.toContain(base.sourceId);
  });
});
