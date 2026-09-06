import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ client: {}, deny: false, writes: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminServerActionClient: async () =>
    state.deny ? { ok: false, error: "Access unavailable" } : { ok: true, client: state.client },
  requireSupabaseOwnerOrAdminServerActionWithClient: async (factory: () => unknown) => ({
    ok: true,
    client: factory(),
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => ({ privileged: true }),
  createServerSupabaseClient: async () => state.client,
}));
vi.mock("@/lib/payments-received-db", () => ({
  createPaymentReceived: async (_payload: unknown, client: unknown) => {
    if (client !== state.client) throw new Error("Caller session was replaced");
    state.writes++;
    return { id: "payment", invoice_id: "invoice", project_id: "project" };
  },
}));
import { createPaymentReceivedAction } from "@/app/financial/payments/actions";
const payload = {
  idempotency_key: "intent",
  invoice_id: "invoice",
  customer_name: "Customer",
  payment_date: "2026-09-06",
  amount: 3000,
  payment_method: "ACH",
};
beforeEach(() => {
  state.deny = false;
  state.writes = 0;
});
it("records through the authenticated caller session", async () => {
  expect(await createPaymentReceivedAction(payload)).toEqual({ ok: true, paymentId: "payment" });
  expect(state.writes).toBe(1);
});
it("a denied session cannot mutate payment state", async () => {
  state.deny = true;
  expect(await createPaymentReceivedAction(payload)).toMatchObject({
    ok: false,
    error: "Access unavailable",
  });
  expect(state.writes).toBe(0);
});
