import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getFinanceOverviewStats } from "@/lib/data";
import { getCompanyRevenueAndCollected } from "@/lib/invoices-db";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("Session client was not forwarded");
  },
}));

function sessionClient(deniedTable?: string) {
  const rows: Record<string, unknown[]> = {
    invoices: [
      { id: "sent", total: 1000, status: "Sent" },
      { id: "draft", total: 900, status: "Draft" },
      { id: "paid", total: 500, status: "Paid" },
    ],
    invoice_payments: [
      { amount: 250, status: "Posted" },
      { amount: 99, status: "Voided" },
    ],
    ap_bills: [{ amount: 100 }],
    expense_lines: [{ amount: 200 }],
    labor_entries: [{ cost_amount: 300, status: "Approved" }],
  };
  const queries: URL[] = [];
  const client = createClient("http://127.0.0.1:54321", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        queries.push(url);
        const table = url.pathname.split("/").at(-1)!;
        return new Response(
          JSON.stringify(
            table === deniedTable ? { code: "42501", message: "permission denied" } : rows[table]
          ),
          {
            status: table === deniedTable ? 403 : 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  });
  return { client, queries };
}

describe("finance overview session reads", () => {
  it("uses the supplied session throughout without changing totals", async () => {
    const { client, queries } = sessionClient();
    await expect(getFinanceOverviewStats(client)).resolves.toEqual({
      revenue: 1500,
      totalBills: 100,
      totalExpenses: 200,
      totalLaborCost: 300,
      profit: 900,
    });
    expect(
      queries.find((url) => url.pathname.endsWith("/labor_entries"))?.searchParams.get("status")
    ).toBeNull();
    expect(
      queries.find((url) => url.pathname.endsWith("/ap_bills"))?.searchParams.get("status")
    ).toBe("not.eq.Void");
    await expect(getCompanyRevenueAndCollected(client)).resolves.toEqual({
      revenue: 1500,
      collected: 250,
    });
  });
  it.each(["invoices", "invoice_payments", "ap_bills", "expense_lines", "labor_entries"])(
    "does not turn a denied %s read into valid zero totals",
    async (table) => {
      await expect(getFinanceOverviewStats(sessionClient(table).client)).rejects.toThrow(
        "permission denied"
      );
    }
  );
});
