import { describe, it, expect, vi, beforeEach } from "vitest";

type MockSupabaseClient = { from: ReturnType<typeof createChained> } | null;
let mockSupabaseGetter: () => MockSupabaseClient = () => null;

function createChained<T>(data: T[], error: { message: string } | null = null) {
  const result = { data, error };
  const thenable = {
    order: () => Promise.resolve(result),
    then: (resolve: (arg: { data: T[]; error: typeof error }) => void) =>
      Promise.resolve(result).then(resolve),
  };
  return {
    select: () => thenable,
    order: () => Promise.resolve(result),
    then: (resolve: (arg: { data: T[]; error: typeof error }) => void) =>
      Promise.resolve(result).then(resolve),
  };
}

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => mockSupabaseGetter(),
}));

describe("GET /api/labor/worker-balances", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabaseGetter = () => null;
  });

  it("returns 500 when Supabase is not configured", async () => {
    mockSupabaseGetter = () => null;
    const { GET } = await import("@/app/api/labor/worker-balances/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toContain("Supabase");
  });

  it("returns 200 and balances array when Supabase returns data", async () => {
    const workers = [{ id: "w1", name: "Worker One" }];
    const labor = [{ worker_id: "w1", cost_amount: 100, status: "pending" }];
    const reimb = [{ worker_id: "w1", amount: 20, status: "pending" }];
    const payments = [{ worker_id: "w1", total_amount: 50 }];

    mockSupabaseGetter = () =>
      ({
        from: (table: string) => {
          if (table === "labor_workers") return createChained(workers) as never;
          if (table === "labor_entries") return createChained(labor) as never;
          if (table === "worker_reimbursements") return createChained(reimb) as never;
          if (table === "worker_payments") return createChained(payments) as never;
          if (table === "worker_advances") return createChained([]) as never;
          return createChained([]) as never;
        },
      }) as never;

    const { GET } = await import("@/app/api/labor/worker-balances/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.balances)).toBe(true);
    expect(json.balances.length).toBe(1);
    expect(json.balances[0]).toMatchObject({
      workerId: "w1",
      workerName: "Worker One",
      laborOwed: 100,
      reimbursements: 20,
      payments: 50,
      advances: 0,
      balance: 70,
    });
  });
});
