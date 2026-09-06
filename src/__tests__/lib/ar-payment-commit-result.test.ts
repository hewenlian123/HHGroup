import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentReceived } from "@/lib/payments-received-db";
const payload = {
  idempotency_key: "intent",
  invoice_id: "invoice",
  customer_id: "customer",
  customer_name: "Customer",
  payment_date: "2026-09-06",
  amount: 3000,
  payment_method: "ACH",
};
it("returns the committed transaction result without a fallible post-commit reload", async () => {
  const payment = {
    id: "payment",
    invoice_id: "invoice",
    customer_id: "customer",
    amount: 3000,
    attachments: [],
  };
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      expect(args.p_customer_id).toBe("customer");
      return { data: { payment_id: "payment", payment }, error: null };
    },
    from: () => {
      throw new Error("Post-commit read unavailable");
    },
  } as unknown as SupabaseClient;
  expect(await createPaymentReceived(payload, client)).toEqual(payment);
});
it("retains a database rejection code so the UI can distinguish a rolled-back rejection from an unknown transport outcome", async () => {
  const client = {
    rpc: async () => ({
      data: null,
      error: { code: "23514", message: "Payment exceeds remaining balance" },
    }),
  } as unknown as SupabaseClient;
  await expect(createPaymentReceived(payload, client)).rejects.toMatchObject({ code: "23514" });
});
