import { beforeEach, describe, expect, it, vi } from "vitest";

type RpcResult = { data: unknown; error: { message?: string } | null };

let approveRpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
let fallbackUpdates: Array<{
  table: string;
  payload: Record<string, unknown>;
  column: string;
  value: unknown;
}>;

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => approveRpc(name, args),
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          fallbackUpdates.push({ table, payload, column, value });
          return { error: null };
        },
      }),
    }),
  }),
}));

describe("legacy subcontract bill approval", () => {
  beforeEach(() => {
    fallbackUpdates = [];
    approveRpc = async () => ({ data: null, error: null });
  });

  it("approves a Pending legacy subcontract bill through the RPC", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    approveRpc = async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    };

    const { approveSubcontractBill } = await import("@/lib/subcontract-bills-db");
    const result = await approveSubcontractBill("bill-1");

    expect(result).toEqual({ alreadyApproved: false });
    expect(rpcCalls).toEqual([{ name: "approve_subcontract_bill", args: { p_bill_id: "bill-1" } }]);
    expect(fallbackUpdates).toEqual([]);
  });

  it("treats duplicate approval as an idempotent no-op without double-counting cost", async () => {
    let billStatus = "Pending";
    let projectSpent = 0;
    const billAmount = 100;

    approveRpc = async () => {
      if (billStatus === "Approved") {
        return { data: null, error: { message: "Bill is already approved" } };
      }
      billStatus = "Approved";
      projectSpent += billAmount;
      return { data: null, error: null };
    };

    const { approveSubcontractBill } = await import("@/lib/subcontract-bills-db");
    const first = await approveSubcontractBill("bill-1");
    const duplicate = await approveSubcontractBill("bill-1");

    expect(first).toEqual({ alreadyApproved: false });
    expect(duplicate).toEqual({ alreadyApproved: true });
    expect(billStatus).toBe("Approved");
    expect(projectSpent).toBe(100);
    expect(fallbackUpdates).toEqual([]);
  });

  it("still throws non-idempotent approval errors", async () => {
    approveRpc = async () => ({
      data: null,
      error: { message: "permission denied for table subcontract_bills" },
    });

    const { approveSubcontractBill } = await import("@/lib/subcontract-bills-db");

    await expect(approveSubcontractBill("bill-1")).rejects.toThrow(
      "permission denied for table subcontract_bills"
    );
  });
});
