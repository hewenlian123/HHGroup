import { describe, expect, it } from "vitest";
import {
  summarizeSubcontractFinancials,
  summarizeSubcontractorFinancials,
} from "@/lib/subcontractor-financials";

describe("subcontractor financial summaries", () => {
  it("separates commitment, billed amount, paid amount, AP outstanding, and remaining contract", () => {
    const summary = summarizeSubcontractFinancials({
      contractAmount: 1000,
      bills: [
        { amount: 200, status: "Approved" },
        { amount: 100, status: "Paid" },
        { amount: 50, status: "Pending" },
        { amount: 25, status: "Void" },
      ],
      payments: [{ amount: 125 }],
    });

    expect(summary.contractAmount).toBe(1000);
    expect(summary.billedToDate).toBe(300);
    expect(summary.paidToDate).toBe(125);
    expect(summary.apOutstanding).toBe(175);
    expect(summary.remainingContract).toBe(700);
  });

  it("keeps contract amount as committed cost only and does not imply project actual cost", () => {
    const summary = summarizeSubcontractorFinancials({
      contracts: [
        { id: "subcontract-1", contractAmount: 800 },
        { id: "subcontract-2", contractAmount: 500 },
      ],
      bills: [{ subcontractId: "subcontract-1", amount: 250, status: "Approved" }],
      payments: [{ subcontractId: "subcontract-1", amount: 75 }],
    });

    expect(summary.contractAmount).toBe(1300);
    expect(summary.billedToDate).toBe(250);
    expect(summary.paidToDate).toBe(75);
    expect(summary.apOutstanding).toBe(175);
    expect(summary.remainingContract).toBe(1050);
  });

  it("uses linked AP bills as canonical and does not double-count legacy subcontract bills", () => {
    const summary = summarizeSubcontractFinancials({
      contractAmount: 1000,
      scheduleItems: [{ amount: 600, status: "draft" }],
      apBills: [
        {
          id: "ap-1",
          amount: 400,
          paidAmount: 125,
          balanceAmount: 275,
          status: "Partially Paid",
        },
      ],
      bills: [{ amount: 400, status: "Approved" }],
      payments: [{ amount: 125 }],
      remainingBasis: "scheduledOrBilled",
    });

    expect(summary.contractAmount).toBe(1000);
    expect(summary.scheduledAmount).toBe(600);
    expect(summary.billedToDate).toBe(400);
    expect(summary.paidToDate).toBe(125);
    expect(summary.apOutstanding).toBe(275);
    expect(summary.remainingContract).toBe(400);
  });

  it("counts linked AP bills once even when the schedule item points at the same bill", () => {
    const summary = summarizeSubcontractFinancials({
      contractAmount: 1000,
      scheduleItems: [{ amount: 500, status: "billed", apBillId: "ap-1" }],
      apBills: [
        {
          id: "ap-1",
          amount: 500,
          paidAmount: 200,
          balanceAmount: 300,
          status: "Partially Paid",
        },
      ],
      remainingBasis: "scheduledOrBilled",
    });

    expect(summary.scheduledAmount).toBe(500);
    expect(summary.billedToDate).toBe(500);
    expect(summary.paidToDate).toBe(200);
    expect(summary.apOutstanding).toBe(300);
    expect(summary.remainingContract).toBe(500);
  });

  it("derives paid and outstanding from partial AP payments", () => {
    const summary = summarizeSubcontractFinancials({
      contractAmount: 1000,
      apBills: [
        {
          id: "ap-partial",
          amount: 300,
          paidAmount: 80,
          balanceAmount: 220,
          status: "Partially Paid",
        },
      ],
    });

    expect(summary.billedToDate).toBe(300);
    expect(summary.paidToDate).toBe(80);
    expect(summary.apOutstanding).toBe(220);
    expect(summary.remainingContract).toBe(700);
  });
});
