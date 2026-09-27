import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/expense-options-db", () => ({
  expenseOptionsTableAvailable: vi.fn().mockResolvedValue(false),
}));

import { getPaymentAccountsForExpensePicker } from "@/lib/payment-accounts-db";

function clientWithResult(data: unknown, error: { message: string } | null): SupabaseClient {
  return {
    from: () => ({ select: () => ({ order: async () => ({ data, error }) }) }),
  } as unknown as SupabaseClient;
}

describe("payment account availability", () => {
  it.each([
    { label: "missing table", error: { message: 'relation "payment_accounts" does not exist' } },
    { label: "denied query", error: { message: "permission denied for table payment_accounts" } },
    { label: "missing query result", error: null },
  ])("rejects $label instead of presenting empty options", async ({ error }) => {
    await expect(
      getPaymentAccountsForExpensePicker(null, clientWithResult(null, error))
    ).rejects.toThrow();
  });

  it("accepts a successful empty account list", async () => {
    await expect(
      getPaymentAccountsForExpensePicker(null, clientWithResult([], null))
    ).resolves.toEqual([]);
  });
});
