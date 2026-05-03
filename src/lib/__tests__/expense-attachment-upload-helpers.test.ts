import { describe, expect, it } from "vitest";
import {
  buildExpenseAttachmentForUpload,
  storageFileTypeForExpenseUpload,
} from "@/lib/expense-attachment-upload-helpers";

describe("storageFileTypeForExpenseUpload", () => {
  it("detects PDF by mime", () => {
    const f = new File([], "doc.pdf", { type: "application/pdf" });
    expect(storageFileTypeForExpenseUpload(f)).toBe("pdf");
  });

  it("detects image by mime", () => {
    const f = new File([], "a.jpg", { type: "image/jpeg" });
    expect(storageFileTypeForExpenseUpload(f)).toBe("image");
  });

  it("returns null for unsupported types", () => {
    const f = new File([], "x.exe", { type: "application/octet-stream" });
    expect(storageFileTypeForExpenseUpload(f)).toBe(null);
  });
});

describe("buildExpenseAttachmentForUpload", () => {
  it("sets url to storage path and sane mime", () => {
    const f = new File([], "scan.pdf", { type: "application/pdf" });
    const att = buildExpenseAttachmentForUpload(f, "expenses/e1/scan.pdf");
    expect(att.url).toBe("expenses/e1/scan.pdf");
    expect(att.mimeType).toBe("application/pdf");
    expect(att.fileName).toBe("scan.pdf");
    expect(att.id.length).toBeGreaterThan(10);
  });
});
