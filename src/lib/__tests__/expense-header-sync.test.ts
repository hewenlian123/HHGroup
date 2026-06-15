import { describe, expect, it } from "vitest";
import {
  buildExpenseHeaderAmountPatchFromLines,
  computeExpenseHeaderAmountFromLines,
  expenseStatusShouldSyncHeaderFromLines,
  syncExpenseHeaderAmountFromLinesWithClient,
} from "@/lib/expenses-db";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("expense header amount sync", () => {
  it("uses OCR/review line amount updates when computing the synced header total", () => {
    const amount = computeExpenseHeaderAmountFromLines(
      [{ id: "line-1", amount: 0.01, total: null }],
      { lineId: "line-1", amount: 48 }
    );

    expect(amount).toBe(48);
    expect(
      buildExpenseHeaderAmountPatchFromLines([{ id: "line-1", amount: 0.01 }], {
        lineId: "line-1",
        amount: 48,
      })
    ).toEqual({ amount: 48, total: 48 });
  });

  it("syncs a multi-line expense header to the sum of every line item", () => {
    const amount = computeExpenseHeaderAmountFromLines(
      [
        { id: "line-1", amount: 25.25 },
        { id: "line-2", amount: 100 },
        { id: "line-3", total: 12.43 },
      ],
      { lineId: "line-2", amount: 930.31 }
    );

    expect(amount).toBe(967.99);
  });

  it("treats confirmed expense statuses as requiring header sync before promotion", () => {
    expect(expenseStatusShouldSyncHeaderFromLines("approved")).toBe(true);
    expect(expenseStatusShouldSyncHeaderFromLines("reviewed")).toBe(true);
    expect(expenseStatusShouldSyncHeaderFromLines("paid")).toBe(true);

    expect(expenseStatusShouldSyncHeaderFromLines("needs_review")).toBe(false);
    expect(expenseStatusShouldSyncHeaderFromLines("reimbursed")).toBe(false);
    expect(expenseStatusShouldSyncHeaderFromLines("draft")).toBe(false);
    expect(expenseStatusShouldSyncHeaderFromLines(null)).toBe(false);
  });

  it("does not build a header update when an expense has no lines", () => {
    expect(computeExpenseHeaderAmountFromLines([])).toBeNull();
    expect(buildExpenseHeaderAmountPatchFromLines([])).toBeNull();
  });

  it("updates the expense header amount and total from all line rows", async () => {
    const updates: Array<{ table: string; payload: Record<string, number> }> = [];
    const client = {
      from(table: string) {
        if (table === "expense_lines") {
          return {
            select() {
              return {
                async eq() {
                  return {
                    data: [
                      { id: "line-1", amount: 10 },
                      { id: "line-2", amount: 20 },
                    ],
                    error: null,
                  };
                },
              };
            },
          };
        }

        return {
          update(payload: Record<string, number>) {
            updates.push({ table, payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return { data: { id: "expense-1" }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(syncExpenseHeaderAmountFromLinesWithClient(client, "expense-1")).resolves.toBe(30);
    expect(updates).toEqual([{ table: "expenses", payload: { amount: 30, total: 30 } }]);
  });

  it("syncs stale placeholder and post-deploy mismatch headers to the live line sum", async () => {
    const updates: Array<{ table: string; payload: Record<string, number> }> = [];
    const client = {
      from(table: string) {
        if (table === "expense_lines") {
          return {
            select() {
              return {
                async eq() {
                  return {
                    data: [{ id: "line-1", amount: 323.54, total: 323.54 }],
                    error: null,
                  };
                },
              };
            },
          };
        }

        return {
          update(payload: Record<string, number>) {
            updates.push({ table, payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return { data: { id: "expense-home-depot" }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(
      syncExpenseHeaderAmountFromLinesWithClient(client, "expense-home-depot")
    ).resolves.toBe(323.54);
    expect(updates).toEqual([{ table: "expenses", payload: { amount: 323.54, total: 323.54 } }]);
  });

  it("syncs the header to the remaining line sum after a line delete", async () => {
    const updates: Array<{ table: string; payload: Record<string, number> }> = [];
    const client = {
      from(table: string) {
        if (table === "expense_lines") {
          return {
            select() {
              return {
                async eq() {
                  return {
                    data: [
                      { id: "line-remaining-1", amount: 100 },
                      { id: "line-remaining-2", amount: 223.54 },
                    ],
                    error: null,
                  };
                },
              };
            },
          };
        }

        return {
          update(payload: Record<string, number>) {
            updates.push({ table, payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return { data: { id: "expense-1" }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(syncExpenseHeaderAmountFromLinesWithClient(client, "expense-1")).resolves.toBe(
      323.54
    );
    expect(updates).toEqual([{ table: "expenses", payload: { amount: 323.54, total: 323.54 } }]);
  });

  it("skips the expense header update when there are no line rows to sum", async () => {
    const updates: Array<Record<string, number>> = [];
    const client = {
      from(table: string) {
        if (table === "expense_lines") {
          return {
            select() {
              return {
                async eq() {
                  return { data: [], error: null };
                },
              };
            },
          };
        }

        return {
          update(payload: Record<string, number>) {
            updates.push(payload);
            return {
              eq() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return { data: { id: "expense-1" }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(
      syncExpenseHeaderAmountFromLinesWithClient(client, "expense-1")
    ).resolves.toBeNull();
    expect(updates).toEqual([]);
  });
});
