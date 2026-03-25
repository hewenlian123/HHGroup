"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function deletePaymentReceivedAction(
  paymentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = getServerSupabaseAdmin();
    const server = getServerSupabase();
    const c = admin ?? server;
    if (!c) return { ok: false, error: "Supabase is not configured." };

    // Financial safety system:
    // payments_received with deposits cannot be deleted; void instead.
    const { data: pay, error: fetchErr } = await c
      .from("payments_received")
      .select("id, invoice_id, payment_date, amount, notes, deposit_account, status")
      .eq("id", paymentId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load payment.");
    if (!pay) return { ok: false, error: "Payment not found." };

    const depRes = await c.from("deposits").select("id, status").eq("payment_id", paymentId);
    if (depRes.error) throw new Error(depRes.error.message ?? "Failed to load deposit.");
    const hasNonVoidDeposit = (depRes.data ?? []).some(
      (d: { status?: string | null }) => String(d.status ?? "recorded") !== "void"
    );
    // If a deposit exists, we must void (never hard-delete).
    if (hasNonVoidDeposit) {
      const { error: depVoidErr } = await c
        .from("deposits")
        .update({ status: "void" })
        .eq("payment_id", paymentId);
      if (depVoidErr) throw new Error(depVoidErr.message ?? "Failed to void deposit.");
    }

    // Best-effort: remove corresponding invoice_payment row (no FK; match by invoice_id, amount, date).
    if (pay.invoice_id) {
      try {
        const paidAt = typeof pay.payment_date === "string" ? pay.payment_date.slice(0, 10) : null;
        const amount = Number((pay as { amount?: number }).amount ?? 0);
        let q = c
          .from("invoice_payments")
          .update({ status: "Voided" })
          .eq("invoice_id", pay.invoice_id)
          .eq("amount", amount);
        if (paidAt) q = q.eq("paid_at", paidAt);
        const memo =
          (pay as { notes?: string }).notes ??
          (pay as { deposit_account?: string }).deposit_account;
        if (typeof memo === "string" && memo.trim()) q = q.eq("memo", memo.trim());
        await q;
      } catch {
        // schema or match may differ; continue
      }
    }

    // Payment itself: do not delete. Mark void.
    const { error: updErr } = await c
      .from("payments_received")
      .update({ status: "void" })
      .eq("id", paymentId);
    if (updErr) throw new Error(updErr.message ?? "Failed to void payment.");

    revalidatePath("/financial/payments");
    revalidatePath("/financial/payments-received");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete payment." };
  }
}
