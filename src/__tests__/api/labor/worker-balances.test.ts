import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockSupabaseClient = { from: ReturnType<typeof createChained> } | null;
let mockSupabaseGetter: () => MockSupabaseClient = () => null;
let mockRequestClientGetter: () => MockSupabaseClient = () => null;

function request() {
  return new Request("http://localhost/api/labor/worker-balances");
}

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

vi.mock("@/lib/supabase-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-server")>();
  return {
    ...actual,
    getServerSupabaseAdmin: () => mockSupabaseGetter(),
    getServerSupabaseAdminNoStore: () => mockSupabaseGetter(),
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
  requireSupabaseOwnerOrAdminWithClient: async (
    _request: Request,
    createClient: () => MockSupabaseClient
  ) => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
    client: createClient(),
  }),
  requireSupabaseOwnerOrAdminRequestClient: async () => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
    client: mockRequestClientGetter(),
    sessionResponse: new Response(),
  }),
}));

describe("GET /api/labor/worker-balances", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HH_REQUIRE_LOGIN", "0");
    vi.stubEnv("HH_ALLOW_LOCAL_NO_LOGIN", "1");
    mockSupabaseGetter = () => null;
    mockRequestClientGetter = () => mockSupabaseGetter();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when Supabase is not configured", async () => {
    mockSupabaseGetter = () => null;
    const { GET } = await import("@/app/api/labor/worker-balances/route");
    const res = await GET(request());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.message).toContain("Supabase");
  });

  it("queries with the authenticated request client instead of a service-role client", async () => {
    const workers = [{ id: "w1", name: "Worker One" }];
    const requestClient = {
      from: (table: string) => {
        if (table === "labor_workers" || table === "workers")
          return createChained(workers) as never;
        return createChained([]) as never;
      },
    } as never;
    mockSupabaseGetter = () => null;
    mockRequestClientGetter = () => requestClient;

    const { GET } = await import("@/app/api/labor/worker-balances/route");
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(res.headers.get("Server-Timing")).toMatch(
      /hh_auth;dur=\d+\.\d, hh_server_data;dur=\d+\.\d, hh_handler_total;dur=\d+\.\d/
    );
    await expect(res.json()).resolves.toMatchObject({
      balances: [{ workerId: "w1", workerName: "Worker One", balance: 0 }],
    });
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
    const res = await GET(request());
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
      balance: 120,
      deletable: false,
    });
  });

  it("keeps unlinked payments as ledger rows instead of reducing unpaid item balance", async () => {
    const workers = [{ id: "w1", name: "Worker One" }];
    const labor = [
      { worker_id: "w1", cost_amount: 100, status: "Approved", worker_payment_id: null },
    ];
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
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.balances[0]).toMatchObject({
      laborOwed: 100,
      reimbursements: 20,
      payments: 50,
      balance: 120,
    });
  });

  it("uses worker_payments.labor_entry_ids as a legacy labor settlement link", async () => {
    const workers = [{ id: "w1", name: "Worker One" }];
    const labor = [
      {
        id: "l1",
        worker_id: "w1",
        cost_amount: 100,
        status: "Approved",
        worker_payment_id: null,
      },
    ];
    const reimb = [{ worker_id: "w1", amount: 20, status: "pending" }];
    const payments = [{ id: "pay1", worker_id: "w1", total_amount: 100, labor_entry_ids: ["l1"] }];

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
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.balances[0]).toMatchObject({
      laborOwed: 0,
      reimbursements: 20,
      payments: 100,
      balance: 20,
    });
  });

  it("ignores deducted advances because they were already settled by a payment", async () => {
    const workers = [{ id: "w1", name: "Worker One" }];
    const labor = [{ worker_id: "w1", cost_amount: 100, status: "pending" }];
    const reimb = [{ worker_id: "w1", amount: 20, status: "pending" }];
    const payments = [{ worker_id: "w1", total_amount: 50 }];
    const advancesDeducted = [{ worker_id: "w1", amount: 999, status: "deducted" }];

    mockSupabaseGetter = () =>
      ({
        from: (table: string) => {
          if (table === "labor_workers") return createChained(workers) as never;
          if (table === "labor_entries") return createChained(labor) as never;
          if (table === "worker_reimbursements") return createChained(reimb) as never;
          if (table === "worker_payments") return createChained(payments) as never;
          if (table === "worker_advances") return createChained(advancesDeducted) as never;
          return createChained([]) as never;
        },
      }) as never;

    const { GET } = await import("@/app/api/labor/worker-balances/route");
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.balances[0]).toMatchObject({
      advances: 0,
      balance: 120,
    });
  });

  it("counts pending advances toward current net-to-pay", async () => {
    const workers = [{ id: "w1", name: "Worker One" }];
    const labor = [{ worker_id: "w1", cost_amount: 100, status: "pending" }];
    const reimb = [{ worker_id: "w1", amount: 20, status: "pending" }];
    const payments = [{ worker_id: "w1", total_amount: 50 }];
    const advancesPending = [{ worker_id: "w1", amount: 30, status: "pending" }];

    mockSupabaseGetter = () =>
      ({
        from: (table: string) => {
          if (table === "labor_workers") return createChained(workers) as never;
          if (table === "labor_entries") return createChained(labor) as never;
          if (table === "worker_reimbursements") return createChained(reimb) as never;
          if (table === "worker_payments") return createChained(payments) as never;
          if (table === "worker_advances") return createChained(advancesPending) as never;
          return createChained([]) as never;
        },
      }) as never;

    const { GET } = await import("@/app/api/labor/worker-balances/route");
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.balances[0]).toMatchObject({
      advances: 30,
      balance: 90,
    });
  });
});
