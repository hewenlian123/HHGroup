import { describe, expect, it } from "vitest";
import type { DailyWorkEntry } from "@/lib/daily-work-db";
import type { LaborInvoice } from "@/lib/labor-db";
import {
  balanceStatusLabel,
  buildPayrollSummaryRows,
  laborInvoiceLineAmount,
} from "@/app/labor/payroll/compute-payroll-summary-rows";

const workers = [{ id: "w1", name: "Worker One" }];

function baseLaborEntry(over: Partial<DailyWorkEntry> = {}): DailyWorkEntry {
  return {
    id: "e1",
    workDate: "2026-01-15",
    workerId: "w1",
    projectId: "p1",
    dayType: "full_day",
    dailyRate: 200,
    otAmount: 0,
    notes: null,
    createdAt: "2026-01-15T12:00:00Z",
    ...over,
  };
}

function baseLaborInvoice(over: Partial<LaborInvoice> = {}): LaborInvoice {
  return {
    id: "li1",
    invoiceNo: "LI-1",
    workerId: "w1",
    invoiceDate: "2026-01-16",
    amount: 50,
    memo: "",
    projectSplits: [{ projectId: "p1", amount: 50 }],
    status: "confirmed",
    checklist: {
      verifiedWorker: true,
      verifiedAmount: true,
      verifiedAllocation: true,
      verifiedAttachment: true,
    },
    attachments: [],
    createdAt: "2026-01-16T12:00:00Z",
    ...over,
  };
}

describe("buildPayrollSummaryRows", () => {
  it("Earned = laborOwed + worker_invoices + labor_invoices", () => {
    const laborEntries: DailyWorkEntry[] = [
      baseLaborEntry({ dailyRate: 100, dayType: "full_day" }),
    ];
    const rows = buildPayrollSummaryRows({
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      projectFilter: null,
      includeLaborInvoices: true,
      workers,
      laborEntries,
      reimbursementsAll: [],
      workerInvoicesAll: [
        {
          id: "wi1",
          workerId: "w1",
          projectId: "p1",
          amount: 25,
          invoiceFile: null,
          createdAt: "2026-01-10T12:00:00Z",
          status: "unpaid",
        },
      ],
      laborInvoicesAll: [baseLaborInvoice({ amount: 40 })],
      paymentsAll: [],
      advancesAll: [],
    });
    const r = rows.find((x) => x.workerId === "w1");
    expect(r).toBeDefined();
    expect(r!.laborOwed).toBe(100);
    expect(r!.workerInvoices).toBe(25);
    expect(r!.laborInvoices).toBe(40);
    expect(r!.earned).toBe(165);
  });

  it("Paid includes advances in range; Balance = shouldPay - paid", () => {
    const rows = buildPayrollSummaryRows({
      fromDate: "2026-02-01",
      toDate: "2026-02-28",
      projectFilter: null,
      includeLaborInvoices: false,
      workers,
      laborEntries: [],
      reimbursementsAll: [],
      workerInvoicesAll: [],
      laborInvoicesAll: [],
      paymentsAll: [
        {
          id: "pay1",
          workerId: "w1",
          projectId: null,
          paymentDate: "2026-02-10",
          amount: 30,
          paymentMethod: "Cash",
          notes: null,
          createdAt: "2026-02-10T15:00:00.000Z",
          laborEntryIds: null,
        },
      ],
      advancesAll: [
        {
          id: "a1",
          workerId: "w1",
          projectId: null,
          amount: 20,
          advanceDate: "2026-02-12",
          status: "pending",
          notes: null,
          createdAt: "2026-02-12T12:00:00Z",
          createdBy: null,
        },
      ],
    });
    const r = rows[0];
    expect(r.paid).toBe(50);
    expect(r.shouldPay).toBe(0);
    expect(r.balance).toBe(-50);
    expect(balanceStatusLabel(r.balance)).toBe("Overpaid");
  });

  it("Should pay = Earned + Reimbursements", () => {
    const rows = buildPayrollSummaryRows({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      projectFilter: null,
      includeLaborInvoices: false,
      workers,
      laborEntries: [
        baseLaborEntry({ workDate: "2026-03-05", dailyRate: 80, dayType: "full_day" }),
      ],
      reimbursementsAll: [
        {
          id: "rb1",
          workerId: "w1",
          projectId: "p1",
          amount: 15,
          vendor: null,
          description: "gas",
          receiptUrl: null,
          status: "pending",
          createdAt: "2026-03-06T12:00:00Z",
          paidAt: null,
        },
      ],
      workerInvoicesAll: [],
      laborInvoicesAll: [],
      paymentsAll: [],
      advancesAll: [],
    });
    const r = rows[0];
    expect(r.earned).toBe(80);
    expect(r.reimbursements).toBe(15);
    expect(r.shouldPay).toBe(95);
    expect(r.balance).toBe(95);
    expect(balanceStatusLabel(r.balance)).toBe("Unpaid");
  });

  it("balanceStatusLabel: Balanced / Unpaid / Overpaid by rounded cents", () => {
    expect(balanceStatusLabel(0)).toBe("Balanced");
    // Round to cents: sub-cent noise treated as balanced
    expect(balanceStatusLabel(0.001)).toBe("Balanced");
    expect(balanceStatusLabel(0.004)).toBe("Balanced");
    expect(balanceStatusLabel(0.01)).toBe("Unpaid");
    expect(balanceStatusLabel(-0.01)).toBe("Overpaid");
    expect(balanceStatusLabel(0.005)).toBe("Unpaid"); // half-cent rounds up to $0.01
  });

  it("excludes cancelled advances from Paid", () => {
    const rows = buildPayrollSummaryRows({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      projectFilter: null,
      includeLaborInvoices: false,
      workers,
      laborEntries: [],
      reimbursementsAll: [],
      workerInvoicesAll: [],
      laborInvoicesAll: [],
      paymentsAll: [],
      advancesAll: [
        {
          id: "a2",
          workerId: "w1",
          projectId: null,
          amount: 999,
          advanceDate: "2026-04-10",
          status: "cancelled",
          notes: null,
          createdAt: "2026-04-10T12:00:00Z",
          createdBy: null,
        },
      ],
    });
    expect(rows.find((x) => x.workerId === "w1")).toBeUndefined();
  });
});

describe("laborInvoiceLineAmount", () => {
  it("returns 0 when includeLaborInvoices is false", () => {
    const inv = baseLaborInvoice();
    expect(laborInvoiceLineAmount(inv, "2026-01-01", "2026-01-31", null, false)).toBe(0);
  });

  it("sums split amounts for project filter", () => {
    const inv = baseLaborInvoice({
      projectSplits: [
        { projectId: "p1", amount: 10 },
        { projectId: "p2", amount: 90 },
      ],
      amount: 100,
    });
    expect(laborInvoiceLineAmount(inv, "2026-01-01", "2026-01-31", "p2", true)).toBe(90);
  });
});
