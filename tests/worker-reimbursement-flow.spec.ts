import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";
import { loginAsE2EOwner } from "./e2e-auth-owner";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "LOCAL-WORKER-REIMBURSEMENT-FIX-DELETE-ME";
const RUN_ID = Date.now();
const WORKER_ID = randomUUID();
const PROJECT_ID = randomUUID();
const EXPENSE_ID = randomUUID();
const EXPENSE_LINE_ID = randomUUID();
const LABOR_ENTRY_ID = randomUUID();

type BalanceResponse = {
  summary: {
    laborOwed: number;
    reimbursements: number;
    payments: number;
    advances: number;
    balance: number;
  };
  laborEntries: Array<{ id: string; amount: number; workerPaymentId: string | null }>;
  reimbursements: Array<{ id: string; amount: number; status: string }>;
  payments: Array<{ id: string; amount: number }>;
};

type ReceiptPreviewResponse = {
  receipt: {
    laborLines: Array<{ id: string; amount: number }>;
    reimbLines: Array<{ id: string; amount: number }>;
    laborSubtotal: number;
    reimbSubtotal: number;
    balance: { remainingBalance: number };
  };
};

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  assertE2EBaseUrlSafeForMutations(BASE, "worker reimbursement flow E2E");
  return createClient(url, key);
}

async function cleanupRows(client: SupabaseClient) {
  await client.from("labor_entries").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_receipts").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_reimbursements").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_payments").delete().eq("worker_id", WORKER_ID);
  await client.from("expense_lines").delete().eq("expense_id", EXPENSE_ID);
  await client.from("expenses").delete().eq("id", EXPENSE_ID);
  await client.from("labor_workers").delete().eq("id", WORKER_ID);
  await client.from("workers").delete().eq("id", WORKER_ID);
  await client.from("projects").delete().eq("id", PROJECT_ID);
}

async function insertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[]
): Promise<void> {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).insert(payload);
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to seed ${table}: ${last || "unknown error"}`);
}

async function upsertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[],
  onConflict = "id"
): Promise<void> {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).upsert(payload, { onConflict });
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to seed ${table}: ${last || "unknown error"}`);
}

async function seedCompanyExpenseReimbursement(client: SupabaseClient) {
  await cleanupRows(client);
  await insertFirstSuccess(client, "projects", [
    { id: PROJECT_ID, name: `${PREFIX} Project ${RUN_ID}`, status: "Active", budget: 0, spent: 0 },
    { id: PROJECT_ID, name: `${PREFIX} Project ${RUN_ID}`, status: "Active" },
  ]);
  await insertFirstSuccess(client, "workers", [
    {
      id: WORKER_ID,
      name: `${PREFIX} Worker ${RUN_ID}`,
      role: "QA",
      daily_rate: 200,
      half_day_rate: 100,
      status: "active",
      notes: PREFIX,
    },
    { id: WORKER_ID, name: `${PREFIX} Worker ${RUN_ID}`, status: "active" },
  ]);
  await upsertFirstSuccess(client, "labor_workers", [
    { id: WORKER_ID, name: `${PREFIX} Worker ${RUN_ID}`, active: true, rate: 200, type: "QA" },
    { id: WORKER_ID, name: `${PREFIX} Worker ${RUN_ID}` },
  ]);
  await insertFirstSuccess(client, "expenses", [
    {
      id: EXPENSE_ID,
      expense_date: "2026-06-10",
      vendor_name: `${PREFIX} Company Vendor`,
      vendor: `${PREFIX} Company Vendor`,
      amount: 0.01,
      total: 0.01,
      line_count: 1,
      status: "needs_review",
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      source_type: "reimbursement",
      source: "worker_reimbursement",
      reference_no: `INBOX-UP-${"a".repeat(64)}`,
      notes: `${PREFIX} company expense reimbursement`,
      receipt_url: "https://example.test/local-company-receipt.jpg",
      payment_method: "cash",
    },
    {
      id: EXPENSE_ID,
      expense_date: "2026-06-10",
      vendor: `${PREFIX} Company Vendor`,
      amount: 0.01,
      total: 0.01,
      status: "needs_review",
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      source_type: "reimbursement",
      reference_no: `INBOX-UP-${"a".repeat(64)}`,
      notes: `${PREFIX} company expense reimbursement`,
    },
  ]);
  await insertFirstSuccess(client, "expense_lines", [
    {
      id: EXPENSE_LINE_ID,
      expense_id: EXPENSE_ID,
      amount: 35,
      total: 35,
      description: `${PREFIX} company reimbursement line`,
      category: "Worker Reimbursement",
      project_id: PROJECT_ID,
    },
    {
      id: EXPENSE_LINE_ID,
      expense_id: EXPENSE_ID,
      amount: 35,
      description: `${PREFIX} company reimbursement line`,
      category: "Worker Reimbursement",
      project_id: PROJECT_ID,
    },
  ]);
  await insertFirstSuccess(client, "labor_entries", [
    {
      id: LABOR_ENTRY_ID,
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      work_date: "2026-06-10",
      days_worked: 1,
      daily_rate_snapshot: 200,
      amount_snapshot: 200,
      labor_cost_snapshot: 200,
      cost_amount: 200,
      status: "approved",
      morning: true,
      afternoon: true,
      notes: `${PREFIX} unpaid labor`,
    },
    {
      id: LABOR_ENTRY_ID,
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      work_date: "2026-06-10",
      cost_amount: 200,
      status: "approved",
      morning: true,
      afternoon: true,
      notes: `${PREFIX} unpaid labor`,
    },
  ]);
}

