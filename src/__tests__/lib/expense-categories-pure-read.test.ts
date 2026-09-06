import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getExpenseCategories } from "@/lib/reference-data-db";

type QueryResult = { data: unknown; error: null };

function emptyCategoriesClient() {
  const mutations: Array<{ table: string; operation: string; value: unknown }> = [];
  const empty: QueryResult = { data: [], error: null };

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                limit: async () => empty,
                order: async () => empty,
              };
            },
            limit: async () =>
              table === "expense_options"
                ? { data: null, error: { message: "relation does not exist" } }
                : empty,
          };
        },
        insert(value: unknown) {
          mutations.push({ table, operation: "insert", value });
          return Promise.resolve(empty);
        },
        update(value: unknown) {
          mutations.push({ table, operation: "update", value });
          return Promise.resolve(empty);
        },
        upsert(value: unknown) {
          mutations.push({ table, operation: "upsert", value });
          return Promise.resolve(empty);
        },
        delete() {
          mutations.push({ table, operation: "delete", value: null });
          return Promise.resolve(empty);
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, mutations };
}

describe("expense category reads", () => {
  it("returns an existing empty category table without mutating it", async () => {
    const { client, mutations } = emptyCategoriesClient();

    await expect(getExpenseCategories(false, client)).resolves.toEqual([]);

    expect(mutations).toEqual([]);
  });
});
