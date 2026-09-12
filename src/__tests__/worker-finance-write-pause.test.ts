import { afterEach, expect, test, vi } from "vitest";
import {
  isWorkerFinanceApiWrite,
  isWorkerFinanceDataWrite,
  workerFinanceConfiguredOpen,
  workerFinanceFetch,
  workerFinanceSchemaReady,
} from "@/lib/worker-finance-write-pause";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
test("missing or invalid setting pauses; only canonical explicitly opens", () => {
  for (const value of ["", "false", "0", "off", "paused", "legacy"]) {
    vi.stubEnv("HH_WORKER_FINANCE_WRITES", value);
    expect(workerFinanceConfiguredOpen()).toBe(false);
  }
  vi.stubEnv("HH_WORKER_FINANCE_WRITES", "canonical");
  expect(workerFinanceConfiguredOpen()).toBe(true);
});
test("every inventoried API mutation family is paused while reads stay available", () => {
  for (const path of [
    "/api/upload-receipt/upload",
    "/api/upload-receipt/submit",
    "/api/upload-receipt/sync",
    "/api/worker-receipts/id/reject",
    "/api/worker-receipts/id/reset-pending",
    "/api/worker-receipts/id/approve",
    "/api/worker-reimbursements/id/pay",
    "/api/worker-reimbursements/create-payment",
    "/api/labor/worker-payments/id",
    "/api/labor/workers/id/pay",
    "/api/financial/expenses/id/approve-inbox",
    "/api/expenses/id",
    "/api/quick-expense/upload-attachment",
  ]) {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"])
      expect(isWorkerFinanceApiWrite(path, method), path).toBe(true);
    for (const method of ["GET", "HEAD", "OPTIONS"])
      expect(isWorkerFinanceApiWrite(path, method), path).toBe(false);
  }
  expect(isWorkerFinanceApiWrite("/api/invoices", "POST")).toBe(false);
});
test("direct current-client tables, payroll/server-action and shared Expense RPC writers are covered", () => {
  for (const table of [
    "worker_receipts",
    "worker_reimbursements",
    "worker_payments",
    "worker_reimbursement_payments",
    "worker_payment_reversals",
    "worker_invoices",
    "worker_advances",
    "worker_rate_history",
    "workers",
    "labor_payments",
    "labor_invoices",
    "labor_entries",
    "daily_work_entries",
    "receipt_queue",
    "expenses",
    "expense_lines",
    "attachments",
  ])
    expect(isWorkerFinanceDataWrite(`/rest/v1/${table}`, "PATCH"), table).toBe(true);
  for (const rpc of [
    "intake_worker_receipt_atomic",
    "approve_worker_receipt_atomic",
    "record_worker_reimbursement_payment_atomic",
    "record_worker_payroll_settlement",
    "reverse_worker_payment_atomic",
    "create_expense_atomic",
    "update_expense_atomic",
    "mutate_expense_line_atomic",
  ])
    expect(isWorkerFinanceDataWrite(`/rest/v1/rpc/${rpc}`, "POST"), rpc).toBe(true);
  expect(isWorkerFinanceDataWrite("/rest/v1/rpc/get_monthly_payroll_summary", "POST")).toBe(false);
  expect(isWorkerFinanceDataWrite("/rest/v1/worker_payments", "GET")).toBe(false);
  expect(isWorkerFinanceDataWrite("/storage/v1/object/worker-receipts/uploads/x.png", "POST")).toBe(
    true
  );
});
test("paused request returns explicit 503 without forwarding a mutation", async () => {
  vi.stubEnv("HH_WORKER_FINANCE_WRITES", "paused");
  const native = vi.fn();
  vi.stubGlobal("fetch", native);
  const response = await workerFinanceFetch("https://local.invalid/rest/v1/worker_receipts", {
    method: "POST",
    body: "{}",
  });
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("WORKER_FINANCE_PAUSED");
  expect(native).not.toHaveBeenCalled();
});
test("canonical config never calls a writer when the old/intermediate schema is missing", async () => {
  vi.stubEnv("HH_WORKER_FINANCE_WRITES", "canonical");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://local.invalid");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
  const native = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
  vi.stubGlobal("fetch", native);
  const response = await workerFinanceFetch(
    "https://local.invalid/rest/v1/rpc/approve_worker_receipt_atomic",
    { method: "POST", body: "{}" }
  );
  expect(response.status).toBe(503);
  expect(native.mock.calls.every(([, init]) => !init.method)).toBe(true);
});
test("readiness errors fail closed and ready schema permits one forwarded mutation", async () => {
  vi.stubEnv("HH_WORKER_FINANCE_WRITES", "canonical");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://local.invalid");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
  expect(await workerFinanceSchemaReady(vi.fn().mockRejectedValue(new Error("offline")))).toBe(
    false
  );
  const native = vi.fn().mockImplementation(async () => new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", native);
  expect(
    (
      await workerFinanceFetch("https://local.invalid/rest/v1/worker_receipts", {
        method: "POST",
        body: "{}",
      })
    ).status
  ).toBe(200);
  expect(native.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

test("browser write checks live server pause and never forwards denied request", async () => {
  vi.stubGlobal("window", {});
  const native = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ code: "WORKER_FINANCE_PAUSED" }), { status: 503 })
    );
  vi.stubGlobal("fetch", native);
  const response = await workerFinanceFetch(
    "https://local.invalid/rest/v1/rpc/update_expense_atomic",
    { method: "POST", body: "{}" }
  );
  expect(response.status).toBe(503);
  expect(native).toHaveBeenCalledTimes(1);
  expect(native.mock.calls[0][0]).toBe("/api/worker-finance/write-status");
});
test("project force-delete is stopped before any multi-table side effect", async () => {
  vi.stubEnv("HH_WORKER_FINANCE_WRITES", "paused");
  const { forceDeleteProjectWithClient } = await import("@/lib/projects-db");
  const from = vi.fn();
  await expect(forceDeleteProjectWithClient({ from } as never, "local-fixture")).rejects.toThrow(
    "paused for maintenance"
  );
  expect(from).not.toHaveBeenCalled();
});

test("project deletion is blocked for financial FK effects; unrelated project edits and bank imports stay available", () => {
  expect(isWorkerFinanceDataWrite("/rest/v1/projects", "DELETE")).toBe(true);
  expect(isWorkerFinanceDataWrite("/rest/v1/projects", "PATCH")).toBe(false);
  expect(
    isWorkerFinanceDataWrite("/rest/v1/rpc/reconcile_bank_transaction_expense_atomic", "POST")
  ).toBe(false);
});
