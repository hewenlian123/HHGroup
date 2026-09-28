import { describe, expect, it } from "vitest";
import {
  financePathWithReturn,
  financeReturnPath,
  financeReturnLabel,
  financePaymentActionReturn,
  financeWorkspacePath,
} from "../finance-navigation";

describe("Finance navigation context", () => {
  it("carries the entire workspace through detail and edit without losing source scope", () => {
    const source =
      "/financial/invoices?q=TEST&status=Draft&page=2&tab=open&sort=date&selected=inv-1&returnTo=%2Fvendors%2Fvendor-1%3Ftab%3Dbills";
    const detail = financePathWithReturn("/financial/invoices/inv-1", source);
    const edit = financePathWithReturn("/financial/invoices/inv-1/edit", source);
    expect(new URL(edit, "http://hh.local").searchParams.get("returnTo")).toBe(source);
    expect(
      financeReturnPath(
        new URL(detail, "http://hh.local").searchParams.get("returnTo"),
        "/financial/invoices"
      )
    ).toBe(source);
  });
  it("preserves existing destination actions and hash", () => {
    const result = new URL(
      financePathWithReturn(
        "/bills/one?addPayment=1#payments",
        "/financial/payables/payments?page=2"
      ),
      "http://hh.local"
    );
    expect(result.searchParams.get("addPayment")).toBe("1");
    expect(result.hash).toBe("#payments");
    expect(result.searchParams.get("returnTo")).toBe("/financial/payables/payments?page=2");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "",
    null,
  ])("rejects unsafe return address %s", (value) => {
    expect(financeReturnPath(value, "/bills")).toBe("/bills");
  });
  it("restores a chosen record without losing its workspace filters", () => {
    const result = new URL(
      financePathWithReturn("/bills/one", "/bills?search=TEST&status=Draft", "one"),
      "http://hh.local"
    );
    expect(result.searchParams.get("returnTo")).toBe(
      "/bills?search=TEST&status=Draft&selectedRecord=one"
    );
  });
  it("labels the actual origin", () => {
    expect(financeReturnLabel("/financial/ar?invoice=one")).toBe("Back to AR");
    expect(financeReturnLabel("/financial/payables/payments?page=2")).toBe(
      "Back to outgoing payments"
    );
    expect(financeReturnLabel("/financial/bank?tab=unmatched")).toBe("Back to reconciliation");
    expect(financeReturnLabel("/vendors/one?tab=bills")).toBe("Back to vendor");
  });
});

describe("Finance action and alias context", () => {
  it("returns an externally opened receive/edit action to its exact parent", () => {
    for (const action of ["invoiceId", "editPayment"] as const) {
      const parent = "/financial/ar?customerId=c1&tab=history&page=2";
      const current = financePathWithReturn(`/financial/payments?${action}=one`, parent);
      expect(financePaymentActionReturn(current, action)).toBe(parent);
    }
  });
  it("keeps locally opened actions in their payment workspace, including selection", () => {
    const current = "/financial/payments?q=test&paymentId=p1&returnTo=%2Ffinancial%2Fdeposits";
    expect(financePaymentActionReturn(current, "editPayment")).toBe(current);
    const edit = financePathWithReturn("/financial/payments?editPayment=p1", current);
    expect(financePaymentActionReturn(edit, "editPayment")).toBe(current);
  });
  it("clears a direct action without dropping filters or accepting an external return", () => {
    expect(
      financePaymentActionReturn(
        "/financial/payments?invoiceId=i1&q=test&returnTo=https%3A%2F%2Fevil.example",
        "invoiceId"
      )
    ).toBe("/financial/payments?q=test&returnTo=https%3A%2F%2Fevil.example");
  });
  it("preserves repeated and encoded query values through legacy route aliases", () => {
    expect(
      financeWorkspacePath("/bills", {
        search: "A & B",
        page: "2",
        tag: ["a", "b"],
        returnTo: "/vendors/v1?tab=Bills",
        missing: undefined,
      })
    ).toBe("/bills?search=A+%26+B&page=2&tag=a&tag=b&returnTo=%2Fvendors%2Fv1%3Ftab%3DBills");
  });
});
