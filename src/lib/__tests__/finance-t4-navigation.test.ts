import { describe, expect, it } from "vitest";
import { financeBillEditReturn, financeRecordPath } from "../finance-navigation";

describe("T4 workspace record context", () => {
  it("opens and closes a record without changing filters, page, selection or source", () => {
    const origin =
      "/financial/payables?tab=payments&page=2&search=A%26B&selectedRecord=existing&returnTo=%2Fvendors%2Fv1%3Ftab%3Dbills";
    const opened = financeRecordPath(origin, "billDetail", "bill-1");
    expect(new URL(opened, "http://hh.local").searchParams.get("billDetail")).toBe("bill-1");
    expect(financeRecordPath(opened, "billDetail", null)).toBe(origin);
  });
  it("returns an edited drawer bill to its workspace, while retaining full-page behavior", () => {
    const origin = "/bills?search=TEST&page=2&billDetail=bill-1";
    expect(financeBillEditReturn("bill-1", origin)).toBe(origin);
    expect(financeBillEditReturn("bill-1", "/bills?search=TEST")).toBe(
      "/bills/bill-1?returnTo=%2Fbills%3Fsearch%3DTEST"
    );
    expect(financeBillEditReturn("bill-1", "https://outside.example")).toBe("/bills/bill-1");
  });
});
