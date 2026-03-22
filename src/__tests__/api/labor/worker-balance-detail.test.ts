import { describe, it, expect, vi, beforeEach } from "vitest";

let mockSupabaseGetter: () => ReturnType<typeof createBalanceMock> | null = () => null;

function createBalanceMock(
  workerId: string,
  overrides: {
    worker?: { id: string; name: string | null } | null;
    labor?: unknown[];
    reimb?: unknown[];
    payments?: unknown[];
    projects?: unknown[];
  } = {}
) {
  const worker = overrides.hasOwnProperty("worker")
    ? overrides.worker!
    : { id: workerId, name: "Test Worker" };
  const labor = overrides.labor ?? [];
  const reimb = overrides.reimb ?? [];
  const payments = overrides.payments ?? [];
  const projects = overrides.projects ?? [{ id: "p1", name: "Project 1" }];

  const thenable = <T>(data: T) => ({
    then: (resolve: (v: { data: T; error: null }) => void) => {
      queueMicrotask(() => resolve({ data, error: null }));
      return Promise.resolve({ data, error: null });
    },
  });

  const from = (table: string) => {
    if (table === "labor_workers" || table === "workers") {
      const row = worker === null ? null : { id: worker.id, name: worker.name };
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => thenable(row) }),
        }),
      };
    }
    if (table === "labor_entries") {
      return { select: () => ({ eq: () => ({ order: () => thenable(labor) }) }) };
    }
    if (table === "worker_reimbursements") {
      return { select: () => ({ eq: () => ({ order: () => thenable(reimb) }) }) };
    }
    if (table === "worker_payments") {
      return { select: () => ({ eq: () => ({ order: () => thenable(payments) }) }) };
    }
    if (table === "worker_advances") {
      return { select: () => ({ eq: () => thenable([]) }) };
    }
    if (table === "projects") {
      return { select: () => thenable(projects) };
    }
    return { select: () => ({ eq: () => ({ order: () => thenable([]) }) }) };
  };
  return { from };
}

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => mockSupabaseGetter(),
}));

describe("GET /api/labor/workers/[id]/balance", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabaseGetter = () => null;
  });

  it("returns 400 when worker id is missing", async () => {
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "" }) });
    expect(res.status).toBe(400);
  });

  it("returns 500 when Supabase is not configured", async () => {
    mockSupabaseGetter = () => null;
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toContain("Supabase");
  });

  it("returns 404 when worker not found", async () => {
    mockSupabaseGetter = () => createBalanceMock("w1", { worker: null });
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with worker, summary, laborEntries, reimbursements, payments", async () => {
    mockSupabaseGetter = () =>
      createBalanceMock("w1", {
        worker: { id: "w1", name: "Worker One" },
        labor: [
          {
            id: "l1",
            project_id: "p1",
            work_date: "2025-01-01",
            cost_amount: 100,
            status: "pending",
          },
        ],
        reimb: [
          {
            id: "r1",
            project_id: null,
            vendor: "V",
            amount: 20,
            status: "pending",
            created_at: "2025-01-02",
          },
        ],
        payments: [
          {
            id: "pay1",
            created_at: "2025-01-03T12:00:00.000Z",
            total_amount: 50,
            payment_method: "cash",
            note: null,
          },
        ],
      });
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.worker).toEqual({ id: "w1", name: "Worker One" });
    expect(json.summary).toMatchObject({
      laborOwed: 100,
      reimbursements: 20,
      payments: 50,
      advances: 0,
      balance: 70,
    });
    expect(Array.isArray(json.laborEntries)).toBe(true);
    expect(json.laborEntries[0]).toMatchObject({
      id: "l1",
      date: "2025-01-01",
      amount: 100,
      session: null,
      payrollSettled: false,
    });
    expect(Array.isArray(json.reimbursements)).toBe(true);
    expect(Array.isArray(json.payments)).toBe(true);
  });
});
