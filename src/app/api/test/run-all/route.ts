import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TEST_DISPLAY_NAMES: Record<string, string> = {
  labor_workflow: "Labor Workflow",
  reimbursement_workflow: "Reimbursement Workflow",
  worker_invoice_workflow: "Worker Invoice Workflow",
  expense_workflow: "Expense Workflow",
  invoice_payment_workflow: "Invoice Payment Workflow",
};

export type RunAllTestRow = {
  test: string;
  status: "passed" | "warning" | "failed";
  executionTimeMs: number;
  message: string;
};

/**
 * POST: Run workflow tests and return table-shaped results.
 * Body: { only?: "labor_workflow" | "reimbursement_workflow" | "worker_invoice_workflow" | "expense_workflow" | "invoice_payment_workflow" }
 * Returns { ok, totalExecutionTimeMs, tests: RunAllTestRow[] }.
 */
export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  let body: { only?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/test/financial-workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.only ? { only: body.only } : {}),
    });
  } catch (e) {
    const elapsed = Date.now() - start;
    return NextResponse.json({
      ok: false,
      totalExecutionTimeMs: elapsed,
      tests: [
        {
          test: body.only ? TEST_DISPLAY_NAMES[body.only] ?? body.only : "All",
          status: "failed",
          executionTimeMs: elapsed,
          message: e instanceof Error ? e.message : "Request failed",
        },
      ],
    });
  }

  const elapsed = Date.now() - start;
  const data = await res.json().catch(() => ({ ok: false, tests: [] }));
  const tests = (data.tests ?? []) as Array<{ name: string; ok: boolean; steps?: string[] }>;

  const rows: RunAllTestRow[] = tests.map((t) => {
    const displayName = TEST_DISPLAY_NAMES[t.name] ?? t.name;
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const message = !t.ok && steps.length > 0 ? steps.join("; ") : "";
    const isSkipped = !t.ok && steps.some((s) => /missing|no worker|no project|skip/i.test(String(s)));
    const status: "passed" | "warning" | "failed" = t.ok ? "passed" : isSkipped ? "warning" : "failed";
    return {
      test: displayName,
      status,
      executionTimeMs: tests.length === 1 ? elapsed : Math.round(elapsed / Math.max(1, tests.length)),
      message,
    };
  });

  return NextResponse.json({
    ok: data.ok === true,
    totalExecutionTimeMs: elapsed,
    tests: rows,
  });
}
