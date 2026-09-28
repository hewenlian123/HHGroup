import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/financial-nav-prefetch.ts"), "utf8");

describe("Phase 4 financial navigation prefetch", () => {
  it("does not duplicate the server-provided Expenses initial graph in the browser", () => {
    expect(source).not.toContain("prefetchExpensesPageData");
    expect(source).not.toContain("fetchExpenses");
    expect(source).not.toContain("fetchExpenseCategories");
  });

  it("keeps the separate receipt queue intent prefetch", () => {
    expect(source).toContain("prefetchReceiptQueuePageData");
    expect(source).toContain("fetchReceiptQueue");
  });
});
