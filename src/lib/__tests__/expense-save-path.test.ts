import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  payloads: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => state.client,
  createBrowserClient: () => state.client,
}));
import { createExpense, createQuickExpense } from "@/lib/data";

beforeEach(() => {
  state.payloads = [];
  state.client = createClient("http://127.0.0.1:54321", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const table = new URL(String(input)).pathname.split("/").at(-1);
        let result: unknown = [];
        if (table === "create_expense_atomic") {
          state.payloads.push(JSON.parse(String(init?.body)).p_payload);
          result = { expense_id: "expense-1" };
        } else if (table === "expenses") {
          result = {
            id: "expense-1",
            expense_date: "2026-09-08",
            total: 25.5,
            payment_method: "Cash",
          };
        } else if (table === "expense_lines") {
          result = [
            {
              id: "line-1",
              expense_id: "expense-1",
              project_id: null,
              category: "Other",
              amount: 25.5,
            },
          ];
        } else if (table === "expense_options")
          result = [{ id: "method-1", name: "Cash", active: true, is_default: true }];
        else if (table === "bank_transactions") result = null;
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
});

it.each(["company", "receipt_upload"] as const)(
  "Quick and Full persist the same fields and workflow for %s",
  async (sourceType) => {
    const common = {
      idempotencyKey: "T2-create",
      date: "2026-09-08",
      vendorName: "PW Finance T2",
      paymentAccountId: "account-1",
      sourceType,
      initialStatus: "reviewed" as const,
    };
    const full = await createExpense({
      ...common,
      lines: [{ projectId: null, category: "Other", amount: 25.5 }],
    });
    const quick = await createQuickExpense({
      ...common,
      totalAmount: 25.5,
      category: "Other",
      projectId: null,
    });
    expect(state.payloads[0]).toEqual(state.payloads[1]);
    expect(state.payloads[0]).toMatchObject({
      paymentAccountId: "account-1",
      status: sourceType === "receipt_upload" ? "needs_review" : "reviewed",
      paymentMethod: "Cash",
    });
    expect(full.lines[0].amount).toBe(quick.lines[0].amount);
  }
);

it("rejects invalid amounts before persistence in either create path", async () => {
  const common = { idempotencyKey: "T2-invalid", date: "2026-09-08", vendorName: "PW Finance T2" };
  await expect(
    createExpense({ ...common, lines: [{ projectId: null, category: "Other", amount: -1 }] })
  ).rejects.toThrow();
  await expect(createQuickExpense({ ...common, totalAmount: -1 })).rejects.toThrow();
  expect(state.payloads).toEqual([]);
});

it("uses the authenticated client for the configured payment default", async () => {
  const explicit = state.client!;
  state.client = null;
  const { defaultPaymentMethodName } = await import("@/lib/expense-options-db");
  await expect(defaultPaymentMethodName(explicit)).resolves.toBe("Cash");
});
