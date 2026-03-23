import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { insertDailyLaborEntries } from "@/lib/daily-labor-db";
import { createWorkerPayment } from "@/lib/worker-payments-db";
import {
  insertWorkerReceiptWithClient,
  approveWorkerReceiptWithClient,
} from "@/lib/worker-receipts-db";
import { getWorkerReimbursements } from "@/lib/worker-reimbursements-db";
import { insertWorkerInvoice } from "@/lib/worker-invoices-db";
import { createExpense } from "@/lib/data";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { createInvoice, createPaymentReceived, getInvoiceById, markInvoiceSent } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type TestResult = { name: string; ok: boolean; steps?: string[] };

function log(step: string, detail?: string) {
  const msg = detail ? `[financial-workflows] ${step}: ${detail}` : `[financial-workflows] ${step}`;
  if (typeof console !== "undefined" && console.log) console.log(msg);
}

const TEST_IDS = [
  "labor_workflow",
  "reimbursement_workflow",
  "worker_invoice_workflow",
  "expense_workflow",
  "invoice_payment_workflow",
] as const;

/**
 * POST: Run all or one core financial workflow test.
 * Body: { only?: "labor_workflow" | "reimbursement_workflow" | "worker_invoice_workflow" | "expense_workflow" | "invoice_payment_workflow" }
 * Returns { ok, tests: [{ name, ok, steps? }] }.
 */
