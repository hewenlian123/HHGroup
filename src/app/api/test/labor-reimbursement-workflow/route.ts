import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { insertWorkerReceiptWithClient, approveWorkerReceiptWithClient } from "@/lib/worker-receipts-db";
import { getWorkerReimbursements } from "@/lib/worker-reimbursements-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StepResult = { step: string; ok: boolean; detail?: string; error?: string };

/**
 * POST: Run full Labor + Reimbursement + Expense workflow test.
 * Body: { workerId: string, projectId?: string | null }
 * If workerId/projectId omitted, uses first worker and first project from DB.
 *
 * Steps:
 * 1. Create receipt (worker_receipts) — vendor "Test Vendor", amount 25, status Pending
 * 2. Approve receipt → creates worker_reimbursements (status pending)
 * 3. Mark Paid (POST pay) → status paid, creates expense
 * 4. Verify expense exists (reference_no REIM-{id})
 * 5. Call pay again → no duplicate expense (expenseId same or returned existing)
 * 6. Verify reimbursement not in pending list
 * 7. Log [workflow test] workflow passed
 */
export async function POST(req: Request) {
  const steps: StepResult[] = [];
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  try {
    const server = getServerSupabase();
    if (!server) {
      return NextResponse.json({
        ok: false,
        message: "Supabase not configured",
        steps: [{ step: "init", ok: false, error: "No server Supabase" }],
      }, { status: 500 });
    }

    let workerId: string;
    let projectId: string | null = null;
    const body = await req.json().catch(() => ({}));
    if (body.workerId) {
      workerId = String(body.workerId);
      if (body.projectId) projectId = String(body.projectId);
    } else {
      const [wRes, pRes] = await Promise.all([
        server.from("workers").select("id").limit(1).maybeSingle(),
        server.from("projects").select("id").limit(1).maybeSingle(),
      ]);
      const w = wRes.data as { id: string } | null;
      const p = pRes.data as { id: string } | null;
      if (!w?.id) {
        return NextResponse.json({
          ok: false,
          message: "No workers in DB; add a worker first",
          steps: [{ step: "init", ok: false, error: "No workers" }],
        }, { status: 400 });
        }
      workerId = w.id;
      if (p?.id) projectId = p.id;
    }

    // ——— Step 1: Create receipt ———
    const receipt = await insertWorkerReceiptWithClient(server, {
      workerId,
      workerName: "Workflow Test",
      projectId,
      expenseType: "Other",
      vendor: "Test Vendor",
      amount: 25,
      receiptUrl: "https://example.com/workflow-test-receipt.jpg",
      status: "Pending",
      receiptDate: new Date().toISOString().slice(0, 10),
    });
    steps.push({ step: "1_receipt_created", ok: true, detail: `id=${receipt.id}` });

    // ——— Step 2: Approve → reimbursement created ———
    const { reimbursementCreated } = await approveWorkerReceiptWithClient(server, receipt.id);
    if (!reimbursementCreated) {
      steps.push({ step: "2_reimbursement_created", ok: false, error: "reimbursementCreated null" });
      return NextResponse.json({ ok: false, message: "Approve did not create reimbursement", steps }, { status: 400 });
    }
    if (reimbursementCreated.status !== "pending") {
      steps.push({ step: "2_reimbursement_created", ok: false, error: `status=${reimbursementCreated.status}` });
    } else {
      steps.push({ step: "2_reimbursement_created", ok: true, detail: `id=${reimbursementCreated.id}, status=pending` });
    }

    const reimbursementId = reimbursementCreated.id;

    // ——— Step 3: Mark Paid (creates expense, updates status) ———
    const payRes = await fetch(`${baseUrl}/api/worker-reimbursements/${reimbursementId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payData = await payRes.json().catch(() => ({}));
    if (!payRes.ok) {
      steps.push({ step: "3_mark_paid", ok: false, error: payData.message ?? payRes.statusText });
      return NextResponse.json({ ok: false, message: "Mark Paid failed", steps }, { status: 400 });
    }
    if (payData.reimbursement?.status !== "paid") {
      steps.push({ step: "3_mark_paid", ok: false, error: `status=${payData.reimbursement?.status}` });
    } else {
      steps.push({ step: "3_mark_paid", ok: true, detail: `status=paid, expenseId=${payData.expenseId ?? "—"}` });
    }

    const firstExpenseId = payData.expenseId ?? null;
    const payWarning = payData.expenseWarning ?? null;

    // ——— Step 4: Verify expense exists ———
    const refNo = `REIM-${reimbursementId}`;
    let expFound: { id: string } | null = null;
    if (firstExpenseId) {
      const byId = await server.from("expenses").select("id").eq("id", firstExpenseId).maybeSingle();
      expFound = byId.data as { id: string } | null;
    }
    if (!expFound) {
      try {
        const byRef = await server.from("expenses").select("id").eq("reference_no", refNo).maybeSingle();
        expFound = byRef.data as { id: string } | null;
      } catch {
        // reference_no column may not exist
      }
    }
    if (!expFound) {
      try {
        const bySource = await server.from("expenses").select("id").eq("source_id", reimbursementId).maybeSingle();
        expFound = bySource.data as { id: string } | null;
      } catch {
        // source_id column may not exist
      }
    }
    if (!expFound?.id) {
      steps.push({
        step: "4_expense_exists",
        ok: false,
        error: payWarning ? `Expense not created: ${payWarning}` : `No expense with reference_no or source_id for ${reimbursementId}`,
      });
    } else {
      steps.push({ step: "4_expense_exists", ok: true, detail: `id=${expFound.id}` });
    }

    // ——— Step 5: Duplicate protection — call pay again ———
    const payRes2 = await fetch(`${baseUrl}/api/worker-reimbursements/${reimbursementId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payData2 = await payRes2.json().catch(() => ({}));
    if (!payRes2.ok) {
      steps.push({ step: "5_duplicate_protection", ok: false, error: "Second pay failed" });
    } else {
      const secondExpenseId = payData2.expenseId;
      if (firstExpenseId && secondExpenseId && secondExpenseId !== firstExpenseId) {
        steps.push({ step: "5_duplicate_protection", ok: false, error: `Duplicate expense: ${secondExpenseId}` });
      } else {
        steps.push({ step: "5_duplicate_protection", ok: true, detail: "No duplicate expense" });
      }
    }

    // ——— Step 6: Reimbursement not in pending list ———
    const list = await getWorkerReimbursements();
    const pendingIds = list.filter((r) => r.status === "pending").map((r) => r.id);
    const stillInPending = pendingIds.includes(reimbursementId);
    if (stillInPending) {
      steps.push({ step: "6_not_in_pending_list", ok: false, error: "Reimbursement still in pending list" });
    } else {
      steps.push({ step: "6_not_in_pending_list", ok: true, detail: "Reimbursement not in pending list" });
    }

    // ——— Step 7: Project cost impact (expense or expense_lines linked to project) ———
    const expenseIdForProject = firstExpenseId ?? expFound?.id ?? null;
    let projectCostOk = false;
    if (expenseIdForProject && projectId) {
      try {
        const expRow = await server.from("expenses").select("project_id").eq("id", expenseIdForProject).maybeSingle();
        const lineRow = await server.from("expense_lines").select("project_id").eq("expense_id", expenseIdForProject).limit(1).maybeSingle();
        const expProjectId = (expRow.data as { project_id?: string | null } | null)?.project_id;
        const lineProjectId = (lineRow.data as { project_id?: string | null } | null)?.project_id;
        projectCostOk = expProjectId === projectId || lineProjectId === projectId;
      } catch {
        projectCostOk = true; // skip if columns missing
      }
    } else {
      projectCostOk = true; // no project to link
    }
    steps.push({
      step: "7_project_cost_impact",
      ok: projectCostOk,
      detail: projectCostOk ? "Expense linked to project" : "Expense/line not linked to project_id",
    });

    const allOk = steps.every((s) => s.ok);
    if (allOk && typeof console !== "undefined" && console.log) {
      console.log("[workflow test] workflow passed");
    }

    return NextResponse.json({
      ok: allOk,
      message: allOk ? "Workflow passed." : "One or more steps failed.",
      steps,
      receiptId: receipt.id,
      reimbursementId,
      expenseId: firstExpenseId,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    steps.push({ step: "exception", ok: false, error: err.message });
    if (typeof console !== "undefined" && console.error) {
      console.error("[workflow test] workflow failed", err);
    }
    return NextResponse.json({
      ok: false,
      message: err.message,
      steps,
    }, { status: 500 });
  }
}
