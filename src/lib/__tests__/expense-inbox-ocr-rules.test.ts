import { describe, expect, it } from "vitest";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { expenseCountsTowardCanonicalProjectCost } from "@/lib/expense-canonical-cost";
import { findExpenseDuplicate, type ExpenseDuplicateSubject } from "@/lib/expense-duplicate-rules";
import { expenseHeaderMatchesLines, singleLineHeaderSyncAmount } from "@/lib/expense-header-total";
import {
  isPlaceholderInvoiceNumber,
  mergeInvoiceExtraction,
  openAiInvoiceContentPart,
  parseInvoiceExtraction,
  type InboxDraftSnapshot,
} from "@/lib/expense-ocr-merge";
import {
  expenseMatchesSettlementFilter,
  expenseSettlementLabel,
  settlementForApproval,
} from "@/lib/expense-payment-settlement";
import { mapWithConcurrency } from "@/lib/expense-upload-throttle";

const draft = (overrides: Partial<InboxDraftSnapshot> = {}): InboxDraftSnapshot => ({
  vendorName: "Unknown",
  vendorId: null,
  referenceNo: `INBOX-UP-${"a".repeat(64)}`,
  expenseDate: "2026-09-29",
  placeholderDate: "2026-09-29",
  createdOn: "2026-09-29",
  dueDate: null,
  subtotal: null,
  tax: null,
  lineAmount: 0.01,
  lineCount: 1,
  ...overrides,
});

const subject = (overrides: Partial<ExpenseDuplicateSubject> = {}): ExpenseDuplicateSubject => ({
  id: "self",
  vendorName: "City Mill",
  vendorId: "vendor-1",
  referenceNo: "INV-100",
  total: 86.42,
  date: "2026-09-10",
  ...overrides,
});

describe("invoice extraction merge", () => {
  it("fills empty placeholders and does not overwrite owner edits", () => {
    const extraction = parseInvoiceExtraction(
      {
        vendor_name: "Honolulu Lumber",
        invoice_number: "A-44",
        invoice_date: "2026-09-01",
        due_date: "2026-10-01",
        subtotal: 100,
        tax_amount: 4.5,
        total_amount: 104.5,
        confidence: {
          vendor: "high",
          invoiceNumber: "high",
          invoiceDate: "high",
          dueDate: "medium",
          subtotal: "high",
          tax: "high",
          total: "high",
        },
      },
      "2026-09-29"
    );
    expect(extraction).not.toBeNull();
    const merged = mergeInvoiceExtraction(draft(), extraction!, [
      { id: "v1", name: "Honolulu Lumber LLC" },
    ]);
    expect(merged.patch.vendorId).toBe("v1");
    expect(merged.patch.vendorName).toBe("Honolulu Lumber LLC");
    expect(merged.patch.referenceNo).toBe("A-44");
    expect(merged.patch.expenseDate).toBe("2026-09-01");
    expect(merged.patch.dueDate).toBe("2026-10-01");
    expect(merged.patch.lineAmount).toBe(104.5);
    expect(merged.applied).toEqual(
      expect.arrayContaining(["vendor", "invoiceNumber", "invoiceDate", "total"])
    );

    const owner = mergeInvoiceExtraction(
      draft({
        vendorName: "Owner Vendor",
        vendorId: "owner-vendor",
        referenceNo: "OWNER-9",
        expenseDate: "2026-08-15",
        placeholderDate: "2026-09-29",
        dueDate: "2026-08-20",
        subtotal: 10,
        tax: 1,
        lineAmount: 11,
      }),
      extraction!
    );
    expect(owner.patch.vendorName).toBeUndefined();
    expect(owner.patch.vendorId).toBeUndefined();
    expect(owner.patch.referenceNo).toBeUndefined();
    expect(owner.patch.expenseDate).toBeUndefined();
    expect(owner.patch.dueDate).toBeUndefined();
    expect(owner.patch.subtotal).toBeUndefined();
    expect(owner.patch.tax).toBeUndefined();
    expect(owner.patch.lineAmount).toBeUndefined();
    expect(owner.attention).not.toContain("invoiceNumber");
    expect(owner.attention).not.toContain("vendor");
  });

  it("suggests creating a vendor when no confident match exists", () => {
    const merged = mergeInvoiceExtraction(draft(), {
      vendorName: "Kakaako Hardware",
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      subtotal: null,
      tax: null,
      total: null,
      confidence: { vendor: "high" },
    });
    expect(merged.patch.vendorId).toBeUndefined();
    expect(merged.patch.vendorSuggestion).toBe("Kakaako Hardware");
    expect(merged.vendorMatch.kind).toBe("suggest_create");
    expect(merged.attention).toContain("vendor");
  });

  it("treats the upload fingerprint as an empty invoice number", () => {
    expect(isPlaceholderInvoiceNumber(`INBOX-UP-${"b".repeat(64)}`)).toBe(true);
    expect(isPlaceholderInvoiceNumber("INV-1")).toBe(false);
  });

  it("sends a PDF as one OpenAI file and an image as an image", () => {
    expect(
      openAiInvoiceContentPart({
        mimeType: "application/pdf",
        base64: "QQ==",
        fileName: "scan.pdf",
      })
    ).toMatchObject({
      type: "file",
      file: { filename: "scan.pdf" },
    });
    expect(
      openAiInvoiceContentPart({ mimeType: "image/jpeg", base64: "QQ==", fileName: "scan.jpg" })
        .type
    ).toBe("image_url");
  });
});

