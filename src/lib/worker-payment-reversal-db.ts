import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkerPaymentReversalResult = {
  payment_id: string;
  reused: boolean;
};

function isResult(value: unknown): value is WorkerPaymentReversalResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.payment_id === "string" && typeof row.reused === "boolean";
}

export async function reverseWorkerPayment(
  paymentId: string,
  idempotencyKey: string,
  client: SupabaseClient
): Promise<WorkerPaymentReversalResult> {
  const normalizedPaymentId = paymentId.trim();
  const normalizedKey = idempotencyKey.trim();
  if (!normalizedPaymentId) throw new Error("Payment id required.");
  if (!normalizedKey) throw new Error("Worker payment reversal idempotency key is required.");

  const { data, error } = await client.rpc("reverse_worker_payment_atomic", {
    p_payment_id: normalizedPaymentId,
    p_idempotency_key: normalizedKey,
  });
  if (error) throw new Error(error.message ?? "Failed to reverse worker payment.");
  if (!isResult(data)) {
    throw new Error("Atomic worker payment reversal returned an invalid result.");
  }
  return data;
}
