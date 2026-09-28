import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTotalDepositsAmount } from "../deposits-db";
it("excludes void deposits from cash income", async () => {
  const rows = [
    { amount: 125, status: "posted" },
    { amount: 25, status: "void" },
  ];
  const query = {
    neq: (key: "status", value: string) =>
      Promise.resolve({ data: rows.filter((row) => row[key] !== value), error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  const client = { from: () => ({ select: () => query }) } as unknown as SupabaseClient;
  expect(await getTotalDepositsAmount(client)).toBe(125);
});
