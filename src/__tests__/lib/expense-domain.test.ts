import { describe, expect, it } from "vitest";

import {
  defaultExpenseListSort,
  getExpenseTotal,
  isDefaultExpenseListSort,
} from "@/lib/expense-domain";

describe("expense domain primitives", () => {
  it("preserves the canonical line-sum total and default sort semantics", () => {
    expect(
      getExpenseTotal({
        lines: [{ amount: 12.34 }, { amount: -2.34 }, { amount: 5 }],
      })
    ).toBe(15);
    expect(defaultExpenseListSort).toEqual({ field: "date", order: "desc" });
    expect(isDefaultExpenseListSort(defaultExpenseListSort)).toBe(true);
    expect(isDefaultExpenseListSort({ field: "amount", order: "desc" })).toBe(false);
  });
});