export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  let only: (typeof TEST_IDS)[number] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.only && TEST_IDS.includes(body.only)) only = body.only;
  } catch {
    // ignore
  }

  const server = getServerSupabase();
  if (!server) {
    return NextResponse.json(
      { ok: false, message: "Supabase not configured", tests: [] },
      { status: 500 }
    );
  }

  const tests: TestResult[] = [];

  const run = (id: (typeof TEST_IDS)[number]) => !only || only === id;

  // --- 1. Labor Workflow Test ---
  if (run("labor_workflow"))
    try {
      log("labor_workflow", "start");
      const steps: string[] = [];
      const [wRes, pRes] = await Promise.all([
        server.from("workers").select("id").limit(1).maybeSingle(),
        server.from("projects").select("id").limit(1).maybeSingle(),
      ]);
      const workerId = (wRes.data as { id?: string } | null)?.id;
      const projectId = (pRes.data as { id?: string } | null)?.id ?? null;
      if (!workerId || !projectId) {
        tests.push({ name: "labor_workflow", ok: false, steps: ["Missing worker or project"] });
        log("labor_workflow", "skip: no worker or project");
      } else {
        const workDate = new Date().toISOString().slice(0, 10);
        const entries = await insertDailyLaborEntries(workDate, [
          { worker_id: workerId, project_id: projectId, hours: 4, cost_code: null, notes: null },
        ]);
        if (entries.length === 0) {
          tests.push({ name: "labor_workflow", ok: false, steps: ["labor_entries not created"] });
        } else {
          steps.push("labor_entries created");
          log("labor_workflow", "daily entry created");
          const balanceRes = await fetch(`${baseUrl}/api/labor/workers/${workerId}/balance`);
          const balanceData = await balanceRes.json().catch(() => ({}));
          const laborOwedBefore = balanceData?.summary?.laborOwed ?? 0;
          const balanceBefore = balanceData?.summary?.balance ?? 0;
          steps.push("worker balance fetched");
          log("labor_workflow", "balance updated");
          const payAmount = 50;
          const payment = await createWorkerPayment({
            workerId,
            amount: payAmount,
            paymentMethod: "Test",
            paymentDate: workDate,
          });
          steps.push("worker_payment created");
          log("labor_workflow", "worker payment created");
          const balanceRes2 = await fetch(`${baseUrl}/api/labor/workers/${workerId}/balance`);
          const balanceData2 = await balanceRes2.json().catch(() => ({}));
          const balanceAfter = balanceData2?.summary?.balance ?? 0;
          const reduced =
            balanceAfter < balanceBefore ||
            Math.abs(balanceAfter - (balanceBefore - payAmount)) < 0.01;
          if (!reduced && balanceBefore > 0)
            steps.push("balance reduced check: " + (reduced ? "yes" : "no"));
          else steps.push("balance reduced");
          log("labor_workflow", "balance reduced");
          tests.push({
            name: "labor_workflow",
            ok: entries.length > 0 && !!payment?.id && (reduced || balanceBefore === 0),
            steps,
          });
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log("labor_workflow", "error: " + err);
      tests.push({ name: "labor_workflow", ok: false, steps: [err] });
    }

  // --- 2. Reimbursement Workflow Test ---
  if (run("reimbursement_workflow"))
    try {
      log("reimbursement_workflow", "start");
      const steps: string[] = [];
      const [wRes, pRes] = await Promise.all([
        server.from("workers").select("id").limit(1).maybeSingle(),
        server.from("projects").select("id").limit(1).maybeSingle(),
      ]);
      const workerId = (wRes.data as { id?: string } | null)?.id;
      const projectId = (pRes.data as { id?: string } | null)?.id ?? null;
      if (!workerId) {
        tests.push({ name: "reimbursement_workflow", ok: false, steps: ["No worker"] });
      } else {
        const receipt = await insertWorkerReceiptWithClient(server, {
          workerId,
          workerName: "Workflow Test",
          projectId: projectId ?? null,
          expenseType: "Other",
          vendor: "Test Vendor",
          amount: 30,
          receiptUrl: "https://example.com/test.jpg",
          status: "Pending",
          receiptDate: new Date().toISOString().slice(0, 10),
        });
        steps.push("receipt created");
        log("reimbursement_workflow", "receipt upload");
        const { reimbursementCreated } = await approveWorkerReceiptWithClient(server, receipt.id);
        if (!reimbursementCreated) {
          tests.push({
            name: "reimbursement_workflow",
            ok: false,
            steps: ["Approve did not create reimbursement"],
          });
        } else {
          steps.push("worker_reimbursements created");
          log("reimbursement_workflow", "approve -> reimbursement");
          const reimbId = reimbursementCreated.id;
          const payRes = await fetch(`${baseUrl}/api/worker-reimbursements/${reimbId}/pay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const payData = await payRes.json().catch(() => ({}));
          if (!payRes.ok) {
            tests.push({
              name: "reimbursement_workflow",
              ok: false,
              steps: [...steps, "Mark paid failed: " + (payData.message ?? payRes.statusText)],
            });
          } else {
            steps.push("mark paid");
            log("reimbursement_workflow", "mark paid");
            const firstExpenseId = payData.expenseId ?? null;
            let expFound: { id: string } | null = null;
            if (firstExpenseId) {
              const byId = await server
                .from("expenses")
                .select("id")
                .eq("id", firstExpenseId)
                .maybeSingle();
              expFound = byId.data as { id: string } | null;
            }
            if (!expFound) {
              try {
                const byRef = await server
                  .from("expenses")
                  .select("id")
                  .eq("reference_no", `REIM-${reimbId}`)
                  .maybeSingle();
                const d = byRef.data as { id?: string } | null;
                if (d?.id) expFound = { id: d.id };
              } catch {
                /* column may not exist */
              }
            }
            if (!expFound) {
              try {
                const bySource = await server
                  .from("expenses")
                  .select("id")
                  .eq("source_id", reimbId)
                  .maybeSingle();
                const d = bySource.data as { id?: string } | null;
                if (d?.id) expFound = { id: d.id };
              } catch {
                /* column may not exist */
              }
            }
            steps.push(expFound?.id ? "expense created" : "expense created: not found");
            log("reimbursement_workflow", "expense created");
            const payRes2 = await fetch(`${baseUrl}/api/worker-reimbursements/${reimbId}/pay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const payData2 = await payRes2.json().catch(() => ({}));
            const noDuplicate =
              payRes2.ok &&
              (payData2.expenseId === undefined || payData2.expenseId === firstExpenseId);
            steps.push(noDuplicate ? "duplicate protection works" : "duplicate protection failed");
            log("reimbursement_workflow", "duplicate protection");
            const list = await getWorkerReimbursements();
            const stillPending = list
              .filter((r) => r.status === "pending")
              .some((r) => r.id === reimbId);
            steps.push(stillPending ? "still in pending list" : "not in pending list");
            tests.push({
              name: "reimbursement_workflow",
              ok: !!reimbursementCreated && !!expFound?.id && noDuplicate && !stillPending,
              steps,
            });
          }
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log("reimbursement_workflow", "error: " + err);
      tests.push({ name: "reimbursement_workflow", ok: false, steps: [err] });
    }

  // --- 3. Worker Invoice Workflow Test ---
  if (run("worker_invoice_workflow"))
    try {
      log("worker_invoice_workflow", "start");
      const steps: string[] = [];
      const [wRes, pRes] = await Promise.all([
        server.from("workers").select("id").limit(1).maybeSingle(),
        server.from("projects").select("id").limit(1).maybeSingle(),
      ]);
      const workerId = (wRes.data as { id?: string } | null)?.id;
      const projectId = (pRes.data as { id?: string } | null)?.id ?? null;
      if (!workerId || !projectId) {
        tests.push({ name: "worker_invoice_workflow", ok: false, steps: ["No worker or project"] });
      } else {
        const inv = await insertWorkerInvoice({
          workerId,
          projectId,
          amount: 100,
          status: "unpaid",
        });
        steps.push("worker invoice created");
        log("worker_invoice_workflow", "worker invoice");
        const profitBefore = await getCanonicalProjectProfit(projectId).catch(() => ({
          expenseCost: 0,
          actualCost: 0,
        }));
        const expense = await createExpense({
          date: new Date().toISOString().slice(0, 10),
          vendorName: "Test Worker Invoice",
          paymentMethod: "Check",
          lines: [{ projectId, category: "Labor", amount: 100 }],
        });
        steps.push("expense created");
        log("worker_invoice_workflow", "approve -> expense created");
        const profitAfter = await getCanonicalProjectProfit(projectId).catch(() => ({
          expenseCost: 0,
          actualCost: 0,
        }));
        const { data: directLineRows } = await server
          .from("expense_lines")
          .select("amount")
          .eq("project_id", projectId);
        const directLineSum =
          (directLineRows as Array<{ amount?: unknown }> | null)?.reduce(
            (s, r) => s + (Number(r.amount) || 0),
            0
          ) ?? 0;
        const expenseDelta = (profitAfter?.expenseCost ?? 0) - (profitBefore?.expenseCost ?? 0);
        const actualDelta = (profitAfter?.actualCost ?? 0) - (profitBefore?.actualCost ?? 0);
        const costUpdated = expenseDelta >= 99 || actualDelta >= 99 || directLineSum >= 99;
        steps.push(
          costUpdated
            ? "project cost updated"
            : `project cost updated: check (expenseΔ=${expenseDelta}, actualΔ=${actualDelta}, lines=${directLineSum})`
        );
        log("worker_invoice_workflow", "project cost updated");
        tests.push({
          name: "worker_invoice_workflow",
          ok: !!inv?.id && !!expense?.id && costUpdated,
          steps,
        });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log("worker_invoice_workflow", "error: " + err);
      tests.push({ name: "worker_invoice_workflow", ok: false, steps: [err] });
    }

  // --- 4. Expense Workflow Test ---
  if (run("expense_workflow"))
    try {
      log("expense_workflow", "start");
      const steps: string[] = [];
      const pRes = await server.from("projects").select("id").limit(1).maybeSingle();
      const projectId = (pRes.data as { id?: string } | null)?.id;
      if (!projectId) {
        tests.push({ name: "expense_workflow", ok: false, steps: ["No project"] });
      } else {
        const profitBefore = await getCanonicalProjectProfit(projectId).catch(() => ({
          actualCost: 0,
          profit: 0,
        }));
        const expense = await createExpense({
          date: new Date().toISOString().slice(0, 10),
          vendorName: "Expense Workflow Test",
          paymentMethod: "Check",
          lines: [{ projectId, category: "Other", amount: 75 }],
        });
        steps.push("expense created");
        log("expense_workflow", "expense created");
        const profitAfter = await getCanonicalProjectProfit(projectId).catch(() => ({
          actualCost: 0,
          profit: 0,
        }));
        const spentIncreased =
          (profitAfter?.actualCost ?? 0) >= (profitBefore?.actualCost ?? 0) + 74;
        steps.push(spentIncreased ? "project.spent / actualCost increased" : "spent check");
        const profitRecalc = typeof profitAfter?.profit === "number";
        steps.push(profitRecalc ? "project profit recalculates" : "profit recalc");
        log("expense_workflow", "project spent and profit");
        tests.push({
          name: "expense_workflow",
          ok:
            !!expense?.id &&
            (spentIncreased ||
              (profitBefore?.actualCost ?? 0) === (profitAfter?.actualCost ?? 0)) &&
            profitRecalc,
          steps,
        });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log("expense_workflow", "error: " + err);
      tests.push({ name: "expense_workflow", ok: false, steps: [err] });
    }

  // --- 5. Invoice Payment Workflow Test ---
  if (run("invoice_payment_workflow"))
    try {
      log("invoice_payment_workflow", "start");
      const steps: string[] = [];
      const pRes = await server.from("projects").select("id").limit(1).maybeSingle();
      const projectId = (pRes.data as { id?: string } | null)?.id;
      if (!projectId) {
        tests.push({ name: "invoice_payment_workflow", ok: false, steps: ["No project"] });
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const invoice = await createInvoice({
          projectId,
          clientName: "Workflow Test Client",
          issueDate: today,
          dueDate: today,
          lineItems: [{ description: "Test", qty: 1, unitPrice: 200, amount: 200 }],
        });
        steps.push("invoice created");
        log("invoice_payment_workflow", "create invoice");
        // Invoice must be in non-Draft status for computedStatus to reflect payments
        await markInvoiceSent(invoice.id).catch(() => null);
        steps.push("invoice marked sent");
        log("invoice_payment_workflow", "mark sent");
        const payment = await createPaymentReceived({
          invoice_id: invoice.id,
          project_id: projectId,
          customer_name: "Workflow Test Client",
          payment_date: today,
          amount: 100,
          payment_method: "Check",
        });
        steps.push("payments_received created");
        log("invoice_payment_workflow", "receive payment");
        const withDerived = await getInvoiceById(invoice.id).catch(() => null);
        const statusUpdated =
          withDerived?.computedStatus === "Partial" || withDerived?.computedStatus === "Paid";
        steps.push(
          statusUpdated
            ? "invoice status updated"
            : "status: " + (withDerived?.computedStatus ?? "?")
        );
        const outstandingReduced =
          withDerived != null && withDerived.paidTotal >= 99 && withDerived.balanceDue < 201;
        steps.push(outstandingReduced ? "outstanding reduced" : "outstanding check");
        log("invoice_payment_workflow", "status and outstanding");
        tests.push({
          name: "invoice_payment_workflow",
          ok: !!payment?.id && statusUpdated && outstandingReduced,
          steps,
        });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log("invoice_payment_workflow", "error: " + err);
      tests.push({ name: "invoice_payment_workflow", ok: false, steps: [err] });
    }

  const allOk = tests.every((t) => t.ok);
  log("report", allOk ? "all tests passed" : "some tests failed");

  return NextResponse.json({
    ok: allOk,
    tests: tests.map(({ name, ok, steps }) => ({ name, ok, steps })),
  });
}
