import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkerReceipts, insertWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { getWorkerReimbursements } from "@/lib/worker-reimbursements-db";

function client(row: Record<string, unknown>) {
  const q = {
    select: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve),
  };
  q.select.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.in.mockReturnValue(q);
  return { from: vi.fn(() => q) } as unknown as SupabaseClient;
}
describe("canonical Receipt boundary reads", () => {
  it.each([null, "unexpected", "Pending"])(
    "preserves legacy Receipt status %s and NULL Worker",
    async (status) => {
      const [row] = await getWorkerReceipts(client({ id: "r", status, worker_id: null }));
      expect(row).toMatchObject({ status, workerId: null, workflowClass: "LEGACY_UNVERIFIED" });
    }
  );
  it("requires exact marked bidirectional obligation provenance", async () => {
    const source = {
      id: "r",
      canonical_ingested_at: "2026-09-10",
      reimbursement_id: "o",
      status: "Approved",
      worker_id: "w",
      project_id: null,
      amount: 23.45,
    };
    const raw = {
      id: "o",
      worker_id: "w",
      project_id: null,
      source_worker_receipt_id: "r",
      amount: 23.45,
      status: "pending",
      source_receipt: source,
    };
    expect((await getWorkerReimbursements(client(raw)))[0].workflowClass).toBe("canonical");
    for (const patch of [
      { canonical_ingested_at: null },
      { reimbursement_id: "other" },
      { worker_id: "other" },
      { project_id: "other" },
      { amount: 23.46 },
      { status: "Pending" },
      { status: "unknown" },
      { status: null },
    ]) {
      expect(
        (
          await getWorkerReimbursements(client({ ...raw, source_receipt: { ...source, ...patch } }))
        )[0].workflowClass
      ).toBe("LEGACY_UNVERIFIED");
    }
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        (
          await getWorkerReimbursements(
            client({ ...raw, amount, source_receipt: { ...source, amount } })
          )
        )[0].workflowClass
      ).toBe("LEGACY_UNVERIFIED");
    }
    expect(
      (await getWorkerReimbursements(client({ id: "old", status: null, worker_id: null })))[0]
    ).toMatchObject({ status: null, workerId: null, workflowClass: "LEGACY_UNVERIFIED" });
  });
  it("uses stable upload identity and never submits a caller-owned marker or lifecycle", async () => {
    const id = "12345678-1234-4234-8234-123456789012";
    const rpc = vi.fn().mockResolvedValue({
      data: { id, canonical_ingested_at: "2026-09-10", status: "Pending" },
      error: null,
    });
    await insertWorkerReceiptWithClient({ rpc } as unknown as SupabaseClient, {
      workerId: "w",
      workerName: "Worker",
      projectId: null,
      amount: 23.45,
      expenseType: "Other",
      receiptUrl: `uploads/${id}.jpg`,
      status: "Approved",
    });
    expect(rpc).toHaveBeenCalledWith("intake_worker_receipt_atomic", {
      p_receipt_id: id,
      p_payload: expect.not.objectContaining({ status: expect.anything() }),
    });
  });
});

import { getWorkerReceiptById } from "@/lib/worker-receipts-db";
import {
  getReimbursementById,
  getWorkerReimbursementsByWorkerId,
  getWorkerReimbursementBalances,
} from "@/lib/worker-reimbursements-db";

function oldSchemaClient(error: { code: string; message: string }, fallbackError = false) {
  const selects: string[] = [];
  const row = {
    id: "old",
    worker_id: null,
    project_id: null,
    status: "unrecognized",
    amount: 12.34,
  };
  const from = vi.fn(() => {
    let single = false;
    const q = {
      select(columns: string) {
        selects.push(columns);
        return q;
      },
      order: () => q,
      eq: () => q,
      maybeSingle() {
        single = true;
        return q;
      },
      then(resolve: (result: unknown) => unknown) {
        const first = selects.length === 1;
        return Promise.resolve({
          data: first || fallbackError ? null : single ? row : [row],
          error: first
            ? error
            : fallbackError
              ? { code: "42501", message: "permission denied" }
              : null,
        }).then(resolve);
      },
    };
    return q;
  });
  return { client: { from } as unknown as SupabaseClient, selects, from };
}

