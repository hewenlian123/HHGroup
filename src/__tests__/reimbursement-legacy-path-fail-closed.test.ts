import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordBatchReimbursementPayment } from "@/lib/worker-reimbursements-db";

describe("reimbursement payment legacy path", () => {
  it("fails closed before issuing any non-atomic database write", async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient;

    await expect(recordBatchReimbursementPayment(["reimbursement-1"], {}, client)).rejects.toThrow(
      "Non-atomic reimbursement payment path is disabled. Use the atomic reimbursement payment RPC."
    );
    expect(from).not.toHaveBeenCalled();
  });
});
