import { createClient } from "@supabase/supabase-js";
import { describe, it, expect, vi } from "vitest";
import { getCompanyFinancialDashboard, getTotalLaborCost, getDeposits } from "@/lib/data";
import { getTotalLaborCost as readLabor } from "@/lib/daily-labor-db";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("Session missing");
  },
}));
function fixture(rows: Record<string, unknown[]> = {}, denied?: string, code = "42501") {
  const calls: URL[] = [];
  const client = createClient("http://127.0.0.1:54321", "fixture-session", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        const table = url.pathname.split("/").at(-1)!;
        return new Response(
          JSON.stringify(
            table === denied
              ? {
                  code,
                  message: code === "42703" ? "column status does not exist" : "read unavailable",
                }
              : (rows[table] ?? [])
          ),
          { status: table === denied ? 403 : 200, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  });
  return { client, calls };
}
describe("Phase 3 authenticated financial reads", () => {
  it("uses the caller session for labor and preserves Approved/Locked cost", async () => {
    const { client, calls } = fixture({
      labor_entries: [{ cost_amount: 125.25, status: "Approved" }],
    });
    expect(await getTotalLaborCost(client)).toBe(125.25);
    expect(calls[0].searchParams.get("status")).toBe("in.(Approved,Locked)");
  });
  it("keeps successful empty ledgers distinct from unavailable", async () => {
    const { client } = fixture();
    expect(await getTotalLaborCost(client)).toBe(0);
    expect(await getCompanyFinancialDashboard(client)).toEqual({
      budget: 0,
      spent: 0,
      revenue: 0,
      collected: 0,
      profit: 0,
      cashflow: 0,
    });
    expect(await getDeposits(client)).toEqual([]);
  });
  it("preserves the existing portfolio revenue and collected formulas", async () => {
    const { client } = fixture({
      invoices: [{ id: "i1", total: 500.25, status: "Sent" }],
      invoice_payments: [{ amount: 125.25, status: "Posted" }],
    });
    expect(await getCompanyFinancialDashboard(client)).toEqual({
      budget: 0,
      spent: 0,
      revenue: 500.25,
      collected: 125.25,
      profit: 500.25,
      cashflow: 125.25,
    });
  });
  it("passes the session through canonical project cost with unchanged spent", async () => {
    const { client } = fixture({
      projects: [{ id: "p1", name: "Fixture", budget: 1000, status: "active" }],
      subcontract_bills: [{ project_id: "p1", amount: 75.25 }],
      invoices: [{ id: "i1", total: 500.25, status: "Sent" }],
      invoice_payments: [{ amount: 125.25, status: "Posted" }],
    });
    expect(await getCompanyFinancialDashboard(client)).toEqual({
      budget: 1000,
      spent: 75.25,
      revenue: 500.25,
      collected: 125.25,
      profit: 425,
      cashflow: 50,
    });
  });
  it.each(["projects", "invoices", "invoice_payments"])(
    "rejects unavailable dashboard %s",
    async (table) => {
      await expect(getCompanyFinancialDashboard(fixture({}, table).client)).rejects.toThrow();
    }
  );
  it.each(["42501", "42P01"])("rejects labor read %s", async (code) => {
    await expect(getTotalLaborCost(fixture({}, "labor_entries", code).client)).rejects.toThrow();
  });
  it("never broadens a failed Approved/Locked query to all labor statuses", async () => {
    const { client, calls } = fixture({}, "labor_entries", "42703");
    await expect(readLabor(client)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  it.each(["42501", "42P01"])(
    "does not report missing/denied deposits %s as zero",
    async (code) => {
      await expect(getDeposits(fixture({}, "deposits", code).client)).rejects.toThrow();
    }
  );
});
