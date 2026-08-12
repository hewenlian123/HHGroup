import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  appendLaborSettlementServiceRoleHint,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  createWorkerPaymentWithClient,
  getWorkerPaymentByIdempotencyKeyWithClient,
} from "@/lib/worker-payments-db";
import { computeImplicitSettlement } from "@/lib/worker-payment-implicit-settlement";
import {
  isLaborUnpaidForWorkerPayroll,
  laborEntryPaymentIdMapFromWorkerPayments,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";

export const dynamic = "force-dynamic";

const AMOUNT_EPS = 0.02;

type PayBody = {
  amount?: number;
  payment_method?: string;
  payment_date?: string;
  notes?: string | null;
  idempotency_key?: string | null;
  labor_entry_ids?: string[];
  reimbursement_ids?: string[];
  /** Open/pending worker_advances amount to apply as a non-cash deduction for selected items. */
  advance_deduction_amount?: number;
  /** Optional scope: only unpaid labor/reimb for this project participate in implicit settlement. */
  project_id?: string | null;
};

type PendingAdvanceRow = {
  id: string;
  amount?: number | null;
  status?: string | null;
  advance_date?: string | null;
  created_at?: string | null;
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

function chooseAdvanceRowsForDeduction(
  rows: PendingAdvanceRow[],
  deductionAmount: number
): PendingAdvanceRow[] {
  const target = toCents(deductionAmount);
  if (target <= 0) return [];
  const sorted = [...rows].sort(
    (a, b) =>
      String(a.advance_date ?? "").localeCompare(String(b.advance_date ?? "")) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
      a.id.localeCompare(b.id)
  );
  const memo = new Map<string, PendingAdvanceRow[] | null>();
  const pick = (index: number, remaining: number): PendingAdvanceRow[] | null => {
    if (remaining === 0) return [];
    if (remaining < 0 || index >= sorted.length) return null;
    const key = `${index}:${remaining}`;
    if (memo.has(key)) return memo.get(key)!;
    const without = pick(index + 1, remaining);
    if (without) {
      memo.set(key, without);
      return without;
    }
    const current = sorted[index];
    const cents = toCents(Number(current?.amount) || 0);
    const withCurrent = pick(index + 1, remaining - cents);
    const result = current && withCurrent ? [current, ...withCurrent] : null;
    memo.set(key, result);
    return result;
  };
  return pick(0, target) ?? [];
}

/**
 * POST: Create worker_payments row and settle selected labor_entries / worker_reimbursements.
 * Primary: set labor_entries.worker_payment_id = payment.id (keeps Draft/Approved status intact).
 * Fallback: set labor_entries.status = 'paid' only if worker_payment_id column is missing.
 *
 * Implicit (no labor_entry_ids / reimbursement_ids in body): amount must match a valid settlement
 * of unpaid labor + pending reimbursements in scope (full outstanding or subset-sum).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseInternalNoStore);
  if (!guard.ok) return guard.response;
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

  const paymentDate = (body.payment_date ?? workerRateLocalYmd()).slice(0, 10);
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  const advanceDeductionAmount = Number(body.advance_deduction_amount ?? 0);
  if (!Number.isFinite(advanceDeductionAmount) || advanceDeductionAmount < 0) {
    return NextResponse.json(
      { message: "Advance deduction must be non-negative." },
      { status: 400 }
    );
  }
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim().length > 0
      ? body.idempotency_key.trim().slice(0, 200)
      : null;
  const projectIdForFilter =
    typeof body.project_id === "string" && body.project_id.trim().length > 0
      ? body.project_id.trim()
      : null;

  const admin = guard.client;
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
    if (idempotencyKey) {
      const existing = await getWorkerPaymentByIdempotencyKeyWithClient(admin, idempotencyKey);
      if (existing) return NextResponse.json({ ok: true, payment: existing, reused: true });
      if (existing === undefined) {
        return NextResponse.json(
          { message: "worker_payments.idempotency_key is required before recording payments." },
          { status: 503 }
        );
      }
    }

    let expectedTotal = 0;
    let plannedLaborIds: string[] = [];
    let plannedReimbIds: string[] = [];
    let plannedAdvanceIds: string[] = [];

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
          .select(
            "id, worker_id, labor_cost_snapshot, amount_snapshot, cost_amount, total, status, worker_payment_id"
          )
          .eq("worker_id", workerId)
          .in("id", laborIds);
        if (laborQ.error && /column|schema cache|total/i.test(laborQ.error.message ?? "")) {
          laborQ = await admin
            .from("labor_entries")
            .select(
              "id, worker_id, labor_cost_snapshot, amount_snapshot, cost_amount, status, worker_payment_id"
            )
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
            .select(
              "id, worker_id, labor_cost_snapshot, amount_snapshot, cost_amount, total, status"
            )
            .eq("worker_id", workerId)
            .in("id", laborIds);
          if (laborQ.error && /column|schema cache|total/i.test(laborQ.error.message ?? "")) {
            laborQ = await admin
              .from("labor_entries")
              .select("id, worker_id, labor_cost_snapshot, amount_snapshot, cost_amount, status")
              .eq("worker_id", workerId)
              .in("id", laborIds);
          }
        }
        const { data: laborRows, error: leErr } = laborQ;
        if (leErr) throw new Error(leErr.message ?? "Failed to validate labor entries.");
        const rows = (laborRows ?? []) as {
          id: string;
          worker_id: string;
          amount_snapshot?: number | null;
          labor_cost_snapshot?: number | null;
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
        const paymentLinksRes = await admin
          .from("worker_payments")
          .select("id, labor_entry_ids")
          .eq("worker_id", workerId);
        const paymentLinksMissingLaborIds =
          paymentLinksRes.error &&
          /column|schema cache|labor_entry_ids/i.test(paymentLinksRes.error.message ?? "");
        if (paymentLinksRes.error && !paymentLinksMissingLaborIds) {
          throw new Error(paymentLinksRes.error.message ?? "Failed to validate labor links.");
        }
        const paymentIdByLaborEntryId = laborEntryPaymentIdMapFromWorkerPayments(
          (!paymentLinksMissingLaborIds ? (paymentLinksRes.data ?? []) : []) as Array<{
            id?: unknown;
            labor_entry_ids?: unknown;
          }>
        );
        for (const r of rows) {
          const effectiveWorkerPaymentId =
            String(r.worker_payment_id ?? "").trim() || paymentIdByLaborEntryId.get(r.id) || null;
          if (
            !isLaborUnpaidForWorkerPayroll(r.status, effectiveWorkerPaymentId, laborSettlementMode)
          ) {
            return NextResponse.json(
              { message: "One or more labor entries are already settled." },
              { status: 400 }
            );
          }
          expectedTotal +=
            Number(r.labor_cost_snapshot ?? r.amount_snapshot ?? r.cost_amount ?? r.total) || 0;
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

      if (advanceDeductionAmount > 0) {
        const { data: advanceRows, error: advanceErr } = await admin
          .from("worker_advances")
          .select("id, amount, status, advance_date, created_at")
          .eq("worker_id", workerId)
          .eq("status", "pending");
        if (advanceErr) throw new Error(advanceErr.message ?? "Failed to validate advances.");
        const rows = ((advanceRows ?? []) as PendingAdvanceRow[]).filter(
          (r) => toCents(Number(r.amount) || 0) > 0
        );
        const availableAdvanceCents = rows.reduce(
          (sum, row) => sum + toCents(Number(row.amount) || 0),
          0
        );
        if (toCents(advanceDeductionAmount) > availableAdvanceCents) {
          return NextResponse.json(
            { message: "Advance deduction exceeds open advances." },
            { status: 400 }
          );
        }
        const chosenAdvances = chooseAdvanceRowsForDeduction(rows, advanceDeductionAmount);
        const chosenTotal = fromCents(
          chosenAdvances.reduce((sum, row) => sum + toCents(Number(row.amount) || 0), 0)
        );
        if (
          chosenAdvances.length === 0 ||
          Math.abs(chosenTotal - advanceDeductionAmount) > AMOUNT_EPS
        ) {
          return NextResponse.json(
            { message: "Advance deduction must match whole open advance records." },
            { status: 400 }
          );
        }
        plannedAdvanceIds = chosenAdvances.map((row) => row.id);
      }

      if (Math.abs(expectedTotal - (amount + advanceDeductionAmount)) > AMOUNT_EPS) {
        return NextResponse.json(
          {
            message: `Payment amount plus advance deduction must match selected items (expected ${expectedTotal.toFixed(2)}).`,
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
      idempotencyKey,
    });

    const rollbackAdvances = async (ids: string[]) => {
      if (ids.length === 0) return;
      await admin.from("worker_advances").update({ status: "pending" }).in("id", ids);
    };

    const deductAdvancesForIds = async (
      ids: string[]
    ): Promise<{ ok: boolean; error?: string }> => {
      if (ids.length === 0) return { ok: true };
      const { data: updated, error } = await admin
        .from("worker_advances")
        .update({ status: "deducted" })
        .eq("worker_id", workerId)
        .in("id", ids)
        .select("id");
      if (error) return { ok: false, error: error.message ?? "Failed to deduct advances." };
      const got = (updated ?? []) as { id: string }[];
      if (got.length !== ids.length) {
        return {
          ok: false,
          error: `Could not deduct all advances (expected ${ids.length}, updated ${got.length}).`,
        };
      }
      return { ok: true };
    };

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
      await rollbackAdvances(plannedAdvanceIds);
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
      await rollbackAdvances(plannedAdvanceIds);
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

    const advanceResult = await deductAdvancesForIds(plannedAdvanceIds);
    if (!advanceResult.ok) {
      await admin
        .from("labor_entries")
        .update({ worker_payment_id: null })
        .eq("worker_payment_id", payment.id);
      if (plannedReimbIds.length > 0) {
        await admin
          .from("worker_reimbursements")
          .update({ status: "pending", paid_at: null, payment_id: null })
          .eq("worker_id", workerId)
          .in("id", plannedReimbIds);
      }
      await admin.from("worker_payments").delete().eq("id", payment.id);
      return NextResponse.json(
        {
          message: appendLaborSettlementServiceRoleHint(
            advanceResult.error ?? "Failed to deduct advances."
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
