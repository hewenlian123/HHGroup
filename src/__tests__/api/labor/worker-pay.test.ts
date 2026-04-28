import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateWorkerPaymentWithClient = vi.fn();

const emptyList = Promise.resolve({ data: [] as unknown[], error: null });
const updateOk = Promise.resolve({ error: null });

vi.mock("@/lib/worker-payments-db", () => ({
  createWorkerPaymentWithClient: (...args: unknown[]) => mockCreateWorkerPaymentWithClient(...args),
}));

vi.mock("@/lib/worker-payment-implicit-settlement", () => ({
  computeImplicitSettlement: vi
    .fn()
    .mockResolvedValue({ laborIds: [], reimbIds: [], expectedTotal: 50 }),
}));

const serverLaborPayMock = {
  from: (table: string) => {
    if (table === "worker_payments") {
      return {
        delete: () => ({
          eq: () => updateOk,
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          in: () => emptyList,
          then: (resolveFn: (v: { data: unknown[]; error: null }) => void) =>
            emptyList.then(resolveFn),
        }),
      }),
      update: () => ({
        eq: () => ({
          in: () => updateOk,
          neq: () => updateOk,
        }),
      }),
    };
  },
};

vi.mock("@/lib/supabase-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-server")>();
  return {
    ...actual,
    getServerSupabaseAdmin: () => serverLaborPayMock,
    getServerSupabase: () => serverLaborPayMock,
    getServerSupabaseInternal: () => serverLaborPayMock,
  };
});

describe("POST /api/labor/workers/[id]/pay", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateWorkerPaymentWithClient.mockReset();
  });

  it("returns 400 when worker id is missing", async () => {
    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ amount: 10, payment_method: "cash" }),
      }),
      { params: Promise.resolve({ id: "" }) }
    );
    expect(res.status).toBe(400);
    expect(mockCreateWorkerPaymentWithClient).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(new Request("http://x", { method: "POST", body: "not json" }), {
      params: Promise.resolve({ id: "w1" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/JSON|Invalid/i);
    expect(mockCreateWorkerPaymentWithClient).not.toHaveBeenCalled();
  });

  it("returns 400 when amount is missing or invalid", async () => {
    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ payment_method: "cash" }) }),
      { params: Promise.resolve({ id: "w1" }) }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/amount|Valid/i);
    expect(mockCreateWorkerPaymentWithClient).not.toHaveBeenCalled();
  });

  it("returns 400 when payment_method is missing", async () => {
    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ amount: 100 }) }),
      { params: Promise.resolve({ id: "w1" }) }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/method|Payment/i);
    expect(mockCreateWorkerPaymentWithClient).not.toHaveBeenCalled();
  });

  it("returns 200 and payment when createWorkerPaymentWithClient succeeds", async () => {
    const payment = {
      id: "pay1",
      workerId: "w1",
      projectId: null,
      paymentDate: "2025-01-01",
      amount: 50,
      paymentMethod: "cash",
      notes: null,
      createdAt: "2025-01-01T00:00:00Z",
      laborEntryIds: null as string[] | null,
    };
    mockCreateWorkerPaymentWithClient.mockResolvedValue(payment);

    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ amount: 50, payment_method: "cash", payment_date: "2025-01-01" }),
      }),
      { params: Promise.resolve({ id: "w1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.payment).toEqual(payment);
    expect(mockCreateWorkerPaymentWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workerId: "w1",
        amount: 50,
        paymentMethod: "cash",
        paymentDate: "2025-01-01",
      })
    );
  });
});
