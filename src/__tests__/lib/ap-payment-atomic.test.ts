import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addApBillPayment, createApBill } from "@/lib/ap-bills-db";

it("uses a stable payment intent and returns the committed AP payment without rereading", async () => {
  const row = { id: "payment", bill_id: "bill", amount: 40, payment_date: "2026-09-06" };
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("record_ap_bill_payment_atomic");
      expect(args.p_idempotency_key).toBe("intent");
      return { data: { payment: row }, error: null };
    },
    from: () => {
      throw new Error("Direct insert or post-commit read is unsafe");
    },
  } as unknown as SupabaseClient;
  expect(
    await addApBillPayment(
      "bill",
      { amount: 40, payment_date: "2026-09-06", idempotency_key: "intent" },
      client
    )
  ).toMatchObject(row);
});

it("rejects invalid payment amounts before a database write", async () => {
  const client = {
    rpc: () => {
      throw new Error("Unexpected write");
    },
  } as unknown as SupabaseClient;
  for (const amount of [0, -1, NaN, Infinity, 0.004]) {
    await expect(
      addApBillPayment(
        "bill",
        { amount, payment_date: "2026-09-06", idempotency_key: "intent" },
        client
      )
    ).rejects.toThrow(/valid|positive|amount/i);
  }
});

it("never silently drops subcontract linkage when bill creation reports a schema failure", async () => {
  let attempts = 0;
  const client = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () =>
            ++attempts === 1
              ? { data: null, error: { code: "42703", message: "subcontract_id missing" } }
              : { data: { id: "bill", amount: 100 }, error: null },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  await expect(
    createApBill(
      {
        vendor_name: "Subcontractor",
        amount: 100,
        subcontract_id: "contract",
        subcontractor_id: "vendor",
      },
      client
    )
  ).rejects.toThrow("subcontract_id missing");
  expect(attempts).toBe(1);
});
