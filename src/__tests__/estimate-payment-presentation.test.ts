import { describe, expect, it } from "vitest";
import { formatEstimatePaymentDueDate } from "@/app/estimates/_components/estimate-payment-date";
import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";
import { parseProposalScopeLines } from "@/app/estimates/_components/proposal-scope-model";

describe("Estimate payment presentation", () => {
  it("keeps specific dates calendar-local and the empty date available for completion display", () => {
    expect(formatEstimatePaymentDueDate(null)).toBeNull();
    expect(formatEstimatePaymentDueDate("2027-01-08")).toBe("Jan 8, 2027");
  });
  it("preserves rich payment notes while stripping executable markup", () => {
    const rich =
      "<p><strong>Deposit</strong> <em>before work</em></p><ul><li>Materials</li></ul><ol><li>Confirm</li></ol>";
    expect(sanitizeLineItemDescriptionHtml(rich)).toBe(rich);
    const safe = sanitizeLineItemDescriptionHtml(
      rich + '<script>alert(1)</script><img src=x onerror="alert(1)">'
    );
    expect(safe).toBe(rich);
  });
  it("retains the legacy plain-note path", () => {
    const plain = "Confirm scope\nConfirm start date";
    expect(lineItemBodyLooksLikeHtml(plain)).toBe(false);
    expect(parseProposalScopeLines(plain).map((row) => row.text)).toEqual([
      "Confirm scope",
      "Confirm start date",
    ]);
  });
});
