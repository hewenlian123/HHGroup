import { describe, expect, it } from "vitest";

import {
  formatOverviewMoney,
  formatOverviewPercent,
  mostUrgentOverdueInvoice,
  overviewCostLines,
  overviewCostLinesCoverActual,
} from "@/lib/financial/project-overview-display";
import type { InvoiceWithDerived } from "@/lib/invoices-db";

const snapshot = {
  laborCost: 24180,
  expenseCost: 22917.85,
  subcontractCost: 12400,
  reimbursementCost: 612.47,
  commissionCost: 1732.03,
  apCost: 0,
  changeOrderCost: 0,
  actualCost: 61842.35,
};

describe("project overview display", () => {
  it("lists snapshot cost categories without inventing a budget", () => {
    const lines = overviewCostLines(snapshot, null);
    expect(lines.map((line) => line.label)).toEqual([
      "Labor",
      "Expenses",
      "Subcontracts",
      "Reimbursements",
      "Commission",
    ]);
    expect(lines.every((line) => line.budget == null)).toBe(true);
    expect(overviewCostLinesCoverActual(lines, snapshot.actualCost)).toBe(true);
  });

  it("attaches only the stored labor budget and keeps non-zero AP in the total", () => {
    const lines = overviewCostLines({ ...snapshot, apCost: 40, actualCost: 61882.35 }, 38400);
    expect(lines.find((line) => line.label === "Labor")?.budget).toBe(38400);
    expect(lines.find((line) => line.label === "AP")?.actual).toBe(40);
    expect(lines.find((line) => line.label === "Expenses")?.budget).toBeNull();
    expect(overviewCostLinesCoverActual(lines, 61882.35)).toBe(true);
  });

  it("formats money with cents and a true minus", () => {
    expect(formatOverviewMoney(148650)).toBe("$148,650.00");
    expect(formatOverviewMoney(-1240)).toBe("−$1,240.00");
    expect(formatOverviewMoney(4650, { sign: "always" })).toBe("+$4,650.00");
    expect(formatOverviewMoney(Number.NaN)).toBe("—");
    expect(formatOverviewPercent(31.4)).toBe("31.4%");
  });

  it("picks the overdue invoice with the greatest existing days-overdue count", () => {
    const invoices = [
      { computedStatus: "Overdue", daysOverdue: 4, balanceDue: 100 },
      { computedStatus: "Paid", daysOverdue: 0, balanceDue: 0 },
      { computedStatus: "Overdue", daysOverdue: 16, balanceDue: 14794.29 },
      { computedStatus: "Overdue", daysOverdue: 30, balanceDue: 0 },
    ] as InvoiceWithDerived[];
    expect(mostUrgentOverdueInvoice(invoices)?.daysOverdue).toBe(16);
    expect(mostUrgentOverdueInvoice([])).toBeNull();
  });
});
