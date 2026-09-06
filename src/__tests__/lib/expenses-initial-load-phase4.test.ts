import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const dataMocks = vi.hoisted(() => ({
  getExpenses: vi.fn(),
  getExpenseCategories: vi.fn(),
  getWorkers: vi.fn(),
  getSubcontractDeductionOptions: vi.fn(),
  getProjects: vi.fn(),
  getPaymentAccounts: vi.fn(),
}));

vi.mock("@/lib/data", () => dataMocks);

import { defaultExpenseListSort, fetchPaymentAccountNameMap } from "@/lib/expenses-db";
import { loadExpensesInitialData } from "@/lib/financial/expenses-initial-read";

describe("Phase 4 Expenses initial read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.getExpenses.mockResolvedValue([]);
    dataMocks.getExpenseCategories.mockResolvedValue([]);
    dataMocks.getWorkers.mockResolvedValue([]);
    dataMocks.getSubcontractDeductionOptions.mockResolvedValue([]);
    dataMocks.getProjects.mockResolvedValue([]);
    dataMocks.getPaymentAccounts.mockResolvedValue([]);
  });

  it("starts the complete default list bundle with one request-scoped client", async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;

    await expect(loadExpensesInitialData(client)).resolves.toMatchObject({
      sort: defaultExpenseListSort,
      expenses: [],
      categories: [],
      workers: [],
      subcontractDeductionOptions: [],
      projects: [],
      paymentAccounts: [],
    });

    expect(dataMocks.getExpenses).toHaveBeenCalledWith(
      defaultExpenseListSort,
      { includeLinkedBankTx: false },
      client
    );
    expect(dataMocks.getExpenseCategories).toHaveBeenCalledWith(false, client);
    expect(dataMocks.getWorkers).toHaveBeenCalledWith(client);
    expect(dataMocks.getSubcontractDeductionOptions).toHaveBeenCalledWith(client);
    expect(dataMocks.getProjects).toHaveBeenCalledWith(client);
    expect(dataMocks.getPaymentAccounts).toHaveBeenCalledWith(client);
  });

  it("does not serialize fields outside the list bootstrap contract", async () => {
    dataMocks.getProjects.mockResolvedValue([
      { id: "project-1", name: "Alpha", status: "active", budget: 999, address: "private" },
    ]);
    const client = { from: vi.fn() } as unknown as SupabaseClient;

    const result = await loadExpensesInitialData(client);

    expect(result.projects).toEqual([{ id: "project-1", name: "Alpha", status: "active" }]);
  });
});

describe("payment-account fallback batching", () => {
  it("uses at most one bounded retry query for names missing from the first batch", async () => {
    const reads: string[][] = [];
    const client = {
      from(table: string) {
        expect(table).toBe("payment_accounts");
        return {
          select() {
            return {
              async in(_column: string, ids: string[]) {
                reads.push([...ids]);
                return reads.length === 1
                  ? { data: [{ id: "account-a", name: "A" }], error: null }
                  : {
                      data: [
                        { id: "account-b", name: "B" },
                        { id: "account-c", name: "C" },
                      ],
                      error: null,
                    };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const names = await fetchPaymentAccountNameMap(
      ["account-a", "account-b", "account-c", "account-b"],
      client
    );

    expect(reads).toEqual([
      ["account-a", "account-b", "account-c"],
      ["account-b", "account-c"],
    ]);
    expect(Object.fromEntries(names)).toEqual({
      "account-a": "A",
      "account-b": "B",
      "account-c": "C",
    });
  });
});
