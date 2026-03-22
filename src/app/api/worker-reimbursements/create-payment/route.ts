import { NextResponse } from "next/server";
import { ensureExpensesSourceColumns } from "@/lib/ensure-expenses-source-columns";
import { recordBatchReimbursementPayment } from "@/lib/worker-reimbursements-db";
import { createExpenseFromPaidReimbursement } from "@/lib/expenses-db";

/**
 * POST: Create a worker payment for multiple pending reimbursements (same worker).
 * Marks them paid and creates one Project Expense per reimbursement (category: Worker Reimbursement).
 * Body: { reimbursementIds: string[], paymentMethod?: string, note?: string }
 */
export async function POST(req: Request) {
  try {
    await ensureExpensesSourceColumns();
    const body = await req.json().catch(() => ({}));
    const ids = body?.reimbursementIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { message: "Provide at least one reimbursement id." },
        { status: 400 }
      );
    }
    const reimbursementIds = ids.filter((id): id is string => typeof id === "string");
    if (reimbursementIds.length === 0) {
      return NextResponse.json({ message: "Invalid reimbursement ids." }, { status: 400 });
    }
    const { payment, updatedCount, reimbursements } = await recordBatchReimbursementPayment(
      reimbursementIds,
      {
        paymentMethod: body?.paymentMethod ?? null,
        note: body?.note ?? null,
      }
    );
    const opts = { paymentMethod: body?.paymentMethod ?? null, note: body?.note ?? null };
    for (const r of reimbursements) {
      try {
        await createExpenseFromPaidReimbursement(
          {
            id: r.id,
            workerId: r.workerId,
            workerName: r.workerName,
            vendor: r.vendor,
            projectId: r.projectId,
            amount: r.amount ?? 0,
            description: r.description,
          },
          opts
        );
      } catch {
        // Skip expense creation for this item; batch still succeeds
      }
    }
    return NextResponse.json({ payment, updatedCount });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}
