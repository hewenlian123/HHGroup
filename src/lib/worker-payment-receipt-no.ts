/**
 * Display-only receipt number: R-YYYYMMDD-NNN (same calendar `payment_date`, ordered by created_at, id).
 * Does not persist to DB; UUID remains the canonical id for URLs and storage.
 */

import { getServerSupabaseAdmin } from "@/lib/supabase-server";

function paymentDateKey(iso: string): string {
  const s = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  return new Date().toISOString().slice(0, 10);
}

function yyyymmdd(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

function formatSeq(n: number): string {
  return n < 1000 ? String(n).padStart(3, "0") : String(n);
}

export async function computeWorkerPaymentReceiptNo(paymentId: string, paymentDateRaw: string): Promise<string> {
  const dateKey = paymentDateKey(paymentDateRaw);
  const day = yyyymmdd(dateKey);
  const c = getServerSupabaseAdmin();
  if (!c) {
    return `R-${day}-001`;
  }

  let rows: { id: string }[] = [];

  const byPaymentDate = await c
    .from("worker_payments")
    .select("id, created_at")
    .eq("payment_date", dateKey)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (!byPaymentDate.error && byPaymentDate.data) {
    rows = byPaymentDate.data as { id: string }[];
  } else if (byPaymentDate.error && /payment_date|schema cache/i.test(byPaymentDate.error.message ?? "")) {
    const wide = await c
      .from("worker_payments")
      .select("id, created_at, payment_date")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (!wide.error && wide.data) {
      rows = (wide.data as { id: string; payment_date?: string | null }[])
        .filter((r) => (r.payment_date ?? "").slice(0, 10) === dateKey)
        .map((r) => ({ id: r.id }));
    }
  }

  if (rows.length === 0) {
    return `R-${day}-001`;
  }

  const idx = rows.findIndex((r) => r.id === paymentId);
  const seq = idx >= 0 ? idx + 1 : rows.length + 1;
  return `R-${day}-${formatSeq(seq)}`;
}
