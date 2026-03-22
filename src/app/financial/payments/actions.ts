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

    // Best-effort: read the payment to also remove associated deposit + invoice_payment.
    const { data: pay, error: fetchErr } = await c
      .from("payments_received")
      .select("id, invoice_id, payment_date, amount, notes, deposit_account")
      .eq("id", paymentId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load payment.");
    if (!pay) return { ok: false, error: "Payment not found." };

    // Best-effort: remove associated deposit (deposits.payment_id = payments_received.id).
    try {
      await c.from("deposits").delete().eq("payment_id", paymentId);
    } catch {
      // deposits table may lack payment_id or row; continue with payment delete
    }

    // Best-effort: remove corresponding invoice_payment row (no FK; match by invoice_id, amount, date).
    if (pay.invoice_id) {
      try {
        const paidAt = typeof pay.payment_date === "string" ? pay.payment_date.slice(0, 10) : null;
        const amount = Number((pay as { amount?: number }).amount ?? 0);
        let q = c
          .from("invoice_payments")
          .delete()
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

    // Delete payment itself.
    const { error: delErr } = await c.from("payments_received").delete().eq("id", paymentId);
    if (delErr) throw new Error(delErr.message ?? "Failed to delete payment.");

    revalidatePath("/financial/payments");
    revalidatePath("/financial/payments-received");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete payment." };
  }
}
