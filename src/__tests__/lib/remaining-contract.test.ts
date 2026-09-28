import { describe, expect, it } from "vitest";
import {
  assembleInvoiceContractBilling,
  computeRemainingContract,
  contractBillingSummary,
  invoiceCountsAsAlreadyInvoiced,
  sumInvoicedExcludingTax,
} from "@/lib/financial/remaining-contract";

describe("computeRemainingContract", () => {
  it("equals revised contract minus the amount already invoiced excluding tax", () => {
    expect(
      computeRemainingContract({
        originalContract: 138_500,
        approvedChangeOrders: 10_150,
        invoicedExcludingTax: 108_441.12,
      })
    ).toEqual({
      revisedContract: 148_650,
      remainingContract: 40_208.88,
    });
  });

  it("does not floor an overbilled contract at zero", () => {
    expect(
      computeRemainingContract({
        originalContract: 1_000,
        approvedChangeOrders: 0,
        invoicedExcludingTax: 1_500.25,
      })
    ).toEqual({
      revisedContract: 1_000,
      remainingContract: -500.25,
    });
  });

  it("rounds each side to cents before subtracting", () => {
    expect(
      computeRemainingContract({
        originalContract: 100.004,
        approvedChangeOrders: 0.001,
        invoicedExcludingTax: 40.005,
      })
    ).toEqual({
      revisedContract: 100,
      remainingContract: 59.99,
    });
  });
});

describe("sumInvoicedExcludingTax", () => {
  it("uses subtotals and skips drafts, voids, and the invoice being edited", () => {
    expect(invoiceCountsAsAlreadyInvoiced("Draft")).toBe(false);
    expect(invoiceCountsAsAlreadyInvoiced("Void")).toBe(false);
    expect(invoiceCountsAsAlreadyInvoiced("Sent")).toBe(true);

    const total = sumInvoicedExcludingTax(
      [
        { id: "sent", status: "Sent", subtotal: 100, tax_amount: 4.71, total: 104.71 },
        { id: "draft", status: "Draft", subtotal: 999, total: 999 },
        { id: "void", status: "Void", subtotal: 80, total: 80 },
        { id: "current", status: "Sent", subtotal: 50, taxAmount: 2, total: 52 },
        { id: "fallback", status: "Paid", total: 25, tax_amount: 5 },
      ],
      { excludeInvoiceId: "current" }
    );

    expect(total).toBe(120);
  });
});

describe("contractBillingSummary", () => {
  it("includes this invoice ex-tax subtotal in billed to date and remaining", () => {
    const summary = contractBillingSummary({
      originalContract: 100_000,
      approvedChangeOrders: 0,
      previouslyInvoicedExcludingTax: 100,
      thisInvoiceExcludingTax: 49.98,
    });

    expect(summary.revisedContract).toBe(100_000);
    expect(summary.billedToDateExcludingTax).toBe(149.98);
    expect(summary.remainingContract).toBe(99_850.02);
    expect(summary.billedToDatePercent).toBe(0);
  });

  it("leaves the percent empty when the revised contract is zero", () => {
    expect(
      contractBillingSummary({
        originalContract: 0,
        approvedChangeOrders: 0,
        previouslyInvoicedExcludingTax: 10,
        thisInvoiceExcludingTax: 0,
      }).billedToDatePercent
    ).toBeNull();
  });
});

describe("assembleInvoiceContractBilling", () => {
  it("adds approved change-order contract amounts and prior ex-tax invoices", () => {
    const assembled = assembleInvoiceContractBilling({
      originalContract: "100000",
      approvedChangeOrders: [{ total: 10_150 }, { total: null, total_amount: 25.5 }],
      invoices: [
        { id: "prior", status: "Sent", subtotal: 400, tax_amount: 18.85, total: 418.85 },
        { id: "open", status: "Draft", subtotal: 49.98, total: 52.33 },
      ],
      excludeInvoiceId: "open",
    });

    expect(assembled).toEqual({
      originalContract: 100_000,
      approvedChangeOrders: 10_175.5,
      previouslyInvoicedExcludingTax: 400,
    });
  });
});
