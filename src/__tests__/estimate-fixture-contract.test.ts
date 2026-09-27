import { describe, expect, it } from "vitest";

describe("Estimate historical Playwright fixture contracts", () => {
  it("owns the exact immutable EST-0063 financial ledger", async () => {
    const fixture = await import("../../tests/estimate-financial-fixture");

    expect(fixture.ESTIMATE_FINANCIAL_FIXTURE_ID).toBe("bef76a22-bbc3-4af6-a886-625f0d756805");
    expect(fixture.ESTIMATE_FINANCIAL_FIXTURE_NUMBER).toBe("EST-0063");
    expect(fixture.ESTIMATE_FINANCIAL_FIXTURE_BASELINE).toEqual({
      subtotal: "$1,020.01",
      tax: "$48.06",
      discount: "$106.81",
      total: "$961.26",
      deposit: "$384.50",
      final: "$576.76",
      remaining: "$0.00",
    });
    expect(fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER).toEqual({
      subtotal: 1020.01,
      tax: 48.06,
      discount: 106.81,
      total: 961.26,
      deposit: 384.5,
      final: 576.76,
      remaining: 0,
    });
    expect(
      fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.subtotal +
        fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.tax -
        fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.discount
    ).toBe(fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.total);
    expect(
      fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.deposit +
        fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.final
    ).toBe(fixture.ESTIMATE_FINANCIAL_FIXTURE_LEDGER.total);
  });

  it("owns a separate editable Estimate with two ordered sections and lines", async () => {
    const fixture = await import("../../tests/estimate-populated-editable-fixture");

    expect(fixture.POPULATED_EDITABLE_ESTIMATE_ID).toBe("a6f7d9b0-8732-4fe1-a2f4-62b77c462004");
    expect(fixture.POPULATED_EDITABLE_ESTIMATE_NUMBER).toBe("[E2E]-EST-POP-004");
    expect(fixture.POPULATED_EDITABLE_SECTION_COUNT).toBeGreaterThanOrEqual(2);
    expect(fixture.POPULATED_EDITABLE_LINE_ITEM_COUNT).toBeGreaterThanOrEqual(2);
  });
});
