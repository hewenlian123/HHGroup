import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  detectKnownVendor,
  parseDateFromText,
  parseAmountProduction,
  mergeReceiptOcrResults,
  type ReceiptOcrResult,
} from "@/lib/receipt-ocr-client";

describe("receipt OCR helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("detectKnownVendor recognizes big-box and regional Hawaii merchants", () => {
    expect(detectKnownVendor("THE HOME DEPOT #4711")).toBe("Home Depot");
    expect(detectKnownVendor("LOWE'S HOME")).toBe("Lowe's");
    expect(detectKnownVendor("COSTCO WHOLESALE")).toBe("Costco");
    expect(detectKnownVendor("Walmart Supercenter")).toBe("Walmart");
    expect(detectKnownVendor("City Mill — Honolulu")).toBe("City Mill");
    expect(detectKnownVendor("Hardware Hawaii Kona")).toBe("Hardware Hawaii");
    expect(detectKnownVendor("Shell Fuel")).toBe("Gas station");
  });

  it("parseDateFromText handles common US formats", () => {
    expect(parseDateFromText("Purchased 03/15/2025")).toBe("2025-03-15");
    expect(parseDateFromText("05-02-2025")).toBe("2025-05-02");
    const yy = parseDateFromText("Sale date 5/2/24");
    expect(yy).toBe("2024-05-02");
  });

  it("parseAmountProduction prefers final total over subtotal", () => {
    const text = "Subtotal $50.00\nTax $4.00\nTotal $54.00";
    const r = parseAmountProduction(text, "Home Depot");
    expect(r.amount).toBe(54);
    expect(r.confidence).toBe("high");
  });

  it("parseAmountProduction Home Depot fixture: picks TOTAL over SUBTOTAL and SALES TAX lines", () => {
    const text = `
THE HOME DEPOT #1247
SUBTOTAL $112.34
SALES TAX $9.02
TOTAL $121.36
Thank you for shopping
`;
    const r = parseAmountProduction(text, "Home Depot");
    expect(r.amount).toBe(121.36);
    expect(r.amount).not.toBe(112.34);
    expect(r.amount).not.toBe(9.02);
  });

  it("parseAmountProduction Costco fixture: GRAND TOTAL beats SUBTOTAL + TAX", () => {
    const text = `
COSTCO WHOLESALE #1081
MEMBER 1234
SUBTOTAL 89.99
TAX 7.65
GRAND TOTAL $97.64
`;
    const r = parseAmountProduction(text, "Costco");
    expect(r.amount).toBe(97.64);
  });

  it("parseAmountProduction Lowe's fixture: AMOUNT DUE is the payable total", () => {
    const text = `
LOWE'S #2891
SUBTOTAL $45.00
SALES TAX $3.60
AMOUNT DUE $48.60
`;
    const r = parseAmountProduction(text, "Lowe's");
    expect(r.amount).toBe(48.6);
  });

  it("parseAmountProduction gas receipt: FUEL / TOTAL should not use subtotal alone", () => {
    const text = `
SHELL 4578
PUMP 3  REG  $3.99/GAL
FUEL 10.5 GAL
SUBTOTAL $42.10
TAX $0.00
TOTAL $42.10
`;
    const r = parseAmountProduction(text, "Gas station");
    expect(r.amount).toBe(42.1);
  });

  it("parseAmountProduction Hardware Hawaii: does not take subtotal as final", () => {
    const text = `
HARDWARE HAWAII - HILO
SUBTOTAL $28.00
GE TAX $1.40
TOTAL $29.40
`;
    const r = parseAmountProduction(text, "Hardware Hawaii");
    expect(r.amount).toBe(29.4);
  });

  it("mergeReceiptOcrResults sets needsReview when field confidence is not all high", () => {
    const ocr: ReceiptOcrResult = {
      vendor_name: "Home Depot",
      total_amount: 0,
      purchase_date: "2025-01-15",
      raw_text: "HOME DEPOT\nTotal $19.99",
      confidence: { vendor: "high", amount: "medium", date: "high" },
    };
    const merged = mergeReceiptOcrResults([{ result: ocr, source: "cloud" }], {
      inferCategory: () => "Materials",
    });
    expect(merged.needsReview).toBe(true);
  });

  it("mergeReceiptOcrResults: needsReview stays true when date rule confidence remains medium (API date high does not upgrade merged date tier)", () => {
    const ocr: ReceiptOcrResult = {
      vendor_name: "Costco Wholesale",
      total_amount: 97.64,
      purchase_date: "2025-03-01",
      raw_text: "COSTCO\nGRAND TOTAL $97.64",
      confidence: { vendor: "high", amount: "high", date: "high" },
    };
    const merged = mergeReceiptOcrResults([{ result: ocr, source: "cloud" }], {
      inferCategory: () => "Materials",
    });
    expect(merged.vendorConfidence).toBe("high");
    expect(merged.amountConfidence).toBe("high");
    expect(merged.dateConfidence).toBe("medium");
    expect(merged.needsReview).toBe(true);
  });
});
