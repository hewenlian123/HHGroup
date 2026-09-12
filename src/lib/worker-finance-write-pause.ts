/** Server-owned cutover switch. Missing/invalid config is deliberately paused. */
export const WORKER_FINANCE_MAINTENANCE =
  "Worker financial writes are paused for maintenance. Try again after maintenance.";
export const WORKER_FINANCE_PAUSE_CODE = "WORKER_FINANCE_PAUSED";

export function workerFinanceConfiguredOpen(): boolean {
  return process.env.HH_WORKER_FINANCE_WRITES === "canonical";
}

export function workerFinanceMaintenanceResponse(): Response {
  return Response.json(
    { code: WORKER_FINANCE_PAUSE_CODE, message: WORKER_FINANCE_MAINTENANCE },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    }
  );
}

export function isWorkerFinanceApiWrite(path: string, method: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  // Shared Expense writers can assign a Worker after creating the header. Pause the
  // entire request before uploads/header writes; do not infer intent from amount/URL.
  return (
    /^\/api\/(?:test|production\/cleanup-test-data|wipe-database|seed-workers)(?:\/|$)/.test(
      path
    ) ||
    /^\/api\/(?:worker-receipts|worker-reimbursements|upload-receipt|expenses|quick-expense|ocr-receipt)(?:\/|$)/.test(
      path
    ) ||
    /^\/api\/financial\/expenses(?:\/|$)/.test(path) ||
    /^\/api\/labor\/(?:workers|worker-payments)(?:\/|$)/.test(path)
  );
}

export function isWorkerFinanceDataWrite(path: string, method: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  if (path === "/rest/v1/projects" && method.toUpperCase() === "DELETE") return true;
  return (
    /^\/rest\/v1\/(?:worker_receipts|worker_reimbursements|worker_reimbursement_payments|worker_payments|worker_payment_reversals|worker_advances|worker_invoices|worker_rate_history|workers|labor_workers|labor_payments|labor_invoices|labor_entries|daily_work_entries|receipt_queue|attachments|expense_attachments|expenses|expense_lines|expense_receipts)(?:\/|$)/.test(
      path
    ) ||
    /^\/rest\/v1\/rpc\/(?:intake_worker_receipt_atomic|approve_worker_receipt_atomic|record_worker_reimbursement_payment_atomic|record_worker_payroll_settlement|reverse_worker_payment_atomic|create_expense_atomic|update_expense_atomic|delete_expense_atomic|mutate_expense_line_atomic|replace_expense_receipt_reference)(?:\/|$)/.test(
      path
    ) ||
    /^\/storage\/v1\/object\/(?:worker-receipts|receipts|expense-attachments|attachments)(?:\/|$)/.test(
      path
    )
  );
}

/** Probe only schema capabilities; never call a write RPC or manufacture a fixture. */
export async function workerFinanceSchemaReady(fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!workerFinanceConfiguredOpen()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const checks = [
      "worker_receipts?select=canonical_ingested_at&limit=0",
      "worker_reimbursements?select=source_worker_receipt_id&limit=0",
    ];
    const responses = await Promise.all(
      checks.map((query) =>
        fetcher(`${url}/rest/v1/${query}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        })
      )
    );
    return responses.every((response) => response.ok);
  } catch {
    return false;
  }
}

export async function assertWorkerFinanceWritesAvailable(): Promise<void> {
  let open = false;
  if (typeof window === "undefined") open = await workerFinanceSchemaReady();
  else {
    try {
      const response = await fetch("/api/worker-finance/write-status", { cache: "no-store" });
      open = response.ok && (await response.json()).writes === "canonical";
    } catch {
      /* Fail closed. */
    }
  }
  if (!open) throw new Error(WORKER_FINANCE_MAINTENANCE);
}

/** All current app Supabase clients pass through this boundary, including background helpers. */
export const workerFinanceFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  const method = init?.method || request?.method || "GET";
  if (isWorkerFinanceDataWrite(url.pathname, method)) {
    try {
      await assertWorkerFinanceWritesAvailable();
    } catch {
      return workerFinanceMaintenanceResponse();
    }
  }
  return fetch(input, init);
};
