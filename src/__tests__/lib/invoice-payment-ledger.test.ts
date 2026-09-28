import { describe, expect, it } from "vitest";
import { buildInvoicePaymentLedger } from "@/lib/financial/invoice-payment-ledger";

describe("buildInvoicePaymentLedger", () => {
  it("reduces the running balance by each posted payment in date order", () => {
    const rows = buildInvoicePaymentLedger(225, [
      {
        id: "b",
        date: "2026-09-02",
        amount: 125,
        method: "ACH",
        reference: "ACH-2",
        voided: false,
      },
      {
        id: "a",
        date: "2026-09-01",
        amount: 100,
        method: "Check",
        reference: "1042",
        voided: false,
      },
    ]);

    expect(rows.map((row) => [row.id, row.runningBalance])).toEqual([
      ["a", 125],
      ["b", 0],
    ]);
  });

  it("keeps a voided payment on the ledger without changing the balance", () => {
    const rows = buildInvoicePaymentLedger(100, [
      {
        id: "posted",
        date: "2026-09-01",
        amount: 40,
        method: "Cash",
        reference: "",
        voided: false,
      },
      {
        id: "voided",
        date: "2026-09-02",
        amount: 40,
        method: "Cash",
        reference: "void",
        voided: true,
      },
    ]);

    expect(rows.map((row) => row.runningBalance)).toEqual([60, 60]);
  });

  it("rounds payment amounts to cents before subtracting", () => {
    const rows = buildInvoicePaymentLedger(10, [
      {
        id: "cents",
        date: "2026-09-01",
        amount: 0.015,
        method: "ACH",
        reference: "",
        voided: false,
      },
    ]);

    expect(rows[0]?.runningBalance).toBe(9.98);
  });

  it("floors the running balance at zero when posted payments cover the invoice", () => {
    const rows = buildInvoicePaymentLedger(50, [
      {
        id: "full",
        date: "2026-09-01",
        amount: 80,
        method: "Wire",
        reference: "",
        voided: false,
      },
    ]);

    expect(rows[0]?.runningBalance).toBe(0);
  });
});
