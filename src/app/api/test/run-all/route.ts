import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FINANCIAL_DISPLAY_NAMES: Record<string, string> = {
  labor_workflow: "Labor Workflow",
  reimbursement_workflow: "Reimbursement Workflow",
  worker_invoice_workflow: "Worker Invoice Workflow",
  expense_workflow: "Expense Workflow",
  invoice_payment_workflow: "Invoice Payment Workflow",
};

const FULL_SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  required_tables: "Required Tables",
  workers_crud: "Worker CRUD",
  projects_crud: "Projects CRUD",
  receipts_crud: "Worker Receipt CRUD",
  receipt_actions_workflow: "Receipt Actions Workflow",
  reimbursements_workflow: "Reimbursement Workflow",
  expenses_crud: "Expense CRUD",
  invoice_payment_workflow: "Invoice Payment Workflow",
  labor_workflow: "Labor Entry & Payment",
  estimates_crud: "Estimates CRUD",
  change_orders_crud: "Change Orders CRUD",
  tasks_crud: "Tasks CRUD",
  punch_list_crud: "Punch List CRUD",
  schedule_crud: "Schedule CRUD",
  site_photos_crud: "Site Photos CRUD",
  inspection_log_crud: "Inspection Log CRUD",
  material_catalog_crud: "Material Catalog CRUD",
};

export type RunAllTestRow = {
  test: string;
  status: "passed" | "warning" | "failed";
  executionTimeMs: number;
  message: string;
};

function shapedRows(
  tests: Array<{ name: string; ok: boolean; steps?: string[] }>,
  displayNames: Record<string, string>,
  elapsed: number
): RunAllTestRow[] {
  return tests.map((t) => {
    const displayName = displayNames[t.name] ?? t.name;
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const message = !t.ok && steps.length > 0 ? steps.join("; ") : "";
    const isSkipped =
      !t.ok && steps.some((s) => /missing|no worker|no project|skip/i.test(String(s)));
    const status: RunAllTestRow["status"] = t.ok
      ? "passed"
      : isSkipped
      ? "warning"
      : "failed";
    return {
      test: displayName,
      status,
      executionTimeMs:
        tests.length === 1 ? elapsed : Math.round(elapsed / Math.max(1, tests.length)),
      message,
    };
  });
}

/**
 * POST: Run workflow tests and return table-shaped results.
 * Body:
 *   { only?: "labor_workflow" | "reimbursement_workflow" | ... }  — financial workflow tests
 *   { suite: "full", only?: "workers_crud" | ... }                — full system CRUD tests
 * Returns { ok, totalExecutionTimeMs, tests: RunAllTestRow[] }.
 */
export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  let body: { only?: string; suite?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const start = Date.now();
  const isFullSuite = body.suite === "full";
  const endpoint = isFullSuite
    ? `${baseUrl}/api/test/full-system-test`
    : `${baseUrl}/api/test/financial-workflows`;
  const displayNames = isFullSuite ? FULL_SYSTEM_DISPLAY_NAMES : FINANCIAL_DISPLAY_NAMES;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.only ? { only: body.only } : {}),
    });
  } catch (e) {
    const elapsed = Date.now() - start;
    const label = body.only ? (displayNames[body.only] ?? body.only) : "All";
    return NextResponse.json({
      ok: false,
      totalExecutionTimeMs: elapsed,
      tests: [
        {
          test: label,
          status: "failed" as const,
          executionTimeMs: elapsed,
          message: e instanceof Error ? e.message : "Request failed",
        },
      ],
    });
  }

  const elapsed = Date.now() - start;
  const data = await res.json().catch(() => ({ ok: false, tests: [] }));
  const tests = (data.tests ?? []) as Array<{ name: string; ok: boolean; steps?: string[] }>;
  const rows = shapedRows(tests, displayNames, elapsed);

  return NextResponse.json({
    ok: data.ok === true,
    totalExecutionTimeMs: elapsed,
    tests: rows,
  });
}
