import { NextResponse } from "next/server";
import { getServerSupabaseInternal } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function parseLaborEntryIds(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return [];
}

/**
 * DELETE: Remove worker_payments row and reverse settlement on labor_entries + worker_reimbursements
 * so balances and "paid" state match accounting reality.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: paymentId } = await params;
  if (!paymentId?.trim()) {
    return NextResponse.json({ message: "Payment id required." }, { status: 400 });
  }

  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json(
      { message: "Supabase not configured; cannot reverse payment settlement." },
      { status: 500 }
    );
  }

  try {
    let paymentRow: { id: string; worker_id: string; labor_entry_ids?: unknown } | null = null;

    const selFull = await admin
      .from("worker_payments")
      .select("id, worker_id, labor_entry_ids")
      .eq("id", paymentId)
      .maybeSingle();

    if (selFull.error && /labor_entry_ids|schema cache/i.test(selFull.error.message ?? "")) {
      const selBase = await admin
        .from("worker_payments")
        .select("id, worker_id")
        .eq("id", paymentId)
        .maybeSingle();
      if (selBase.error) throw new Error(selBase.error.message ?? "Failed to load payment.");
      paymentRow = selBase.data as { id: string; worker_id: string };
    } else if (selFull.error) {
      throw new Error(selFull.error.message ?? "Failed to load payment.");
    } else {
      paymentRow = selFull.data as { id: string; worker_id: string; labor_entry_ids?: unknown };
    }

    if (!paymentRow) {
      return NextResponse.json({ message: "Payment not found." }, { status: 404 });
    }

    const workerId = paymentRow.worker_id;
    const laborEntryIds = parseLaborEntryIds(paymentRow.labor_entry_ids);

    // 1) Reimbursements tied to this payout → back to unpaid queue
    const reimbPatch: Record<string, unknown> = {
      status: "pending",
      paid_at: null,
      payment_id: null,
    };
    let reimbUp = await admin
      .from("worker_reimbursements")
      .update(reimbPatch)
      .eq("payment_id", paymentId);
    if (
      reimbUp.error &&
      /column|schema cache|payment_id|paid_at/i.test(reimbUp.error.message ?? "")
    ) {
      reimbUp = await admin
        .from("worker_reimbursements")
        .update({ status: "pending" })
        .eq("payment_id", paymentId);
    }
    if (reimbUp.error && !/column|schema cache|payment_id/i.test(reimbUp.error.message ?? "")) {
      console.warn("[delete worker payment] reimbursements:", reimbUp.error.message);
    }

    // 2) Labor rows linked by FK — clear link; legacy pay used status "paid" → Approved (workflow enum)
    const paidVariants = ["paid", "Paid", "PAID"] as const;
    const uPaid = await admin
      .from("labor_entries")
      .update({ worker_payment_id: null, status: "Approved" })
      .eq("worker_payment_id", paymentId)
      .in("status", [...paidVariants]);
    if (uPaid.error && /column|schema cache|worker_payment_id/i.test(uPaid.error.message ?? "")) {
      if (laborEntryIds.length > 0) {
        await admin
          .from("labor_entries")
          .update({ status: "Approved" })
          .eq("worker_id", workerId)
          .in("id", laborEntryIds)
          .in("status", [...paidVariants]);
      }
    } else if (uPaid.error) {
      throw new Error(uPaid.error.message ?? "Failed to unlink paid labor entries.");
    }

    const uRest = await admin
      .from("labor_entries")
      .update({ worker_payment_id: null })
      .eq("worker_payment_id", paymentId);
    if (uRest.error && /column|schema cache|worker_payment_id/i.test(uRest.error.message ?? "")) {
      /* worker_payment_id column missing — rely on legacy status + labor_entry_ids above */
    } else if (uRest.error) {
      throw new Error(uRest.error.message ?? "Failed to unlink labor entries.");
    }

    // 3) Legacy: rows listed on payment but only marked via status "paid" (no worker_payment_id)
    if (laborEntryIds.length > 0) {
      const leg = await admin
        .from("labor_entries")
        .update({ status: "Approved" })
        .eq("worker_id", workerId)
        .in("id", laborEntryIds)
        .in("status", [...paidVariants]);
      if (leg.error) {
        console.warn("[delete worker payment] legacy labor_entry_ids status:", leg.error.message);
      }
    }

    // 4) Any remaining FK refs (if step 2 missed) — ON DELETE SET NULL still helps; explicit delete last
    const { error: delErr } = await admin.from("worker_payments").delete().eq("id", paymentId);
    if (delErr) {
      if (/relation.*does not exist|schema cache|pgrst205/i.test(delErr.message ?? "")) {
        return NextResponse.json(
          { message: "worker_payments table not available." },
          { status: 503 }
        );
      }
      throw new Error(delErr.message ?? "Failed to delete payment.");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete payment.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
