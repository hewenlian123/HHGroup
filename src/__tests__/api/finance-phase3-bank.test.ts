import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { guard, forbidden } = vi.hoisted(() => ({
  guard: vi.fn(),
  forbidden: vi.fn(() => {
    throw new Error("Unexpected admin client");
  }),
}));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminRequestClient: guard,
  requireSupabaseOwnerOrAdminWithClient: forbidden,
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseInternal: forbidden,
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Missing config",
}));
import { GET, POST } from "@/app/api/financial/bank-transactions/route";
function session(denied?: string, code = "42501") {
  return createClient("http://127.0.0.1:54321", "fixture-session", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const table = new URL(String(input)).pathname.split("/").at(-1);
        return new Response(
          JSON.stringify(
            table === denied
              ? {
                  code,
                  message:
                    code === "42P01" ? `relation ${table} does not exist` : "permission denied",
                }
              : []
          ),
          { status: table === denied ? 403 : 200, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  });
}
describe("Bank workspace reads", () => {
  beforeEach(() => {
    guard.mockReset();
  });
  it("uses the authenticated client and accepts a genuinely empty ledger", async () => {
    guard.mockResolvedValue({ ok: true, client: session() });
    const response = await GET(
      new Request("http://localhost/api/financial/bank-transactions?view=reconcile")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, transactions: [], projects: [] });
  });
  it.each(["bank_transactions", "projects", "categories", "vendors", "expense_options"])(
    "rejects missing %s instead of empty success",
    async (table) => {
      guard.mockResolvedValue({ ok: true, client: session(table, "42P01") });
      const response = await GET(
        new Request("http://localhost/api/financial/bank-transactions?view=reconcile")
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ ok: false });
    }
  );
  it("reports missing linked-expense data as unavailable", async () => {
    guard.mockResolvedValue({ ok: true, client: session("bank_transactions", "42P01") });
    const response = await GET(
      new Request(
        "http://localhost/api/financial/bank-transactions?view=linked-expenses&expenseIds=expense-1"
      )
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
  });
  it("never exposes a summary of zero amounts after permission failure", async () => {
    guard.mockResolvedValue({ ok: true, client: session("bank_transactions") });
    const response = await GET(
      new Request("http://localhost/api/financial/bank-transactions?view=summary")
    );
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("summary");
  });
  it.each(["linkExpense", "unlink"])(
    "does not claim success when RLS hides the %s update",
    async (action) => {
      guard.mockResolvedValue({ ok: true, client: session() });
      const response = await POST(
        new Request("http://localhost/api/financial/bank-transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, txId: "tx", expenseId: "expense" }),
        })
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ ok: false });
    }
  );
});
