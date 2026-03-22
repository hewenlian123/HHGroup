/**
 * Display-only receipt number: R-YYYYMMDD-NNN (same calendar day in UTC by created_at, ordered by created_at, id).
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

export async function computeWorkerPaymentReceiptNo(
  paymentId: string,
  paymentDateRaw: string
): Promise<string> {
  const dateKey = paymentDateKey(paymentDateRaw);
  const day = yyyymmdd(dateKey);
  const c = getServerSupabaseAdmin();
  if (!c) {
    return `R-${day}-001`;
  }

  const start = `${dateKey}T00:00:00.000Z`;
  const end = `${dateKey}T23:59:59.999Z`;

  const { data, error } = await c
    .from("worker_payments")
    .select("id, created_at")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const rows = (!error && data ? data : []) as { id: string }[];

  if (rows.length === 0) {
    return `R-${day}-001`;
  }

  const idx = rows.findIndex((r) => r.id === paymentId);
  const seq = idx >= 0 ? idx + 1 : rows.length + 1;
  return `R-${day}-${formatSeq(seq)}`;
}