describe("expense duplicate rules", () => {
  it("flags the same vendor and invoice number anywhere in the set", () => {
    const hit = findExpenseDuplicate(subject(), [
      subject({
        id: "other",
        vendorName: "City Mill Inc",
        vendorId: null,
        date: "2025-01-01",
        total: 1,
      }),
    ]);
    expect(hit).toMatchObject({ expenseId: "other", reason: "vendor_invoice" });
  });

  it("flags the same total within 3 days and a similar vendor", () => {
    const hit = findExpenseDuplicate(subject({ referenceNo: `INBOX-UP-${"c".repeat(64)}` }), [
      subject({
        id: "near",
        referenceNo: null,
        date: "2026-09-12",
        vendorId: null,
        vendorName: "city mill",
      }),
    ]);
    expect(hit).toMatchObject({ expenseId: "near", reason: "amount_date_vendor" });
  });

  it("ignores a similar total outside 3 days and a different invoice", () => {
    const hit = findExpenseDuplicate(subject({ referenceNo: "INV-1" }), [
      subject({ id: "far", referenceNo: "INV-2", date: "2026-09-20" }),
    ]);
    expect(hit).toBeNull();
  });

  it("does not treat unknown placeholder vendors as similar", () => {
    const hit = findExpenseDuplicate(
      subject({ vendorName: "Unknown", vendorId: null, referenceNo: null }),
      [subject({ id: "other", vendorName: "Unknown", vendorId: null, referenceNo: null })]
    );
    expect(hit).toBeNull();
  });
});

describe("Honolulu draft date", () => {
  it("uses the Pacific/Honolulu calendar date after 2 PM Hawaii", () => {
    const instant = new Date("2026-09-29T02:30:00.000Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-09-29");
    expect(hawaiiTodayYmd(instant)).toBe("2026-09-28");
  });
});

describe("unpaid expense approval", () => {
  it("approves without a payment account as unpaid and marks paid only with an account", () => {
    expect(settlementForApproval({ paymentAccountId: null })).toBe("unpaid");
    expect(settlementForApproval({ paymentAccountId: "acct-1" })).toBe("paid");
    expect(settlementForApproval({ paymentAccountId: "acct-1", settlement: "unpaid" })).toBe(
      "unpaid"
    );
    expect(expenseSettlementLabel({ paymentStatus: "unpaid", workflowStatus: "approved" })).toBe(
      "Unpaid"
    );
    expect(
      expenseSettlementLabel({
        paymentStatus: null,
        paymentAccountId: "acct-1",
        workflowStatus: "approved",
      })
    ).toBe("Paid");
    expect(
      expenseMatchesSettlementFilter(
        { paymentStatus: "unpaid", workflowStatus: "approved" },
        "unpaid"
      )
    ).toBe(true);
    expect(
      expenseMatchesSettlementFilter(
        { paymentStatus: "paid", workflowStatus: "approved" },
        "unpaid"
      )
    ).toBe(false);
  });
});

describe("header and canonical cost", () => {
  it("syncs a single line and rejects a multi-line mismatch", () => {
    expect(singleLineHeaderSyncAmount([42.5])).toBe(42.5);
    expect(singleLineHeaderSyncAmount([10, 5])).toBeNull();
    expect(expenseHeaderMatchesLines(15, [10, 5])).toBe(true);
    expect(expenseHeaderMatchesLines(14, [10, 5])).toBe(false);
  });

  it("keeps unapproved inbox captures out of project cost after the fingerprint leaves reference_no", () => {
    expect(
      expenseCountsTowardCanonicalProjectCost({
        status: "draft",
        reference_no: "INV-9",
        inbox_capture: true,
      })
    ).toBe(false);
    expect(
      expenseCountsTowardCanonicalProjectCost({
        status: "needs_review",
        reference_no: "INV-9",
        inbox_capture: true,
      })
    ).toBe(false);
    expect(
      expenseCountsTowardCanonicalProjectCost({
        status: "approved",
        reference_no: "INV-9",
        inbox_capture: true,
      })
    ).toBe(true);
    expect(
      expenseCountsTowardCanonicalProjectCost({
        status: "needs_review",
        reference_no: "LEGACY-1",
        inbox_capture: false,
      })
    ).toBe(true);
  });
});

describe("upload concurrency", () => {
  it("caps in-flight work", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});
