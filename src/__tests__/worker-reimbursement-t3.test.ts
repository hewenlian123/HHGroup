import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markWorkerExpensesReimbursed } from "@/lib/expenses-db";
import { updateWorkerReimbursement, markReimbursementPaid } from "@/lib/worker-reimbursements-db";

const chain = () => {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "r" }], error: null }).then(resolve),
  };
  for (const key of ["select", "eq", "or", "in", "update"] as const) q[key].mockReturnValue(q);
  q.single.mockResolvedValue({ data: { id: "r", status: "paid" }, error: null });
  q.maybeSingle.mockResolvedValue({ data: { id: "r", status: "paid" }, error: null });
  return q;
};
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => ({ from: () => chain() }) }));

describe("T3 reimbursement lifecycle guards", () => {
  it("rejects the expense shortcut without a payment", async () => {
    await expect(markWorkerExpensesReimbursed("worker")).rejects.toThrow(/Continue to Payment/);
  });
  it.each(["paid", "approved", "pending", "settled"] as const)(
    "edit cannot set %s",
    async (status) => {
      const from = vi.fn(() => chain());
      await expect(
        updateWorkerReimbursement("r", { status }, { from } as unknown as SupabaseClient)
      ).rejects.toThrow(/Edit cannot change/);
      expect(from).not.toHaveBeenCalled();
    }
  );
  it("rejects standalone paid mutation", async () => {
    const from = vi.fn(() => chain());
    await expect(markReimbursementPaid("r", { from } as unknown as SupabaseClient)).rejects.toThrow(
      /Continue to Payment/
    );
    expect(from).not.toHaveBeenCalled();
  });
});