describe("read-only pre-boundary schema compatibility", () => {
  it.each([getWorkerReceipts, (c: SupabaseClient) => getWorkerReceiptById("old", c)])(
    "preserves legacy Receipt rows when only intake marker is absent",
    async (read) => {
      const mock = oldSchemaClient({
        code: "42703",
        message: "column worker_receipts.canonical_ingested_at does not exist",
      });
      const result = await read(mock.client);
      const row = Array.isArray(result) ? result[0] : result;
      expect(row).toMatchObject({
        status: "unrecognized",
        workerId: null,
        workflowClass: "LEGACY_UNVERIFIED",
      });
      expect(mock.selects).toHaveLength(2);
      expect(mock.selects[1]).not.toContain("canonical_ingested_at");
    }
  );
  it.each([
    { code: "42703", message: "column worker_receipts_1.canonical_ingested_at does not exist" },
    {
      code: "PGRST204",
      message:
        "Could not find the 'source_worker_receipt_id' column of 'worker_reimbursements' in the schema cache",
    },
    {
      code: "PGRST200",
      message:
        "Could not find relationship using hint 'worker_reimbursements_source_worker_receipt_id_fkey'",
    },
  ])(
    "uses legacy obligation reads only for precise boundary schema absence: $code",
    async (error) => {
      for (const read of [
        getWorkerReimbursements,
        (c: SupabaseClient) => getReimbursementById("old", c),
        (c: SupabaseClient) => getWorkerReimbursementsByWorkerId("w", c),
      ]) {
        const mock = oldSchemaClient(error);
        const result = await read(mock.client);
        const row = Array.isArray(result) ? result[0] : result;
        expect(row).toMatchObject({
          status: "unrecognized",
          workerId: null,
          workflowClass: "LEGACY_UNVERIFIED",
          amount: 12.34,
        });
        expect(mock.selects).toHaveLength(2);
        expect(mock.selects[1]).not.toMatch(
          /source_worker_receipt_id|source_receipt|canonical_ingested_at/
        );
      }
    }
  );
  it.each([
    { code: "42501", message: "permission denied for canonical_ingested_at" },
    { code: "42703", message: "column vendor does not exist" },
    { code: "PGRST200", message: "Could not find unrelated relationship" },
    { code: "PGRST205", message: "Could not find worker_receipts table" },
    { code: "", message: "network error" },
  ])("does not mask unrelated failures: $code $message", async (error) => {
    for (const read of [getWorkerReceipts, getWorkerReimbursements]) {
      const mock = oldSchemaClient(error);
      await expect(read(mock.client)).rejects.toThrow();
      expect(mock.selects).toHaveLength(1);
    }
  });
  it("propagates failed legacy reads and never attempts a write fallback", async () => {
    const mock = oldSchemaClient(
      { code: "42703", message: "canonical_ingested_at does not exist" },
      true
    );
    await expect(getWorkerReceipts(mock.client)).rejects.toThrow("permission denied");
    expect(mock.selects).toHaveLength(2);
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "intake RPC missing" },
    });
    const from = vi.fn();
    await expect(
      insertWorkerReceiptWithClient({ rpc, from } as unknown as SupabaseClient, {
        workerName: "Worker",
        projectId: null,
        expenseType: "Other",
        amount: 12.34,
        receiptUrl: "uploads/12345678-1234-4234-8234-123456789012.jpg",
      })
    ).rejects.toThrow("intake RPC missing");
    expect(from).not.toHaveBeenCalled();
  });
  it("reports old-schema balances unavailable, never partial or zero", async () => {
    const c = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: null,
            error: { code: "42703", message: "column canonical_ingested_at does not exist" },
            count: null,
          }),
      }),
    } as unknown as SupabaseClient;
    await expect(getWorkerReimbursementBalances(c)).rejects.toThrow(
      /Legacy \/ Unverified: balances are unavailable/
    );
  });
});
