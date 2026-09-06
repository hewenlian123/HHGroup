import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { getReportDateRange, getReportsData } from "@/lib/reports-db";

vi.mock("@/lib/supabase-server", () => ({ getServerSupabaseInternalNoStore: vi.fn() }));

function reportClient(paymentMode: "canonical" | "baseline" | "denied" | "null" | "empty") {
  const rows: Record<string, unknown[]> = {
    labor_entries: [
      {
        id: "paid-entry",
        project_id: "project",
        worker_id: "worker",
        work_date: "2026-09-01",
        cost_amount: 125,
        status: "Approved",
        worker_payment_id: null,
      },
      {
        id: "unpaid-entry",
        project_id: "project",
        worker_id: "worker",
        work_date: "2026-09-01",
        cost_amount: 75,
        status: "Approved",
        worker_payment_id: null,
      },
    ],
    worker_payments: [
      {
        id: "payment",
        worker_id: "worker",
        total_amount: 125,
        labor_entry_ids: ["paid-entry"],
        payment_date: "2026-09-02",
        created_at: "2026-09-02T00:00:00Z",
      },
    ],
    projects: [{ id: "project", name: "Fixture Project", budget: 0, contract_amount: 0 }],
  };
  return createClient("http://127.0.0.1:54321", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1)!;
        const selected = (url.searchParams.get("select") ?? "")
          .split(",")
          .map((column) => column.trim());
        let data: unknown = rows[table] ?? [];
        let status = 200;
        if (table === "worker_payments") {
          if (paymentMode === "denied") {
            status = 403;
            data = { code: "42501", message: "permission denied" };
          } else if (paymentMode === "null") data = null;
          else if (paymentMode === "empty") data = [];
          else if (
            paymentMode === "canonical" &&
            selected.some((column) => ["amount", "project_id", "notes"].includes(column))
          ) {
            status = 400;
            data = { code: "42703", message: "legacy worker payment column does not exist" };
          }
        }
        return new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}
const range = getReportDateRange({ period: "custom", from: "2026-09-01", to: "2026-09-30" });
beforeEach(() => vi.resetAllMocks());

describe("report worker payment schema", () => {
  for (const mode of ["baseline", "canonical"] as const)
    it(`preserves settled labor and exact amounts with ${mode} payment rows`, async () => {
      vi.mocked(getServerSupabaseInternalNoStore).mockReturnValue(reportClient(mode));
      const result = await getReportsData(range);
      expect(result.apAging.rows).toMatchObject([
        { id: "unpaid-entry", amount: 75, project: "Fixture Project" },
      ]);
      expect(result.monthly.kpis.find((kpi) => kpi.key === "laborCost")?.value).toBe(200);
      expect(result.warnings).toEqual([]);
    });
  for (const mode of ["denied", "null"] as const)
    it(`rejects ${mode} payment reads instead of treating paid labor as unpaid`, async () => {
      vi.mocked(getServerSupabaseInternalNoStore).mockReturnValue(reportClient(mode));
      await expect(getReportsData(range)).rejects.toThrow(/worker.*payment|payment.*unavailable/i);
    });
  it("accepts a successful empty payment ledger", async () => {
    vi.mocked(getServerSupabaseInternalNoStore).mockReturnValue(reportClient("empty"));
    const result = await getReportsData(range);
    expect(result.apAging.rows.map((row) => row.amount)).toEqual([125, 75]);
  });
});