import { getWorkerReimbursementBalances } from "@/lib/worker-reimbursements-db";
function balanceClient(
  options: {
    unapproved?: boolean;
    missingPayment?: boolean;
    error?: boolean;
    truncated?: boolean;
    expenseSource?: boolean;
  } = {}
) {
  const tables: Record<string, unknown[]> = {
    workers: [{ id: "w", name: "PW T3" }],
    expenses: options.expenseSource
      ? [
          {
            source: "worker_reimbursement",
            source_id: "open",
            source_type: "reimbursement",
            worker_id: "w",
            amount: 25.5,
            total: 25.5,
            status: "approved",
          },
        ]
      : [],
    worker_receipts: options.unapproved
      ? []
      : [
          {
            id: "receipt-open",
            canonical_ingested_at: "2026-09-10",
            reimbursement_id: "open",
            worker_id: "w",
            project_id: null,
            status: "Approved",
            amount: 25.5,
          },
          {
            id: "receipt-paid",
            canonical_ingested_at: "2026-09-10",
            reimbursement_id: "paid",
            worker_id: "w",
            project_id: null,
            status: "Approved",
            amount: 10,
          },
        ],
    worker_reimbursements: [
      {
        id: "open",
        worker_id: "w",
        project_id: null,
        source_worker_receipt_id: "receipt-open",
        amount: 25.5,
        status: "pending",
        payment_id: null,
      },
      {
        id: "paid",
        worker_id: "w",
        project_id: null,
        source_worker_receipt_id: "receipt-paid",
        amount: 10,
        status: "paid",
        payment_id: "p",
      },
    ],
    worker_payments: options.missingPayment ? [] : [{ id: "p", worker_id: "w", total_amount: 10 }],
  };
  return {
    from: (table: string) => {
      const q = {
        select: () => q,
        order: () => q,
        in: () => q,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (!(table in tables))
            return Promise.reject(new Error(`Legacy table requested: ${table}`)).then(
              resolve,
              reject
            );
          return Promise.resolve({
            data: tables[table],
            count: tables[table].length + (options.truncated ? 1 : 0),
            error: options.error ? { message: "unavailable" } : null,
          }).then(resolve, reject);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}
describe("T3 canonical reimbursement balances", () => {
  it("does not subtract paid obligations twice", async () => {
    expect(await getWorkerReimbursementBalances(balanceClient())).toEqual([
      {
        workerId: "w",
        workerName: "PW T3",
        pendingAmount: 25.5,
        approvedAmount: 0,
        paidAmount: 10,
        balance: 25.5,
      },
    ]);
  });
  it.each(["unapproved", "missingPayment", "error", "truncated"] as const)(
    "fails closed for %s",
    async (key) => {
      await expect(
        getWorkerReimbursementBalances(balanceClient({ [key]: true }))
      ).rejects.toThrow();
    }
  );
});

import { recordReimbursementPaymentAtomicWithClient } from "@/lib/worker-reimbursements-db";
it("T3 propagates the database source rejection without claiming payment success", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: null,
    error: { message: "Payment requires an approved Worker Receipt or Expense source." },
  });
  const c = {
    rpc,
    from: (table: string) => ({
      select: () => ({
        in: async () => ({
          data:
            table === "worker_reimbursements"
              ? [{ id: "r", worker_id: "w", amount: 25.5, status: "pending" }]
              : [],
          error: null,
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  await expect(
    recordReimbursementPaymentAtomicWithClient(["r"], { idempotencyKey: "t3" }, c)
  ).rejects.toThrow(/approved Worker Receipt/);
  expect(rpc).toHaveBeenCalledOnce();
});

it("does not accept an Expense bridge as canonical balance authority", async () => {
  await expect(
    getWorkerReimbursementBalances(balanceClient({ unapproved: true, expenseSource: true }))
  ).rejects.toThrow(/LEGACY_UNVERIFIED/);
});

import { approveWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
it("approval calls one atomic RPC with the verified actor and propagates rollback failure", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: null, error: { message: "injected transaction failure" } });
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: {
        worker_id: "w",
        amount: 25.5,
        project_id: null,
        canonical_ingested_at: "2026-09-10",
      },
      error: null,
    }),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  const c = { from: vi.fn().mockReturnValue(q), rpc } as unknown as SupabaseClient;
  await expect(approveWorkerReceiptWithClient(c, "r", "verified-user")).rejects.toThrow(
    "injected transaction failure"
  );
  expect(rpc).toHaveBeenCalledExactlyOnceWith("approve_worker_receipt_atomic", {
    p_receipt_id: "r",
    p_actor_user_id: "verified-user",
    p_expected_worker_id: "w",
    p_expected_amount: 25.5,
    p_expected_project_id: null,
  });
  await expect(approveWorkerReceiptWithClient(c, "r")).rejects.toThrow("Verified approval actor");
  expect(rpc).toHaveBeenCalledTimes(1);
});

import { getWorkerReceiptById } from "@/lib/worker-receipts-db";
import {
  getWorkerReimbursements,
  approveWorkerReimbursement,
} from "@/lib/worker-reimbursements-db";

describe("T3 invalid lifecycle states", () => {
  it.each([null, "unknown", ""])("does not normalize %s to payable pending", async (status) => {
    const q = chain();
    q.single.mockResolvedValue({ data: { id: "r", status }, error: null });
    q.maybeSingle.mockResolvedValue({ data: { id: "r", status }, error: null });
    const c = { from: () => q } as unknown as SupabaseClient;
    await expect(getWorkerReceiptById("r", c)).resolves.toMatchObject({
      status,
      workflowClass: "LEGACY_UNVERIFIED",
    });
    const list = {
      ...q,
      order: () => list,
      select: () => list,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: "r", status }], error: null }).then(resolve),
    };
    await expect(
      getWorkerReimbursements({ from: () => list } as unknown as SupabaseClient)
    ).resolves.toMatchObject([{ status, workflowClass: "LEGACY_UNVERIFIED" }]);
  });
  it("rejects the legacy obligation approval shortcut", async () => {
    await expect(approveWorkerReimbursement("r")).rejects.toThrow(/Receipt|Payment/);
  });
});
