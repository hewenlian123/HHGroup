import { describe, it, expect } from "vitest";
import {
  getLaborPaymentStatus,
  isLaborUnpaidForWorkerPayroll,
  laborPayrollDisplayStatus,
  laborPayrollSettlementModeFromSelectList,
  laborPaymentStatusUiLabel,
  laborSessionLabel,
} from "@/lib/labor-balance-shared";

describe("labor-balance-shared", () => {
  it("laborPayrollSettlementModeFromSelectList detects worker_payment_id column", () => {
    expect(laborPayrollSettlementModeFromSelectList("id, worker_payment_id")).toBe("payment_link");
    expect(laborPayrollSettlementModeFromSelectList("id, status")).toBe("status_fallback");
  });

  it("payment_link: unpaid follows worker_payment_id only (ignores status paid)", () => {
    expect(isLaborUnpaidForWorkerPayroll(null, null, "payment_link")).toBe(true);
    expect(isLaborUnpaidForWorkerPayroll("", null, "payment_link")).toBe(true);
    expect(isLaborUnpaidForWorkerPayroll("Approved", null, "payment_link")).toBe(true);
    expect(isLaborUnpaidForWorkerPayroll("paid", null, "payment_link")).toBe(true);
    expect(isLaborUnpaidForWorkerPayroll("PAID", null, "payment_link")).toBe(true);
    expect(isLaborUnpaidForWorkerPayroll("Approved", "pay-uuid", "payment_link")).toBe(false);
    expect(isLaborUnpaidForWorkerPayroll("paid", "pay-uuid", "payment_link")).toBe(false);
  });

  it("status_fallback: legacy paid without worker_payment_id is settled", () => {
    expect(isLaborUnpaidForWorkerPayroll("paid", null, "status_fallback")).toBe(false);
    expect(isLaborUnpaidForWorkerPayroll("PAID", null, "status_fallback")).toBe(false);
    expect(isLaborUnpaidForWorkerPayroll("Approved", null, "status_fallback")).toBe(true);
  });

  it("default mode is payment_link (orphan status=paid without FK is unpaid)", () => {
    expect(isLaborUnpaidForWorkerPayroll("paid", null)).toBe(true);
  });

  it("laborPayrollDisplayStatus aligns with isLaborUnpaid (no partial yet)", () => {
    expect(laborPayrollDisplayStatus("paid", null, "payment_link")).toBe("unpaid");
    expect(laborPayrollDisplayStatus("Approved", "x", "payment_link")).toBe("paid");
    expect(laborPayrollDisplayStatus("paid", null, "status_fallback")).toBe("paid");
  });

  it("getLaborPaymentStatus is the UI entry point (payment_link ignores workflow status)", () => {
    expect(getLaborPaymentStatus(null, "paid", "payment_link")).toBe("unpaid");
    expect(getLaborPaymentStatus("pid", "Draft", "payment_link")).toBe("paid");
    expect(getLaborPaymentStatus(null, "paid", "status_fallback")).toBe("paid");
    expect(laborPaymentStatusUiLabel("paid")).toBe("paid");
    expect(laborPaymentStatusUiLabel("unpaid")).toBe("unpaid");
  });

  it("laborSessionLabel matches morning/afternoon flags", () => {
    expect(laborSessionLabel({ morning: true, afternoon: true })).toBe("Full day");
    expect(laborSessionLabel({ morning: true, afternoon: false })).toBe("Morning");
    expect(laborSessionLabel({ morning: false, afternoon: true })).toBe("Afternoon");
    expect(laborSessionLabel({ morning: false, afternoon: false })).toBe(null);
    expect(laborSessionLabel({})).toBe(null);
  });
});
