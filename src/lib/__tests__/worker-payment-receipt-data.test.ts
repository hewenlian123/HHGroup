import { describe, expect, it } from "vitest";

import {
  groupReceiptLaborLinesForDisplay,
  type ReceiptLaborLine,
} from "@/lib/worker-payment-receipt-data";

function laborLine(
  id: string,
  workDate: string,
  projectName: string,
  session: string,
  amount: number
): ReceiptLaborLine {
  return { id, workDate, projectName, session, amount };
}

describe("groupReceiptLaborLinesForDisplay", () => {
  it("groups consecutive full-day rows with the same project, session, and daily amount", () => {
    const lines = [
      laborLine("5", "2026-06-05", "673 Kihapai St", "Full day", 100),
      laborLine("1", "2026-06-01", "673 Kihapai St", "Full day", 100),
      laborLine("3", "2026-06-03", "673 Kihapai St", "Full day", 100),
      laborLine("2", "2026-06-02", "673 Kihapai St", "Full day", 100),
      laborLine("4", "2026-06-04", "673 Kihapai St", "Full day", 100),
    ];

    const grouped = groupReceiptLaborLinesForDisplay(lines);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      dateLabel: "Jun 01–Jun 05, 2026",
      projectName: "673 Kihapai St",
      sessionLabel: "5 days",
      amount: 500,
      sourceLineCount: 5,
    });
  });

  it("does not group non-consecutive rows or rows from different projects", () => {
    const grouped = groupReceiptLaborLinesForDisplay([
      laborLine("1", "2026-06-01", "673 Kihapai St", "Full day", 100),
      laborLine("2", "2026-06-02", "Other Project", "Full day", 100),
      laborLine("3", "2026-06-04", "673 Kihapai St", "Full day", 100),
    ]);

    expect(grouped.map((line) => line.dateLabel)).toEqual([
      "Jun 01, 2026",
      "Jun 02, 2026",
      "Jun 04, 2026",
    ]);
    expect(grouped.map((line) => line.amount)).toEqual([100, 100, 100]);
  });

  it("groups AM sessions only with AM sessions and preserves the amount sum", () => {
    const lines = [
      laborLine("1", "2026-06-01", "673 Kihapai St", "Morning", 50),
      laborLine("2", "2026-06-02", "673 Kihapai St", "Morning", 50),
      laborLine("3", "2026-06-03", "673 Kihapai St", "Morning", 50),
      laborLine("4", "2026-06-04", "673 Kihapai St", "Afternoon", 50),
    ];

    const grouped = groupReceiptLaborLinesForDisplay(lines);

    expect(grouped.map((line) => line.sessionLabel)).toEqual(["3 AM sessions", "Half day (PM)"]);
    expect(grouped.map((line) => line.amount)).toEqual([150, 50]);
    expect(grouped.reduce((sum, line) => sum + line.amount, 0)).toBe(
      lines.reduce((sum, line) => sum + line.amount, 0)
    );
  });

  it("does not merge same-day AM and PM into a full day", () => {
    const grouped = groupReceiptLaborLinesForDisplay([
      laborLine("1", "2026-06-01", "673 Kihapai St", "Morning", 50),
      laborLine("2", "2026-06-01", "673 Kihapai St", "Afternoon", 50),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.map((line) => line.sessionLabel)).toEqual(["Half day (AM)", "Half day (PM)"]);
    expect(grouped.map((line) => line.amount)).toEqual([50, 50]);
  });
});
