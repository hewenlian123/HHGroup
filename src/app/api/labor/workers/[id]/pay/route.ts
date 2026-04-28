import { NextResponse } from "next/server";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  appendLaborSettlementServiceRoleHint,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { createWorkerPaymentWithClient } from "@/lib/worker-payments-db";
import { computeImplicitSettlement } from "@/lib/worker-payment-implicit-settlement";
import {
  isLaborUnpaidForWorkerPayroll,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";

export const dynamic = "force-dynamic";

const AMOUNT_EPS = 0.02;

type PayBody = {
  amount?: number;
  payment_method?: string;
  payment_date?: string;
  notes?: string | null;
  labor_entry_ids?: string[];
  reimbursement_ids?: string[];
  /** Optional scope: only unpaid labor/reimb for this project participate in implicit settlement. */
  project_id?: string | null;
};

/**
 * POST: Create worker_payments row and settle selected labor_entries / worker_reimbursements.
 * Primary: set labor_entries.worker_payment_id = payment.id (keeps Draft/Approved status intact).
 * Fallback: set labor_entries.status = 'paid' only if worker_payment_id column is missing.
 *
 * Implicit (no labor_entry_ids / reimbursement_ids in body): amount must match a valid settlement
 * of unpaid labor + pending reimbursements in scope (full outstanding or subset-sum).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workerId } = await params;
  if (!workerId) {
    return NextResponse.json({ message: "Worker id required" }, { status: 400 });
  }

  let body: PayBody = {};
  try {
    body = (await req.json()) as PayBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const amount = Number(body.amount);
  const paymentMethod = typeof body.payment_method === "string" ? body.payment_method.trim() : "";
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "Valid amount is required" }, { status: 400 });
  }
  if (!paymentMethod) {
    return NextResponse.json({ message: "Payment method is required" }, { status: 400 });
  }

  const paymentDate = (body.payment_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  const projectIdForFilter =
    typeof body.project_id === "string" && body.project_id.trim().length > 0
      ? body.project_id.trim()
      : null;

  const admin = getServerSupabaseInternal();
  if (!admin) {
    return NextResponse.json({ message: SUPABASE_MISSING_SERVER_ENV_MESSAGE }, { status: 503 });
  }

  const laborIdsIn = Array.isArray(body.labor_entry_ids)
    ? body.labor_entry_ids.filter(Boolean)
    : null;
  const reimbIdsIn = Array.isArray(body.reimbursement_ids)
    ? body.reimbursement_ids.filter(Boolean)
    : null;
  const explicitSelection = laborIdsIn !== null || reimbIdsIn !== null;
  const laborIds = laborIdsIn ?? [];
  const reimbIds = reimbIdsIn ?? [];

  try {
    let expectedTotal = 0;
    let plannedLaborIds: string[] = [];
    let plannedReimbIds: string[] = [];

    if (explicitSelection) {
      if (laborIds.length === 0 && reimbIds.length === 0) {
        return NextResponse.json(
          { message: "Select at least one labor entry or reimbursement to pay." },
          { status: 400 }
        );
      }

      if (laborIds.length > 0) {
        let laborSettlementMode: LaborPayrollSettlementMode = "payment_link";
        let laborQ: {
          data: unknown;
          error: { message?: string } | null;
        } = await admin
          .from("labor_entries")
          .select("id, worker_id, cost_amount, total, status, worker_payment_id")
          .eq("worker_id", workerId)
          .in("id", laborIds);
        if (laborQ.error && /column|schema cache|total/i.test(laborQ.error.message ?? "")) {
          laborQ = await admin
            .from("labor_entries")
            .select("id, worker_id, cost_amount, status, worker_payment_id")
            .eq("worker_id", workerId)
            .in("id", laborIds);
        }
        if (
          laborQ.error &&
          /column|schema cache|worker_payment_id/i.test(laborQ.error.message ?? "")
        ) {
          laborSettlementMode = "status_fallback";
          laborQ = await admin
            .from("labor_entries")
            .select("id, worker_id, cost_amount, total, status")
            .eq("worker_id", workerId)
            .in("id", laborIds);
          if (laborQ.error && /column|schema cache|total/i.test(laborQ.error.message ?? "")) {
            laborQ = await admin
              .from("labor_entries")
              .select("id, worker_id, cost_amount, status")
              .eq("worker_id", workerId)
              .in("id", laborIds);
          }
        }
        const { data: laborRows, error: leErr } = laborQ;
        if (leErr) throw new Error(leErr.message ?? "Failed to validate labor entries.");
        const rows = (laborRows ?? []) as {
          id: string;
          worker_id: string;
          cost_amount?: number | null;
          total?: number | null;
          status?: string | null;
          worker_payment_id?: string | null;
        }[];
        if (rows.length !== laborIds.length) {
          return NextResponse.json(
            { message: "One or more labor entries were not found for this worker." },
            { status: 400 }
          );
        }
        for (const r of rows) {
          if (!isLaborUnpaidForWorkerPayroll(r.status, r.worker_payment_id, laborSettlementMode)) {
            return NextResponse.json(
              { message: "One or more labor entries are already settled." },
              { status: 400 }
            );
          }
          expectedTotal += Number(r.cost_amount ?? r.total) || 0;
        }
      }

      if (reimbIds.length > 0) {
        const { data: reimbRows, error: reErr } = await admin
          .from("worker_reimbursements")
          .select("id, worker_id, amount, status")
          .eq("worker_id", workerId)
          .in("id", reimbIds);
        if (reErr) throw new Error(reErr.message ?? "Failed to validate reimbursements.");
        const rows = (reimbRows ?? []) as {
          id: string;
          worker_id: string;
          amount?: number | null;
          status?: string | null;
        }[];
        if (rows.length !== reimbIds.length) {
          return NextResponse.json(
            { message: "One or more reimbursements were not found for this worker." },
            { status: 400 }
          );
        }
        for (const r of rows) {
          if (String(r.status ?? "").toLowerCase() === "paid") {
            return NextResponse.json(
              { message: "One or more reimbursements are already paid." },
              { status: 400 }
            );
          }
          expectedTotal += Number(r.amount) || 0;
        }
      }

      if (Math.abs(expectedTotal - amount) > AMOUNT_EPS) {
        return NextResponse.json(
          {
            message: `Payment amount must match selected items (expected ${expectedTotal.toFixed(2)}).`,
          },
          { status: 400 }
        );
      }
      plannedLaborIds = laborIds;
      plannedReimbIds = reimbIds;
    } else {
      const implicit = await computeImplicitSettlement(admin, workerId, amount, projectIdForFilter);
      plannedLaborIds = implicit.laborIds;
      plannedReimbIds = implicit.reimbIds;
    }

    const payment = await createWorkerPaymentWithClient(admin, {
      workerId,
      projectId: projectIdForFilter,
      amount,
      paymentMethod,
      paymentDate,
      notes,
    });

    const persistPaymentLaborIds = async (paymentId: string, laborIds: string[]) => {
      if (laborIds.length === 0) return;
      const { error } = await admin
        .from("worker_payments")
        .update({ labor_entry_ids: laborIds })
        .eq("id", paymentId);
      if (error && !/column|schema cache|labor_entry_ids/i.test(error.message ?? "")) {
        console.warn(
          "[pay worker] could not persist labor_entry_ids on worker_payments:",
          error.message
        );
      }
    };

    const updateLaborWithPaymentId = async (
      ids: string[]
    ): Promise<{ ok: boolean; error?: string; settledLaborIds: string[] }> => {
      if (ids.length === 0) return { ok: true, settledLaborIds: [] };
      const { data: updated, error } = await admin
        .from("labor_entries")
        .update({ worker_payment_id: payment.id })
        .eq("worker_id", workerId)
        .in("id", ids)
        .select("id");
      if (!error) {
        const got = (updated ?? []) as { id: string }[];
        if (got.length !== ids.length) {
          return {
            ok: false,
            settledLaborIds: [],
            error: `Could not link all labor entries to payment (expected ${ids.length}, updated ${got.length}).`,
          };
        }
        return { ok: true, settledLaborIds: got.map((r) => r.id) };
      }
      if (/column|schema cache|worker_payment_id/i.test(error.message ?? "")) {
        const { data: upd2, error: e2 } = await admin
          .from("labor_entries")
          .update({ status: "paid" })
          .eq("worker_id", workerId)
          .in("id", ids)
          .select("id");
        if (e2) {
          return {
            ok: false,
            settledLaborIds: [],
            error:
              e2.message ?? "Could not mark labor paid (check DB: worker_payment_id or status).",
          };
        }
        const got2 = (upd2 ?? []) as { id: string }[];
        if (got2.length !== ids.length) {
          return {
            ok: false,
            settledLaborIds: [],
            error: `Could not mark all labor entries paid (expected ${ids.length}, updated ${got2.length}).`,
          };
        }
        return { ok: true, settledLaborIds: got2.map((r) => r.id) };
      }
      return {
        ok: false,
        settledLaborIds: [],
        error: error.message ?? "Failed to update labor entries.",
      };
    };

    const settleReimbForIds = async (ids: string[]): Promise<{ ok: boolean; error?: string }> => {
      if (ids.length === 0) return { ok: true };
      const paidAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        status: "paid",
        paid_at: paidAt,
        payment_id: payment.id,
      };
      const { error } = await admin
        .from("worker_reimbursements")
        .update(payload)
        .eq("worker_id", workerId)
        .in("id", ids);
      if (!error) return { ok: true };
      if (/column|schema cache|payment_id|paid_at/i.test(error.message ?? "")) {
        const { error: e2 } = await admin
          .from("worker_reimbursements")
          .update({ status: "paid" })
          .eq("worker_id", workerId)
          .in("id", ids);
        if (e2) return { ok: false, error: e2.message ?? "Failed to update reimbursements." };
        return { ok: true };
      }
      return { ok: false, error: error.message ?? "Failed to update reimbursements." };
    };

    const laborResult = await updateLaborWithPaymentId(plannedLaborIds);
    if (!laborResult.ok) {
      await admin.from("worker_payments").delete().eq("id", payment.id);
      return NextResponse.json(
        {
          message: appendLaborSettlementServiceRoleHint(
            laborResult.error ?? "Failed to settle labor entries."
          ),
        },
        { status: 500 }
      );
    }

    const reimbResult = await settleReimbForIds(plannedReimbIds);
    if (!reimbResult.ok) {
      await admin
        .from("labor_entries")
        .update({ worker_payment_id: null })
        .eq("worker_payment_id", payment.id);
      await admin.from("worker_payments").delete().eq("id", payment.id);
      return NextResponse.json(
        {
          message: appendLaborSettlementServiceRoleHint(
            reimbResult.error ?? "Failed to settle reimbursements."
          ),
        },
        { status: 500 }
      );
    }

    await persistPaymentLaborIds(payment.id, laborResult.settledLaborIds ?? []);

    return NextResponse.json({ ok: true, payment });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}