async function workerReimbursements(client: SupabaseClient) {
  const { data, error } = await client
    .from("worker_reimbursements")
    .select("id, worker_id, project_id, amount, status, payment_id")
    .eq("worker_id", WORKER_ID)
    .order("created_at", { ascending: true });
  expect(error).toBeNull();
  return (data ?? []) as Array<{
    id: string;
    worker_id: string;
    project_id: string | null;
    amount: number;
    status: string | null;
    payment_id: string | null;
  }>;
}

async function balanceJson(page: Page): Promise<BalanceResponse> {
  const response = await page.request.get(
    `/api/labor/workers/${encodeURIComponent(WORKER_ID)}/balance?t=${Date.now()}`
  );
  expect(response.ok(), `GET balance failed ${response.status()}: ${await response.text()}`).toBe(
    true
  );
  return (await response.json()) as BalanceResponse;
}

function expectMoney(actual: number, expected: number) {
  expect(Math.round(Number(actual) * 100)).toBe(Math.round(expected * 100));
}

test.describe("Worker reimbursement company expense flow", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    await seedCompanyExpenseReimbursement(admin);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await cleanupRows(admin);
    const [{ count: workerCount }, { count: projectCount }, { count: reimbCount }] =
      await Promise.all([
        admin.from("workers").select("id", { count: "exact", head: true }).eq("id", WORKER_ID),
        admin.from("projects").select("id", { count: "exact", head: true }).eq("id", PROJECT_ID),
        admin
          .from("worker_reimbursements")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", WORKER_ID),
      ]);
    expect(workerCount).toBe(0);
    expect(projectCount).toBe(0);
    expect(reimbCount).toBe(0);
  });

  test("approved company reimbursement expense becomes payable and traceable", async ({ page }) => {
    if (!admin) test.skip(true, "Supabase service role is not configured.");
    await loginAsE2EOwner(page);

    const approve = await page.request.post(
      `/api/financial/expenses/${encodeURIComponent(EXPENSE_ID)}/approve-inbox`
    );
    expect(approve.ok(), `approve failed ${approve.status()}: ${await approve.text()}`).toBe(true);

    const rowsAfterFirstApprove = await workerReimbursements(admin!);
    expect(rowsAfterFirstApprove).toHaveLength(1);
    const reimbursement = rowsAfterFirstApprove[0]!;
    expectMoney(Number(reimbursement.amount), 35);
    expect(String(reimbursement.status).toLowerCase()).toBe("pending");
    expect(reimbursement.project_id).toBe(PROJECT_ID);

    const secondApprove = await page.request.post(
      `/api/financial/expenses/${encodeURIComponent(EXPENSE_ID)}/approve-inbox`
    );
    expect([200, 409]).toContain(secondApprove.status());
    expect(await workerReimbursements(admin!)).toHaveLength(1);

    const balanceBeforePay = await balanceJson(page);
    expectMoney(balanceBeforePay.summary.laborOwed, 200);
    expectMoney(balanceBeforePay.summary.reimbursements, 35);
    expectMoney(balanceBeforePay.summary.balance, 235);
    expect(balanceBeforePay.reimbursements.map((row) => row.id)).toContain(reimbursement.id);

    await page.goto(`/workers/${encodeURIComponent(WORKER_ID)}?tab=receipts`);
    await expect(page.getByText("$35.00").first()).toBeVisible({ timeout: 30_000 });

    const pay = await page.request.post(`/api/labor/workers/${encodeURIComponent(WORKER_ID)}/pay`, {
      data: {
        amount: 235,
        payment_method: "cash",
        payment_date: "2026-06-10",
        notes: `${PREFIX} payment`,
        labor_entry_ids: [LABOR_ENTRY_ID],
        reimbursement_ids: [reimbursement.id],
        advance_deduction_amount: 0,
        idempotency_key: `${PREFIX}-${RUN_ID}-payment`,
      },
    });
    expect(pay.ok(), `pay failed ${pay.status()}: ${await pay.text()}`).toBe(true);
    const payBody = (await pay.json()) as { payment: { id: string } };
    expect(payBody.payment.id).toBeTruthy();

    const rowsAfterPayment = await workerReimbursements(admin!);
    expect(rowsAfterPayment).toHaveLength(1);
    expect(String(rowsAfterPayment[0]!.status).toLowerCase()).toBe("paid");
    expect(rowsAfterPayment[0]!.payment_id).toBe(payBody.payment.id);

    const balanceAfterPay = await balanceJson(page);
    expect(balanceAfterPay.reimbursements).toHaveLength(0);
    expect(balanceAfterPay.laborEntries).toHaveLength(0);
    expectMoney(balanceAfterPay.summary.balance, 0);

    const receipt = await page.request.get(
      `/api/labor/worker-payments/${encodeURIComponent(payBody.payment.id)}/receipt-preview`
    );
    expect(receipt.ok(), `receipt failed ${receipt.status()}: ${await receipt.text()}`).toBe(true);
    const receiptBody = (await receipt.json()) as ReceiptPreviewResponse;
    expectMoney(receiptBody.receipt.laborSubtotal, 200);
    expectMoney(receiptBody.receipt.reimbSubtotal, 35);
    expect(receiptBody.receipt.reimbLines.map((line) => line.id)).toContain(reimbursement.id);
    expectMoney(receiptBody.receipt.balance.remainingBalance, 0);

    await page.goto(`/labor/payments/${encodeURIComponent(payBody.payment.id)}/receipt`);
    await expect(page.getByText(`${PREFIX} Worker ${RUN_ID}`).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("$200.00").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("$35.00").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Balance").first()).toBeVisible({ timeout: 30_000 });
  });
});
