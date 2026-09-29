import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { expenseHeaderMatchesLines } from "@/lib/expense-header-total";
import { getExpenseById } from "@/lib/expenses-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineInput = {
  id?: unknown;
  projectId?: unknown;
  category?: unknown;
  amount?: unknown;
  clientReimbursable?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdminWithClient(
    request,
    getServerSupabaseInternalNoStore
  );
  if (!guard.ok) return guard.response;
  if (!guard.client) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503 }
    );
  }
  const expenseId = params.id?.trim();
  if (!expenseId) {
    return NextResponse.json({ ok: false, message: "Expense id is required." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid review payload." }, { status: 400 });
  }

  const lines = Array.isArray(body.lines) ? (body.lines as LineInput[]) : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { ok: false, message: "At least one expense line is required." },
      { status: 400 }
    );
  }
  const amounts = lines.map((line) => Number(line.amount));
  if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json(
      { ok: false, message: "Each line amount must be a number." },
      { status: 400 }
    );
  }
  if (lines.length > 1 && body.headerTotal != null) {
    const headerTotal = Number(body.headerTotal);
    if (!expenseHeaderMatchesLines(headerTotal, amounts)) {
      return NextResponse.json(
        { ok: false, message: "Header total must equal the sum of the expense lines." },
        { status: 409 }
      );
    }
  }

  const headerPatch: Record<string, unknown> = {};
  if (text(body.date)) headerPatch.expenseDate = text(body.date);
  if (typeof body.vendorName === "string")
    headerPatch.vendorName = body.vendorName.trim() || "Unknown";
  if (typeof body.referenceNo === "string") headerPatch.referenceNo = body.referenceNo.trim();
  if (body.paymentAccountId !== undefined) {
    headerPatch.paymentAccountId = text(body.paymentAccountId);
  }
  const first = lines[0]!;
  const projectId = text(first.projectId);
  headerPatch.projectId = projectId;
  const linePatch: Record<string, unknown> = {
    projectId,
    category: text(first.category) ?? "Other",
    amount: amounts[0],
  };
  if (typeof first.id === "string") linePatch.lineId = first.id;

  const updated = await guard.client.rpc("update_expense_atomic", {
    p_expense_id: expenseId,
    p_header_patch: headerPatch,
    p_line_patch: linePatch,
    p_apply_deduction: false,
    p_deduction: null,
  });
  if (updated.error) {
    return NextResponse.json({ ok: false, message: updated.error.message }, { status: 409 });
  }

  const current = await getExpenseById(expenseId, guard.client);
  const existingIds = new Set((current?.lines ?? []).map((line) => line.id));
  const kept = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (index === 0 && typeof line.id === "string") {
      kept.add(line.id);
      continue;
    }
    const patch = {
      projectId: text(line.projectId),
      category: text(line.category) ?? "Other",
      amount: amounts[index],
    };
    if (typeof line.id === "string" && existingIds.has(line.id)) {
      kept.add(line.id);
      const result = await guard.client.rpc("mutate_expense_line_atomic", {
        p_expense_id: expenseId,
        p_operation: "update",
        p_line_id: line.id,
        p_line_patch: patch,
        p_preserve_last_line: true,
      });
      if (result.error) {
        return NextResponse.json({ ok: false, message: result.error.message }, { status: 409 });
      }
    } else {
      const result = await guard.client.rpc("mutate_expense_line_atomic", {
        p_expense_id: expenseId,
        p_operation: "add",
        p_line_id: null,
        p_line_patch: patch,
        p_preserve_last_line: true,
      });
      if (result.error) {
        return NextResponse.json({ ok: false, message: result.error.message }, { status: 409 });
      }
    }
  }
  for (const id of existingIds) {
    if (kept.has(id) || id === first.id) continue;
    const result = await guard.client.rpc("mutate_expense_line_atomic", {
      p_expense_id: expenseId,
      p_operation: "delete",
      p_line_id: id,
      p_line_patch: {},
      p_preserve_last_line: true,
    });
    if (result.error) {
      return NextResponse.json({ ok: false, message: result.error.message }, { status: 409 });
    }
  }

  const extras: Record<string, unknown> = {};
  if (body.dueDate === null || typeof body.dueDate === "string") {
    extras.due_date = text(body.dueDate);
  }
  if (body.subtotal === null || typeof body.subtotal === "number") extras.subtotal = body.subtotal;
  if (body.taxAmount === null || typeof body.taxAmount === "number")
    extras.tax_amount = body.taxAmount;
  if (body.vendorId === null || typeof body.vendorId === "string")
    extras.vendor_id = text(body.vendorId);
  if (Object.keys(extras).length > 0) {
    const extraWrite = await guard.client.from("expenses").update(extras).eq("id", expenseId);
    if (extraWrite.error && !/column|schema cache/i.test(extraWrite.error.message)) {
      return NextResponse.json({ ok: false, message: extraWrite.error.message }, { status: 500 });
    }
  }

  const savedLines = await getExpenseById(expenseId, guard.client);
  if (savedLines && savedLines.lines.length === lines.length) {
    for (const [index, line] of lines.entries()) {
      const saved = savedLines.lines[index];
      if (!saved) continue;
      const wanted = line.clientReimbursable === true;
      if (wanted === (saved.clientReimbursable === true)) continue;
      const flag = await guard.client.rpc("set_expense_line_client_reimbursable", {
        p_expense_id: expenseId,
        p_line_id: saved.id,
        p_reimbursable: wanted,
      });
      if (flag.error && wanted) {
        return NextResponse.json({ ok: false, message: flag.error.message }, { status: 409 });
      }
    }
  }

  const expense = await getExpenseById(expenseId, guard.client);
  if (!expense) {
    return NextResponse.json(
      { ok: false, message: "Saved, but the expense could not reload." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, expense });
}
