import { describe, expect, it } from "vitest";
import {
  buildExpenseHeaderAmountPatchFromLines,
  computeExpenseHeaderAmountFromLines,
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
