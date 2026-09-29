import { describe, expect, it } from "vitest";
import {
  computeInvoiceTotals,
  formatMoneyInput,
  invoiceLineQty,
  invoiceRevenueExTax,
  lineExtension,
  moneyToCents,
  paymentCollectedExTax,
} from "@/lib/money";
import { collectedAllocationCents } from "@/lib/payment-allocation";
import { computeEstimatePricing } from "@/lib/estimate-totals";
import {
  canonicalWorkerDailyRate,
  displayedWorkerDailyRate,
  overtimePayAmount,
} from "@/lib/worker-daily-rate";
import { laborEntryCountsTowardCanonicalCost } from "@/lib/labor-cost-eligibility";

describe("invoice cent rounding", () => {
  it("rounds each line to cents before summing tax", () => {
    const totals = computeInvoiceTotals(
      [
        { qty: 1, unitPrice: 4438.29 },
        { qty: 2.5, unitPrice: 19.99 },
      ],
      4.712
    );
    expect(lineExtension(2.5, 19.99)).toBe(49.98);
    expect(totals.subtotal).toBe(4488.27);
    expect(totals.taxAmount).toBe(211.49);
    expect(totals.total).toBe(4699.76);
    expect(moneyToCents(totals.total)).toBe(469976);
  });

  it("reads the written qty when the quantity copy is still the default", () => {
    expect(invoiceLineQty({ qty: 2.5, quantity: 1 })).toBe(2.5);
    expect(invoiceLineQty({ quantity: 2.5 })).toBe(2.5);
    expect(invoiceLineQty({})).toBe(0);
  });

  it("formats payment amounts without binary dust", () => {
    expect(formatMoneyInput(2710.2200000000003)).toBe("2710.22");
  });

  it("excludes sales tax from invoiced revenue and collected cash", () => {
    const invoice = { subtotal: 100, tax_amount: 8, total: 108 };
    expect(invoiceRevenueExTax(invoice)).toBe(100);
    expect(paymentCollectedExTax(108, invoice)).toBe(100);
    expect(paymentCollectedExTax(54, invoice)).toBe(50);
  });

  it("counts only invoice allocations, so an unapplied receipt stays off the invoice", () => {
    expect(
      collectedAllocationCents([{ amount: 40, status: "Posted", paymentReceivedId: "linked" }])
    ).toBe(4000);
    expect(
      collectedAllocationCents([
        { amount: 40, status: "Posted", paymentReceivedId: "linked" },
        { amount: 25, status: "Posted", paymentReceivedId: "unapplied" },
      ])
    ).toBe(6500);
    expect(collectedAllocationCents([{ amount: -100, status: "void" }])).toBe(0);
  });
});

describe("estimate discount then tax", () => {
  it("applies a rate to the discounted subtotal", () => {
    const pricing = computeEstimatePricing({
      subtotal: 1000,
      discount: 100,
      tax: 250,
      taxRatePct: 10,
    });
    expect(pricing.taxableBase).toBe(900);
    expect(pricing.tax).toBe(90);
    expect(pricing.total).toBe(990);
  });

  it("keeps a legacy fixed tax when no rate is stored", () => {
    const pricing = computeEstimatePricing({
      subtotal: 110,
      discount: 2.5,
      tax: 7.5,
    });
    expect(pricing.total).toBe(115);
  });
});

describe("worker daily rate and overtime", () => {
  it("does not double a listed day rate stored as half_day_rate", () => {
    expect(canonicalWorkerDailyRate({ dailyRate: 200, halfDayRate: 100 })).toBe(100);
    expect(canonicalWorkerDailyRate({ dailyRate: 200, halfDayRate: 200 })).toBe(200);
    expect(
      displayedWorkerDailyRate({
        dailyRate: 200,
        halfDayRate: 100,
        historyDailyRate: 200,
      })
    ).toBe(100);
  });

  it("prices overtime hours at 1.5x hourly when no OT rate is stored", () => {
    expect(overtimePayAmount(200, 2, null)).toBe(75);
    expect(overtimePayAmount(200, 2, 40)).toBe(80);
  });

  it("counts draft labor toward cost and skips paid or void", () => {
    expect(laborEntryCountsTowardCanonicalCost("Draft")).toBe(true);
    expect(laborEntryCountsTowardCanonicalCost("Submitted")).toBe(true);
    expect(laborEntryCountsTowardCanonicalCost("Paid")).toBe(false);
    expect(laborEntryCountsTowardCanonicalCost("void")).toBe(false);
  });
});
