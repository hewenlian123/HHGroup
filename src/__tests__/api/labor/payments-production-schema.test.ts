import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClientDouble> | null,
}));

type QueryResult = { data: Array<Record<string, unknown>>; error: null };

function createClientDouble(rows: Record<string, Array<Record<string, unknown>>>) {
  const selects: Array<{ table: string; columns: string }> = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const from = (table: string) => {
    const result: QueryResult = { data: rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    Object.assign(chain, {
      select(columns: string) {
        selects.push({ table, columns });
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        inserts.push({ table, payload });
        return Promise.resolve(result);
      },
      eq: pass,
      gte: pass,
      lte: pass,
      or: pass,
      order: pass,
      limit: pass,
      then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    });
    return chain;
  };

  return { from: vi.fn(from), selects, inserts };
}

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminWithClient: async () => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
    client: mocks.client,
  }),
}));

vi.mock("@/lib/supabase-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-server")>();
  return { ...actual, getServerSupabaseInternal: () => mocks.client };
});

describe("labor payments Production schema boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.client = null;
  });

  it("reads canonical labor cost and payment note fields while preserving outward memo", async () => {
    mocks.client = createClientDouble({
      workers: [{ id: "worker-1", name: "Worker One", half_day_rate: 125 }],
      labor_entries: [
        {
          id: "entry-1",
          worker_id: "worker-1",
          project_id: "project-1",
          work_date: "2026-08-20",
          labor_cost_snapshot: 250,
        },
      ],
      labor_payments: [
        {
          id: "payment-1",
          worker_id: "worker-1",
          payment_date: "2026-08-20",
          amount: 75,
          method: "ACH",
          note: "August partial",
          applied_start_date: "2026-08-01",
          applied_end_date: "2026-08-31",
        },
      ],
      projects: [{ id: "project-1", name: "Project One" }],
      payment_methods: [{ name: "ACH", status: "active" }],
    });

    const { GET } = await import("@/app/api/labor/payments/route");
    const response = await GET(
      new Request("http://localhost/api/labor/payments?startDate=2026-08-01&endDate=2026-08-31")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toEqual([
      expect.objectContaining({
        workerId: "worker-1",
        confirmedTotal: 250,
        paidTotal: 75,
        balance: 175,
        payments: [
          expect.objectContaining({
            id: "payment-1",
            memo: "August partial",
          }),
        ],
      }),
    ]);
    expect(mocks.client.selects.filter(({ table }) => table === "labor_entries")).toEqual([
      {
        table: "labor_entries",
        columns:
          "id,work_date,worker_id,labor_cost_snapshot,amount_snapshot,cost_amount,hours,project_id",
      },
    ]);
    expect(mocks.client.selects.filter(({ table }) => table === "labor_payments")).toEqual([
      {
        table: "labor_payments",
        columns: "id,worker_id,payment_date,amount,method,note,applied_start_date,applied_end_date",
      },
    ]);
  });

  it("writes the canonical labor_payments.note without obsolete range fallbacks", async () => {
    mocks.client = createClientDouble({ labor_payments: [] });

    const { POST } = await import("@/app/api/labor/payments/route");
    const response = await POST(
      new Request("http://localhost/api/labor/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: "worker-1",
          paymentDate: "2026-08-20",
          amount: 75,
          method: "ACH",
          memo: "August partial",
          startDate: "2026-08-01",
          endDate: "2026-08-31",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.client.inserts).toEqual([
      {
        table: "labor_payments",
        payload: {
          worker_id: "worker-1",
          payment_date: "2026-08-20",
          amount: 75,
          method: "ACH",
          note: "August partial",
          applied_start_date: "2026-08-01",
          applied_end_date: "2026-08-31",
        },
      },
    ]);
  });
});
