import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabaseGetter: () => ReturnType<typeof createBalanceMock> | null = () => null;

function createBalanceMock(
  workerId: string,
  overrides: {
    worker?: { id: string; name: string | null } | null;
    labor?: unknown[];
    reimb?: unknown[];
    payments?: unknown[];
    advances?: unknown[];
    projects?: unknown[];
    failedTable?: string;
    missingTable?: string;
  } = {}
) {
  const worker = overrides.hasOwnProperty("worker")
    ? overrides.worker!
    : { id: workerId, name: "Test Worker" };
  const labor = overrides.labor ?? [];
  const reimb = overrides.reimb ?? [];
  const payments = overrides.payments ?? [];
  const advances = overrides.advances ?? [];
  const projects = overrides.projects ?? [{ id: "p1", name: "Project 1" }];

  let activeTable = "";
  const result = <T>(data: T) => ({
    data:
      activeTable === overrides.failedTable || activeTable === overrides.missingTable ? null : data,
    error: activeTable === overrides.failedTable ? { message: "permission denied" } : null,
  });
  const thenable = <T>(data: T) => ({
    then: (resolve: (v: ReturnType<typeof result<T>>) => void) => {
      const value = result(data);
      queueMicrotask(() => resolve(value));
      return Promise.resolve(value);
    },
  });

  const resolved = <T>(data: T) => Promise.resolve(result(data));

  const from = (table: string) => {
    activeTable = table;
    if (table === "labor_workers") {
      const row = worker === null ? null : { id: worker.id, name: worker.name };
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => thenable(row) }),
        }),
      };
    }
    if (table === "workers") {
      const row = worker === null ? null : { id: worker.id, name: worker.name };
      const nameMatchRows = row ? [{ id: row.id, name: row.name }] : [];
      return {
        select: () => ({
          eq: (col: string) => {
            if (col === "name") {
              return resolved(nameMatchRows);
            }
            return {
              maybeSingle: () => thenable(row),
            };
          },
          ilike: () => resolved(nameMatchRows),
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
      return {
        select: (cols: string) => ({
          eq: () => ({
            order: () =>
              thenable(
                payments.map((row) =>
                  Object.fromEntries(
                    Object.entries(row as Record<string, unknown>).filter(([key]) =>
                      cols
                        .split(",")
                        .map((c) => c.trim())
                        .includes(key)
                    )
                  )
                )
              ),
          }),
        }),
      };
    }
    if (table === "worker_advances") {
      return { select: () => ({ eq: () => ({ order: () => thenable(advances) }) }) };
    }
    if (table === "projects") {
      return { select: () => thenable(projects) };
    }
    return { select: () => ({ eq: () => ({ order: () => thenable([]) }) }) };
  };
  return { from };
}

vi.mock("@/lib/supabase-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-server")>();
  return {
    ...actual,
    getServerSupabaseAdmin: () => mockSupabaseGetter(),
    getServerSupabase: () => mockSupabaseGetter(),
    getServerSupabaseInternal: () => mockSupabaseGetter(),
    getServerSupabaseInternalNoStore: () => mockSupabaseGetter(),
  };
});

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: async () => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
  }),
}));

describe("GET /api/labor/workers/[id]/balance", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HH_REQUIRE_LOGIN", "0");
    vi.stubEnv("HH_ALLOW_LOCAL_NO_LOGIN", "1");
    mockSupabaseGetter = () => null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when worker id is missing", async () => {
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "" }) });
    expect(res.status).toBe(400);
  });

  it("returns 503 when Supabase is not configured", async () => {
    mockSupabaseGetter = () => null;
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(503);
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
      balance: 120,
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

  it("does not use unlinked worker payment rows to hide unpaid item balances", async () => {
    mockSupabaseGetter = () =>
      createBalanceMock("w1", {
        worker: { id: "w1", name: "Worker One" },
        labor: [
          {
            id: "l1",
            work_date: "2025-01-01",
            cost_amount: 100,
            status: "Approved",
            worker_payment_id: null,
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
    expect(json.summary).toMatchObject({
      laborOwed: 100,
      reimbursements: 20,
      payments: 50,
      balance: 120,
    });
    expect(json.laborEntries[0]).toMatchObject({
      workerPaymentId: null,
      payrollSettled: false,
    });
  });

  it("treats worker_payments.labor_entry_ids as a legacy labor settlement link", async () => {
    mockSupabaseGetter = () =>
      createBalanceMock("w1", {
        worker: { id: "w1", name: "Worker One" },
        labor: [
          {
            id: "l1",
            work_date: "2025-01-01",
            cost_amount: 100,
            status: "Approved",
            worker_payment_id: null,
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
            total_amount: 100,
            payment_method: "cash",
            labor_entry_ids: ["l1"],
          },
        ],
      });
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toMatchObject({
      laborOwed: 0,
      reimbursements: 20,
      payments: 100,
      balance: 20,
    });
    expect(json.laborEntries).toEqual([]);
  });
});

describe("worker detail failure semantics", () => {
  it.each([
    "labor_workers",
    "workers",
    "labor_entries",
    "worker_payments",
    "worker_reimbursements",
    "worker_advances",
    "projects",
  ])("does not publish a summary after %s permission failure", async (failedTable) => {
    mockSupabaseGetter = () => createBalanceMock("w1", { failedTable });
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("summary");
  });
  it.each([
    "labor_entries",
    "worker_payments",
    "worker_reimbursements",
    "worker_advances",
    "projects",
  ])("does not publish a summary when %s is unavailable", async (missingTable) => {
    mockSupabaseGetter = () => createBalanceMock("w1", { missingTable });
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("summary");
  });
  it("keeps successful empty sources as valid zero", async () => {
    mockSupabaseGetter = () => createBalanceMock("w1", { projects: [] });
    const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).summary).toEqual({
      laborOwed: 0,
      reimbursements: 0,
      payments: 0,
      advances: 0,
      balance: 0,
    });
  });
});

it("displays the recorded payment date instead of the creation date", async () => {
  mockSupabaseGetter = () =>
    createBalanceMock("w1", {
      payments: [
        {
          id: "p1",
          worker_id: "w1",
          total_amount: 50,
          payment_date: "2026-01-02",
          created_at: "2026-02-03T12:00:00Z",
        },
      ],
    });
  const { GET } = await import("@/app/api/labor/workers/[id]/balance/route");
  const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
  expect((await res.json()).payments[0].date).toBe("2026-01-02");
});

describe("secondary worker financial-summary availability", () => {
  it.each(["labor_entries", "worker_reimbursements", "worker_invoices", "worker_payments", null])(
    "handles %s failure without a zero summary",
    async (failedTable) => {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient("http://127.0.0.1:54321", "unit-test", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input) => {
            const failed = new URL(String(input)).pathname.endsWith("/" + failedTable);
            return new Response(
              JSON.stringify(failed ? { code: "42501", message: "permission denied" } : []),
              { status: failed ? 403 : 200, headers: { "content-type": "application/json" } }
            );
          },
        },
      });
      mockSupabaseGetter = () => client as unknown as ReturnType<typeof createBalanceMock>;
      const { GET } = await import("@/app/api/labor/workers/[id]/financial-summary/route");
      const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "w1" }) });
      expect(res.status).toBe(failedTable ? 500 : 200);
      if (failedTable) expect(await res.json()).not.toHaveProperty("balance");
      else expect((await res.json()).balance).toBe(0);
    }
  );
});
