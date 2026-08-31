import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRecordWorkerPayrollSettlementWithClient = vi.fn();
const mockGetWorkerPayrollSettlementReplaySelectionWithClient = vi.fn();
const mockComputeImplicitSettlement = vi.fn();
let mockAdvanceRows: Array<{ id: string; amount: number; status: string }> = [];

const emptyList = Promise.resolve({ data: [] as unknown[], error: null });
const updateOk = Promise.resolve({ error: null });

vi.mock("@/lib/worker-payments-db", () => ({
  recordWorkerPayrollSettlementWithClient: (...args: unknown[]) =>
    mockRecordWorkerPayrollSettlementWithClient(...args),
  getWorkerPayrollSettlementReplaySelectionWithClient: (...args: unknown[]) =>
    mockGetWorkerPayrollSettlementReplaySelectionWithClient(...args),
}));

vi.mock("@/lib/worker-payment-implicit-settlement", () => ({
  computeImplicitSettlement: (...args: unknown[]) => mockComputeImplicitSettlement(...args),
}));

const serverLaborPayMock = {
  from: (table: string) => {
    if (table === "worker_advances") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: mockAdvanceRows, error: null }),
          }),
        }),
      };
    }
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
    getServerSupabaseAdminNoStore: () => serverLaborPayMock,
    getServerSupabase: () => serverLaborPayMock,
    getServerSupabaseInternal: () => serverLaborPayMock,
    getServerSupabaseInternalNoStore: () => serverLaborPayMock,
  };
});

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminWithClient: async (
    _request: Request,
    createClient: () => typeof serverLaborPayMock
  ) => ({
    ok: true as const,
    context: { email: "owner@example.com", role: "owner", user: { id: "owner-1" } },
    client: createClient(),
  }),
}));

describe("POST /api/labor/workers/[id]/pay", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRecordWorkerPayrollSettlementWithClient.mockReset();
    mockGetWorkerPayrollSettlementReplaySelectionWithClient.mockReset();
    mockGetWorkerPayrollSettlementReplaySelectionWithClient.mockResolvedValue(null);
    mockComputeImplicitSettlement.mockReset();
    mockComputeImplicitSettlement.mockResolvedValue({
      laborIds: [],
      reimbIds: [],
      expectedTotal: 50,
    });
    mockAdvanceRows = [];
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
    expect(mockRecordWorkerPayrollSettlementWithClient).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(new Request("http://x", { method: "POST", body: "not json" }), {
      params: Promise.resolve({ id: "w1" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/JSON|Invalid/i);
    expect(mockRecordWorkerPayrollSettlementWithClient).not.toHaveBeenCalled();
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
    expect(mockRecordWorkerPayrollSettlementWithClient).not.toHaveBeenCalled();
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
    expect(mockRecordWorkerPayrollSettlementWithClient).not.toHaveBeenCalled();
  });

  it("returns 400 when the server idempotency key is missing", async () => {
    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ amount: 50, payment_method: "cash" }),
      }),
      { params: Promise.resolve({ id: "w1" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/idempotency/i);
    expect(mockRecordWorkerPayrollSettlementWithClient).not.toHaveBeenCalled();
  });

  it("returns 200 and payment when the atomic payroll RPC succeeds", async () => {
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
    mockRecordWorkerPayrollSettlementWithClient.mockResolvedValue({ payment, reused: false });

    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          amount: 50,
          payment_method: "cash",
          payment_date: "2025-01-01",
          idempotency_key: "payroll-request-1",
        }),
      }),
      { params: Promise.resolve({ id: "w1" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.payment).toEqual(payment);
    expect(mockRecordWorkerPayrollSettlementWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workerId: "w1",
        amount: 50,
        paymentMethod: "cash",
        paymentDate: "2025-01-01",
        idempotencyKey: "payroll-request-1",
      })
    );
  });

  it("includes selected advances in the implicit settlement target and atomic RPC", async () => {
    mockAdvanceRows = [{ id: "advance-1", amount: 10, status: "pending" }];
    mockComputeImplicitSettlement.mockResolvedValue({
      laborIds: ["labor-1"],
      reimbIds: [],
      expectedTotal: 60,
    });
    mockRecordWorkerPayrollSettlementWithClient.mockResolvedValue({
      payment: { id: "pay-advance" },
      reused: false,
    });

    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          amount: 50,
          payment_method: "cash",
          payment_date: "2025-01-01",
          idempotency_key: "payroll-request-advance",
          advance_ids: ["advance-1"],
          advance_deduction_amount: 10,
        }),
      }),
      { params: Promise.resolve({ id: "w1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockComputeImplicitSettlement).toHaveBeenCalledWith(expect.anything(), "w1", 60, null);
    expect(mockRecordWorkerPayrollSettlementWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ advanceIds: ["advance-1"], advanceDeductionAmount: 10 })
    );
  });

  it("replays a committed implicit settlement before unpaid-row discovery", async () => {
    mockGetWorkerPayrollSettlementReplaySelectionWithClient.mockResolvedValue({
      paymentDate: "2025-01-01",
      laborEntryIds: ["labor-1"],
      reimbursementIds: ["reimb-1"],
      advanceIds: ["advance-1"],
    });
    mockRecordWorkerPayrollSettlementWithClient.mockResolvedValue({
      payment: { id: "pay-replayed" },
      reused: true,
    });

    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          amount: 50,
          payment_method: "cash",
          idempotency_key: "payroll-response-lost",
          advance_deduction_amount: 10,
        }),
      }),
      { params: Promise.resolve({ id: "w1" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      payment: { id: "pay-replayed" },
      reused: true,
    });
    expect(mockComputeImplicitSettlement).not.toHaveBeenCalled();
    expect(mockRecordWorkerPayrollSettlementWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        paymentDate: "2025-01-01",
        laborEntryIds: ["labor-1"],
        reimbursementIds: ["reimb-1"],
        advanceIds: ["advance-1"],
      })
    );
  });

  it("fails closed when an existing key does not represent a completed settlement", async () => {
    mockGetWorkerPayrollSettlementReplaySelectionWithClient.mockResolvedValue({
      paymentDate: "2025-01-01",
      laborEntryIds: ["labor-1"],
      reimbursementIds: [],
      advanceIds: [],
    });
    const incomplete = new Error("Existing payroll idempotency record is incomplete.");
    Object.assign(incomplete, { code: "23514" });
    mockRecordWorkerPayrollSettlementWithClient.mockRejectedValue(incomplete);

    const { POST } = await import("@/app/api/labor/workers/[id]/pay/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          amount: 50,
          payment_method: "cash",
          idempotency_key: "payroll-incomplete",
        }),
      }),
      { params: Promise.resolve({ id: "w1" }) }
    );

    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/incomplete/i);
    expect(mockComputeImplicitSettlement).not.toHaveBeenCalled();
  });
});
