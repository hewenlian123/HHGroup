import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

describe("financial destructive actions", () => {
  it("reverses a worker payment through one atomic idempotent RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { payment_id: "payment-1", reused: false },
      error: null,
    }));
    const from = vi.fn(() => {
      throw new Error("worker payment reversal must not issue direct table writes");
    });
    const client = { rpc, from } as unknown as SupabaseClient;

    const { reverseWorkerPayment } = await import("@/lib/worker-payment-reversal-db");
    await expect(
      reverseWorkerPayment("payment-1", "worker-payment-reversal:payment-1", client)
    ).resolves.toEqual({ payment_id: "payment-1", reused: false });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("reverse_worker_payment_atomic", {
      p_payment_id: "payment-1",
      p_idempotency_key: "worker-payment-reversal:payment-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("preserves worker-payment reversal failures and never falls through to table writes", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "injected reimbursement reversal failure" },
    }));
    const from = vi.fn(() => {
      throw new Error("worker payment reversal must not issue direct table writes");
    });
    const client = { rpc, from } as unknown as SupabaseClient;

    const { reverseWorkerPayment } = await import("@/lib/worker-payment-reversal-db");
    await expect(
      reverseWorkerPayment("payment-2", "worker-payment-reversal:payment-2", client)
    ).rejects.toThrow("injected reimbursement reversal failure");

    expect(rpc).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
  });

  it("deletes a Draft AP bill through one atomic idempotent RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { bill_id: "bill-1", reused: false },
      error: null,
    }));
    const from = vi.fn(() => {
      throw new Error("Draft AP Bill delete must not issue dependency reads or table writes");
    });
    const client = { rpc, from } as unknown as SupabaseClient;

    const { deleteApBillDraft } = await import("@/lib/ap-bills-db");
    await expect(deleteApBillDraft("bill-1", client)).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("delete_ap_bill_draft_atomic", {
      p_bill_id: "bill-1",
      p_idempotency_key: "ap-bill-delete:bill-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic Draft AP Bill dependency check fails", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "permission denied for table ap_bill_payments" },
    }));
    const from = vi.fn(() => {
      throw new Error("Draft AP Bill delete must not fall back to table deletion");
    });
    const client = { rpc, from } as unknown as SupabaseClient;

    const { deleteApBillDraft } = await import("@/lib/ap-bills-db");
    await expect(deleteApBillDraft("bill-2", client)).rejects.toThrow(
      "permission denied for table ap_bill_payments"
    );

    expect(rpc).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
  });
});
