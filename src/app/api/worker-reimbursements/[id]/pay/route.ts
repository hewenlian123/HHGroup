import { NextResponse } from "next/server";
import { getReimbursementById, markReimbursementPaid } from "@/lib/worker-reimbursements-db";
import { createExpenseFromPaidReimbursement } from "@/lib/expenses-db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: reimbursementId } = await params;
  if (typeof console !== "undefined" && console.log) {
    console.log("[reimbursement/pay] start", { reimbursementId });
  }
  try {
    try {
      const { ensureExpensesSourceColumns } = await import(
        "@/lib/ensure-expenses-source-columns"
      );
      await ensureExpensesSourceColumns();
    } catch {
      /* optional DB migration; duplicate-key logic still applies when columns exist */
    }
    const body = await req.json().catch(() => ({}));

    // Step 1: Find reimbursement by id
    const existing = await getReimbursementById(reimbursementId);
    if (!existing) {
      return NextResponse.json({ message: "Reimbursement not found." }, { status: 404 });
    }

    // Step 2: If already paid, return early (prevent duplicate execution)
    if (existing.status === "paid") {
      return NextResponse.json({
        reimbursement: existing,
        expenseId: undefined,
        expenseWarning: undefined,
      });
    }

    // Step 3: Create expense from reimbursement
    let expenseWarning: string | null = null;
    let expenseId: string | null = null;
    try {
      const expense = await createExpenseFromPaidReimbursement(
        {
          id: existing.id,
          workerId: existing.workerId,
          workerName: existing.workerName,
          vendor: existing.vendor ?? "Worker Reimbursement",
          projectId: existing.projectId,
          amount: existing.amount ?? 0,
          description: existing.description,
        },
        { paymentMethod: body?.method ?? null, note: body?.note ?? null }
      );
      expenseId = expense?.id ?? null;
      if (typeof console !== "undefined" && console.log) {
        console.log("[reimbursement/pay] expense created", { expenseId, reimbursementId });
      }
    } catch (expErr) {
      expenseWarning =
        expErr instanceof Error ? expErr.message : "Could not add to Project Expenses.";
      if (typeof console !== "undefined" && console.error) {
        console.error("[reimbursement/pay] createExpenseFromPaidReimbursement failed", expErr);
      }
    }

    // Step 4: Update reimbursement status (SET status='paid', paid_at=now())
    const reimbursement = await markReimbursementPaid(reimbursementId);
    if (typeof console !== "undefined" && console.log) {
      console.log("[reimbursement/pay] reimbursement status updated", {
        reimbursementId,
        status: reimbursement.status,
      });
    }

    // Step 5: Return updated reimbursement
    if (typeof console !== "undefined" && console.log) {
      console.log("[reimbursement/pay] finished", { reimbursementId });
    }
    return NextResponse.json({
      reimbursement,
      expenseId: expenseId ?? undefined,
      expenseWarning: expenseWarning ?? undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}
