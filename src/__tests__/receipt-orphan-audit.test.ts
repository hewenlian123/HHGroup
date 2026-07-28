import { describe, expect, it } from "vitest";
import {
  classifyReceiptStorageObjects,
  normalizeReceiptAuditReference,
} from "../../scripts/audit-receipt-storage-orphans.mjs";

describe("read-only receipt Storage orphan audit", () => {
  it("normalizes path, bucket-prefixed, and historical signed references", () => {
    expect(normalizeReceiptAuditReference("quick-expense/a.jpg")).toEqual({
      bucket: "expense-attachments",
      path: "quick-expense/a.jpg",
    });
    expect(normalizeReceiptAuditReference("receipts/legacy/b.png")).toEqual({
      bucket: "receipts",
      path: "legacy/b.png",
    });
    expect(
      normalizeReceiptAuditReference(
        "https://local.test/storage/v1/object/sign/expense-attachments/secure/c.pdf?token=secret"
      )
    ).toEqual({ bucket: "expense-attachments", path: "secure/c.pdf" });
  });

  it("keeps referenced and Replace-retained objects out of orphan candidates", () => {
    const classified = classifyReceiptStorageObjects({
      objects: [
        { bucket: "expense-attachments", path: "active.jpg", sizeBytes: 1 },
        { bucket: "expense-attachments", path: "retained.jpg", sizeBytes: 2 },
        { bucket: "receipts", path: "candidate.jpg", sizeBytes: 3 },
      ],
      references: [{ bucket: "expense-attachments", path: "active.jpg" }],
      retained: [{ bucket: "expense-attachments", path: "retained.jpg" }],
    });
    expect(classified.map(({ classification }) => classification)).toEqual([
      "referenced",
      "retained_after_replace",
      "orphan_candidate",
    ]);
  });

  it("contains no mutation operation in the executable audit", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("scripts/audit-receipt-storage-orphans.mjs", "utf8")
    );
    expect(source).not.toMatch(
      /\b(?:delete\s+from|insert\s+into|update\s+(?:public|storage)\.|drop\s+(?:table|policy)|truncate)\b/i
    );
  });
});
