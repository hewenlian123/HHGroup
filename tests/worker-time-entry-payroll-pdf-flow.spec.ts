import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { allowWorkerPaymentMutations } from "./e2e-env-helpers";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "LOCAL-TIMEPAYROLL-QA-DELETE-ME";
const WORKER_NAME = `${PREFIX} Worker`;
const PROJECT_NAME = `${PREFIX} Project`;
const RUN_ID = Date.now();
const PROJECT_ID = randomUUID();
const DAILY_RATE = 200;
const NEW_DAILY_RATE = 250;
const REIMBURSEMENT_AMOUNT = 35;
const ADVANCE_AMOUNT = 50;
const PARTIAL_PAYMENT_AMOUNT = 100;
const FINAL_PAYMENT_AMOUNT = 185;

const TODAY_DATE = new Date().toISOString().slice(0, 10);
function datePlusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const FULL_DATE = datePlusDays(TODAY_DATE, 1);
const HALF_DATE = datePlusDays(TODAY_DATE, 2);
const NEW_RATE_DATE = datePlusDays(TODAY_DATE, 3);
const runMonth = (() => {
  return FULL_DATE.slice(0, 7);
})();
const PERIOD_START = datePlusDays(TODAY_DATE, -1);
const PERIOD_END = NEW_RATE_DATE;

type BalanceResponse = {
  summary: {
    laborOwed: number;
    reimbursements: number;
    payments: number;
    advances: number;
    balance: number;
  };
  laborEntries: Array<{
    id: string;
    date: string;
    amount: number;
    workerPaymentId: string | null;
    payrollSettled: boolean;
  }>;
  reimbursements: Array<{ id: string; amount: number; status: string }>;
  payments: Array<{ id: string; amount: number; date: string }>;
};

type PayrollSummaryResponse = {
  ok: boolean;
  rows: Array<{
    workerId: string;
    workerName: string;
    earned: number;
    reimbursements: number;
    shouldPay: number;
    paid: number;
    balance: number;
  }>;
};

let admin: SupabaseClient | null = null;
let workerId = "";
const uploadedStoragePaths = new Set<string>();

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
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
  throw new Error(`Failed to upsert ${table}: ${last || "unknown error"}`);
}

async function deleteByIds(client: SupabaseClient, table: string, column: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) throw new Error(`Failed to cleanup ${table}.${column}: ${error.message}`);
}

async function idsByNamePrefix(client: SupabaseClient, table: string): Promise<string[]> {
  const { data, error } = await client.from(table).select("id, name").ilike("name", `${PREFIX}%`);
  if (error) throw new Error(`Failed to load ${table} cleanup ids: ${error.message}`);
  return ((data ?? []) as Array<{ id?: string }>).map((row) => row.id).filter(Boolean) as string[];
}

async function projectIdsByPrefix(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from("projects")
    .select("id, name")
    .ilike("name", `${PREFIX}%`);
  if (error) throw new Error(`Failed to load project cleanup ids: ${error.message}`);
  return ((data ?? []) as Array<{ id?: string }>).map((row) => row.id).filter(Boolean) as string[];
}

function parseWorkerReceiptStoragePath(receiptUrl: string | null | undefined): string | null {
  const url = String(receiptUrl ?? "");
  const marker = "/storage/v1/object/public/worker-receipts/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rawPath = url.slice(index + marker.length).split("?")[0] ?? "";
  return rawPath ? decodeURIComponent(rawPath) : null;
}

async function cleanupLocalQaData(client: SupabaseClient): Promise<{
  workerIds: string[];
  projectIds: string[];
}> {
  const workerIds = [
    ...new Set([
      ...(await idsByNamePrefix(client, "workers")),
      ...(await idsByNamePrefix(client, "labor_workers")),
    ]),
  ];
  const projectIds = await projectIdsByPrefix(client);

  const receiptUrls: string[] = [];
  if (workerIds.length > 0) {
    const { data } = await client
      .from("worker_receipts")
      .select("receipt_url")
      .in("worker_id", workerIds);
    for (const row of (data ?? []) as Array<{ receipt_url?: string | null }>) {
      if (row.receipt_url) receiptUrls.push(row.receipt_url);
    }
  }
  const { data: namedReceipts } = await client
    .from("worker_receipts")
    .select("receipt_url")
    .ilike("worker_name", `${PREFIX}%`);
  for (const row of (namedReceipts ?? []) as Array<{ receipt_url?: string | null }>) {
    if (row.receipt_url) receiptUrls.push(row.receipt_url);
  }

  const storagePaths = [
    ...uploadedStoragePaths,
    ...receiptUrls
      .map(parseWorkerReceiptStoragePath)
      .filter((path): path is string => Boolean(path)),
  ];
  if (storagePaths.length > 0) {
    await client.storage.from("worker-receipts").remove([...new Set(storagePaths)]);
  }

  await deleteByIds(client, "worker_receipts", "worker_id", workerIds);
  await client.from("worker_receipts").delete().ilike("worker_name", `${PREFIX}%`);
  await deleteByIds(client, "worker_reimbursements", "worker_id", workerIds);
  await deleteByIds(client, "worker_advances", "worker_id", workerIds);
  await deleteByIds(client, "worker_payments", "worker_id", workerIds);
  await deleteByIds(client, "labor_entries", "worker_id", workerIds);
  await deleteByIds(client, "worker_rate_history", "worker_id", workerIds);
  await deleteByIds(client, "worker_invoices", "worker_id", workerIds);

  await deleteByIds(client, "worker_receipts", "project_id", projectIds);
  await deleteByIds(client, "worker_reimbursements", "project_id", projectIds);
  await deleteByIds(client, "worker_advances", "project_id", projectIds);
  await deleteByIds(client, "labor_entries", "project_id", projectIds);
  await deleteByIds(client, "worker_invoices", "project_id", projectIds);

  await deleteByIds(client, "labor_workers", "id", workerIds);
  await deleteByIds(client, "workers", "id", workerIds);
  await deleteByIds(client, "projects", "id", projectIds);

  return { workerIds, projectIds };
}

async function verifyCleanupCounts(
  client: SupabaseClient,
  ids: { workerIds: string[]; projectIds: string[] }
): Promise<void> {
  const countByPrefix = async (table: string) => {
    const { count, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .ilike("name", `${PREFIX}%`);
    if (error) throw new Error(`Failed cleanup count for ${table}: ${error.message}`);
    expect(count ?? 0, `${table} prefix cleanup count`).toBe(0);
  };
  await countByPrefix("workers");
  await countByPrefix("labor_workers");
  await countByPrefix("projects");

  const countByIds = async (table: string, column: string, rowIds: string[]) => {
    if (rowIds.length === 0) return;
    const { count, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, rowIds);
    if (error) throw new Error(`Failed cleanup count for ${table}: ${error.message}`);
    expect(count ?? 0, `${table}.${column} cleanup count`).toBe(0);
  };
  await countByIds("labor_entries", "worker_id", ids.workerIds);
  await countByIds("worker_receipts", "worker_id", ids.workerIds);
  await countByIds("worker_reimbursements", "worker_id", ids.workerIds);
  await countByIds("worker_advances", "worker_id", ids.workerIds);
  await countByIds("worker_payments", "worker_id", ids.workerIds);
  await countByIds("worker_rate_history", "worker_id", ids.workerIds);
  await countByIds("worker_invoices", "worker_id", ids.workerIds);
  await countByIds("labor_entries", "project_id", ids.projectIds);
}

async function seedProject(client: SupabaseClient) {
  await insertFirstSuccess(client, "projects", [
    {
      id: PROJECT_ID,
      name: PROJECT_NAME,
      status: "active",
      budget: 0,
      spent: 0,
    },
    {
      id: PROJECT_ID,
      name: PROJECT_NAME,
      status: "active",
    },
  ]);
}

async function syncLaborWorker(client: SupabaseClient, id: string) {
  await upsertFirstSuccess(client, "labor_workers", [
    {
      id,
      name: WORKER_NAME,
      active: true,
      rate: DAILY_RATE,
      type: "QA",
    },
    {
      id,
      name: WORKER_NAME,
    },
  ]);
}

async function waitForWorkerIdByName(page: Page, client: SupabaseClient): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const { data, error } = await client
      .from("workers")
      .select("id, name")
      .eq("name", WORKER_NAME)
      .maybeSingle();
    if (error) throw new Error(`Failed to load created worker: ${error.message}`);
    const id = (data as { id?: string } | null)?.id;
    if (id) return id;
    await page.waitForTimeout(500);
  }
  throw new Error("Created worker was not found in local database.");
}

function expectMoney(actual: number, expected: number) {
  expect(Math.round(actual * 100)).toBe(Math.round(expected * 100));
}

async function expectResponseOk(response: Awaited<ReturnType<Page["waitForResponse"]>>) {
  if (response.ok()) return;
  const body = await response.text().catch(() => "");
  expect(response.ok(), `${response.status()} ${body}`).toBe(true);
}

async function balanceJson(page: Page, id = workerId): Promise<BalanceResponse> {
  const res = await page.request.get(
    `/api/labor/workers/${encodeURIComponent(id)}/balance?t=${Date.now()}`
  );
  expect(res.ok(), `GET balance failed: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as BalanceResponse;
}

async function payrollSummaryJson(
  page: Page,
  fromDate: string,
  toDate: string
): Promise<PayrollSummaryResponse["rows"][number]> {
  const res = await page.request.get(
    `/api/labor/payroll-summary?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&t=${Date.now()}`
  );
  expect(res.ok(), `GET payroll summary failed: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as PayrollSummaryResponse;
  expect(body.ok).toBe(true);
  const row = body.rows.find((r) => r.workerId === workerId);
  expect(row, JSON.stringify(body.rows.filter((r) => r.workerName.includes(PREFIX)))).toBeTruthy();
  return row!;
}

function totalAmount(dialog: Locator) {
  return dialog.locator("dl").filter({ hasText: "Total Payment Amount" }).locator("dd").last();
}

function selectedPayable(dialog: Locator) {
  return dialog.locator("dl").filter({ hasText: "Selected payable" }).locator("dd").first();
}

function advanceDeduction(dialog: Locator) {
  return dialog.locator("dl").filter({ hasText: "Advance deduction" }).locator("dd").nth(1);
}

async function expectNoFatalUi(page: Page) {
  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error|permission denied/i
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function createWorkerFromUi(page: Page) {
  await page.goto(`${BASE}/workers`);
  await expect(page.getByRole("heading", { name: /^Worker Center$/i })).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole("button", { name: /^Add Worker$/i })
    .first()
    .click();

  const addWorker = page.getByRole("dialog", { name: /^Add Worker$/i });
  await expect(addWorker).toBeVisible();
  await addWorker.getByPlaceholder("Worker name").fill(WORKER_NAME);
  await addWorker.getByPlaceholder("Trade").fill("QA");
  await addWorker.getByPlaceholder("0").first().fill(String(DAILY_RATE));
  await addWorker.getByPlaceholder("Notes").fill(`${PREFIX} created by Playwright ${RUN_ID}`);
  await addWorker.getByRole("button", { name: /^Add Worker$/i }).click();
  await expect(addWorker).not.toBeVisible({ timeout: 30_000 });
}

async function openAddDailyEntryFromWorker(page: Page) {
  await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
  await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Add Time Entry/i }).click();
  const dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function addDailyEntryViaUi(
  page: Page,
  opts: { date: string; session: "full" | "half"; note: string }
) {
  const dialog = await openAddDailyEntryFromWorker(page);
  await dialog.locator('input[type="date"]').fill(opts.date);
  await expect(dialog.locator("select").first()).toContainText(PROJECT_NAME, { timeout: 30_000 });
  await dialog.locator("select").first().selectOption(PROJECT_ID);
  const workerRow = dialog.getByRole("row").filter({ hasText: WORKER_NAME }).first();
  await expect(workerRow).toBeVisible({ timeout: 30_000 });
  await workerRow.getByRole("button", { name: "AM" }).click();
  if (opts.session === "full") await workerRow.getByRole("button", { name: "PM" }).click();
  await dialog.getByPlaceholder("Optional").first().fill("QA");
  await dialog.getByPlaceholder("Optional").last().fill(opts.note);
  const laborPost = page.waitForResponse(
    (res) => res.url().includes("/api/labor/entries") && res.request().method() === "POST",
    { timeout: 45_000 }
  );
  await dialog.getByRole("button", { name: /^Save$/i }).click();
  const response = await laborPost;
  await expectResponseOk(response);
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
}

async function assertEntrySnapshot(note: string, expectedDays: number, expectedAmount: number) {
  const { data, error } = await admin!
    .from("labor_entries")
    .select(
      "id, days_worked, daily_rate_snapshot, amount_snapshot, labor_cost_snapshot, cost_amount, notes"
    )
    .eq("worker_id", workerId)
    .eq("notes", note)
    .maybeSingle();
  expect(error?.message).toBeUndefined();
  expect(data?.id, `Missing labor entry with note ${note}`).toBeTruthy();
  expect(Number(data?.days_worked)).toBe(expectedDays);
  expect(Number(data?.daily_rate_snapshot)).toBe(expectedAmount === 250 ? 250 : DAILY_RATE);
  expectMoney(
    Number(data?.amount_snapshot ?? data?.labor_cost_snapshot ?? data?.cost_amount),
    expectedAmount
  );
}

async function addReimbursementViaUi(page: Page) {
  await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
  await page.getByRole("link", { name: /Add Reimbursement/i }).click();
  await expect(page.getByRole("heading", { name: /Worker Reimbursements/i })).toBeVisible({
    timeout: 30_000,
  });
  const form = page.locator("form").filter({ hasText: "Vendor" }).first();
  await expect(form.locator("select").first()).toHaveValue(workerId, { timeout: 30_000 });
  await form.locator("select").nth(1).selectOption(PROJECT_ID);
  if ((await form.locator('input[type="date"]').count()) > 0) {
    await form.locator('input[type="date"]').first().fill(FULL_DATE);
  }
  await form.getByPlaceholder("Vendor").fill(`${PREFIX} Reimbursement Vendor`);
  await form.locator('input[type="number"]').fill(String(REIMBURSEMENT_AMOUNT));
  await form.getByPlaceholder("Description").fill(`${PREFIX} reimbursement ${RUN_ID}`);
  const reimbPost = page.waitForResponse(
    (res) => res.url().includes("/api/worker-reimbursements") && res.request().method() === "POST",
    { timeout: 45_000 }
  );
  await form.getByRole("button", { name: /^Save$/i }).click();
  const response = await reimbPost;
  await expectResponseOk(response);
}

async function uploadReceiptViaUi(page: Page) {
  await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
  await page.getByRole("link", { name: /Upload Receipt/i }).click();
  await expect(page.getByRole("heading", { name: /Worker Receipt Upload/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("select").first()).toHaveValue(workerId, { timeout: 30_000 });
  await page.locator("select").nth(1).selectOption(PROJECT_ID);
  await page.locator('input[type="file"]').setInputFiles("public/favicon.png");
  await page
    .getByText(/Recognizing receipt/i)
    .first()
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => undefined);
  await page.locator('input[type="date"]').fill(FULL_DATE);
  await page.getByPlaceholder("商家名称").fill(`${PREFIX} Receipt Vendor`);
  await page.getByPlaceholder("0.00").fill("35");
  await page.getByPlaceholder("选填").fill(`${PREFIX} receipt ${RUN_ID}`);
  await expect(page.getByRole("button", { name: /Submit Receipt/i })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /Submit Receipt/i }).click();
  await expect(page.getByText("Receipt submitted")).toBeVisible({ timeout: 30_000 });
}

async function addAdvanceViaUi(page: Page) {
  await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
  await page.getByRole("link", { name: /Add Advance/i }).click();
  const advanceDialog = page.getByRole("dialog", { name: /Create Advance/i });
  await expect(advanceDialog).toBeVisible({ timeout: 30_000 });
  await expect(advanceDialog.locator("select").first()).toHaveValue(workerId);
  await advanceDialog.locator('input[type="number"]').fill(String(ADVANCE_AMOUNT));
  await advanceDialog.getByPlaceholder("Optional").fill(`${PREFIX} advance ${RUN_ID}`);
  const advancePost = page.waitForResponse(
    (res) => res.url().includes("/api/labor/advances") && res.request().method() === "POST",
    { timeout: 45_000 }
  );
  await advanceDialog.getByRole("button", { name: /^Save$/i }).click();
  const response = await advancePost;
  await expectResponseOk(response);
  await expect(advanceDialog).not.toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await expect(advanceDialog).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get("new")).not.toBe("1");
}

async function openPayDialog(page: Page) {
  await page.goto(`${BASE}/labor/workers/${encodeURIComponent(workerId)}/balance`);
  await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Pay Worker$/i }).click();
  const dialog = page.getByRole("dialog", { name: /Pay Worker/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function submitPayment(page: Page, dialog: Locator) {
  const payPost = page.waitForResponse(
    (res) =>
      res.url().includes("/api/labor/workers/") &&
      res.url().includes("/pay") &&
      res.request().method() === "POST",
    { timeout: 65_000 }
  );
  await dialog.getByRole("button", { name: /^Confirm Payment$/i }).click();
  const response = await payPost;
  await expectResponseOk(response);
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
}

async function closeReceiptPreview(page: Page) {
  const receipt = page.getByRole("dialog", { name: /Receipt preview/i });
  if (await receipt.isVisible({ timeout: 20_000 }).catch(() => false)) {
    await receipt.getByRole("button", { name: /^Close$/i }).click();
    await expect(receipt).not.toBeVisible({ timeout: 20_000 });
  }
}

async function testReceiptPrintAndPdf(page: Page) {
  const receipt = page.getByRole("dialog", { name: /Receipt preview/i });
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  await expect(receipt).toContainText(WORKER_NAME);
  await expect(receipt).toContainText("$185.00");
  await expect(receipt).toContainText("Advance deduction");
  await expect(receipt).toContainText("-$50.00");
  await expectNoFatalUi(page);

  await page.evaluate(() => {
    (window as typeof window & { __workerPrintCalls?: number }).__workerPrintCalls = 0;
    window.print = () => {
      (window as typeof window & { __workerPrintCalls?: number }).__workerPrintCalls =
        ((window as typeof window & { __workerPrintCalls?: number }).__workerPrintCalls ?? 0) + 1;
    };
  });
  await receipt.getByRole("button", { name: /^Print$/i }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __workerPrintCalls?: number }).__workerPrintCalls ?? 0
      )
    )
    .toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await receipt.getByRole("button", { name: /Download PDF/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Receipt-.*\.pdf$/);
  const path = await download.path();
  if (path) rmSync(path, { force: true });
}

async function changeDailyRateViaUi(page: Page) {
  await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
  await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Rate History" }).click();
  await page.getByLabel("New daily rate").fill(String(NEW_DAILY_RATE));
  await page.getByLabel("Effective date").fill(NEW_RATE_DATE);
  await page.getByLabel("Note optional").fill(`${PREFIX} rate change ${RUN_ID}`);
  const post = page.waitForResponse(
    (res) => res.url().includes("/rate-history") && res.request().method() === "POST",
    { timeout: 45_000 }
  );
  await page.getByRole("button", { name: /^Change Daily Rate$/i }).click();
  const response = await post;
  await expectResponseOk(response);
  await expect(page.getByText("Daily rate changed.")).toBeVisible({ timeout: 30_000 });
}

test.describe("Worker time entry → payment → payroll → PDF local flow", () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    const cleaned = await cleanupLocalQaData(admin);
    await verifyCleanupCounts(admin, cleaned);
    await seedProject(admin);
  });

  test.afterAll(async () => {
    if (!admin) return;
    const cleaned = await cleanupLocalQaData(admin);
    await verifyCleanupCounts(admin, cleaned);
  });

  test("validates the full local Worker Labor money and document chain", async ({
    page,
  }, testInfo) => {
    test.skip(!admin, "Supabase service role env is not available.");
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      "Worker payment mutations are only allowed for local/payment E2E targets."
    );

    await createWorkerFromUi(page);
    workerId = await waitForWorkerIdByName(page, admin!);
    await syncLaborWorker(admin!, workerId);

    const initial = await balanceJson(page);
    expectMoney(initial.summary.laborOwed, 0);
    expectMoney(initial.summary.reimbursements, 0);
    expectMoney(initial.summary.advances, 0);
    expectMoney(initial.summary.balance, 0);

    await addDailyEntryViaUi(page, {
      date: FULL_DATE,
      session: "full",
      note: `${PREFIX} full day ${RUN_ID}`,
    });
    await assertEntrySnapshot(`${PREFIX} full day ${RUN_ID}`, 1, 200);

    await addDailyEntryViaUi(page, {
      date: HALF_DATE,
      session: "half",
      note: `${PREFIX} half day ${RUN_ID}`,
    });
    await assertEntrySnapshot(`${PREFIX} half day ${RUN_ID}`, 0.5, 100);

    await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
    await page.getByRole("tab", { name: "Work" }).click();
    await expect(page.getByText("$200.00").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("$100.00").first()).toBeVisible();
    await expectNoFatalUi(page);

    let balance = await balanceJson(page);
    expectMoney(balance.summary.laborOwed, 300);
    expectMoney(balance.summary.balance, 300);

    await page.goto(`${BASE}/labor/workers/${encodeURIComponent(workerId)}/balance`);
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("$300.00").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({ timeout: 30_000 });
    await expectNoFatalUi(page);

    await addReimbursementViaUi(page);
    balance = await balanceJson(page);
    expectMoney(balance.summary.laborOwed, 300);
    expectMoney(balance.summary.reimbursements, 35);
    expectMoney(balance.summary.balance, 335);

    await uploadReceiptViaUi(page);
    await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
    await page.getByRole("tab", { name: "Receipts & Reimbursements" }).click();
    await expect(page.getByText(`${PREFIX} Receipt Vendor`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${PREFIX} Reimbursement Vendor`)).toBeVisible();

    await addAdvanceViaUi(page);
    balance = await balanceJson(page);
    expectMoney(balance.summary.advances, 50);
    expectMoney(balance.summary.balance, 285);

    let payDialog = await openPayDialog(page);
    await expect(payDialog.getByText("Unpaid labor entries")).toBeVisible();
    await expect(payDialog.getByText("Unpaid reimbursements")).toBeVisible();
    await payDialog
      .locator("label")
      .filter({ hasText: "$200.00" })
      .locator('input[type="checkbox"]')
      .uncheck();
    await payDialog
      .locator("label")
      .filter({ hasText: "$35.00" })
      .locator('input[type="checkbox"]')
      .uncheck();
    await expect(totalAmount(payDialog)).toHaveText("$100.00");
    await submitPayment(page, payDialog);
    await closeReceiptPreview(page);

    balance = await balanceJson(page);
    expectMoney(balance.summary.laborOwed, 200);
    expectMoney(balance.summary.reimbursements, 35);
    expectMoney(balance.summary.advances, 50);
    expectMoney(balance.summary.payments, 100);
    expectMoney(balance.summary.balance, 185);

    payDialog = await openPayDialog(page);
    await expect(selectedPayable(payDialog)).toHaveText("$235.00");
    await expect(advanceDeduction(payDialog)).toHaveText("-$50.00");
    await expect(totalAmount(payDialog)).toHaveText("$185.00");
    await submitPayment(page, payDialog);
    await testReceiptPrintAndPdf(page);
    await closeReceiptPreview(page);

    balance = await balanceJson(page);
    expectMoney(balance.summary.laborOwed, 0);
    expectMoney(balance.summary.reimbursements, 0);
    expectMoney(balance.summary.advances, 0);
    expectMoney(balance.summary.payments, 285);
    expectMoney(balance.summary.balance, 0);

    const { data: advanceRows, error: advanceError } = await admin!
      .from("worker_advances")
      .select("amount, status")
      .eq("worker_id", workerId);
    expect(advanceError?.message).toBeUndefined();
    expect(advanceRows).toEqual([
      expect.objectContaining({ amount: ADVANCE_AMOUNT, status: "deducted" }),
    ]);

    await page.goto(`${BASE}/workers`);
    const workerCenterRow = page.getByRole("link", {
      name: new RegExp(`Open worker ${WORKER_NAME}`),
    });
    await expect(workerCenterRow).toBeVisible({ timeout: 30_000 });
    await expect(workerCenterRow).toContainText("$0.00");
    await expect(workerCenterRow).toContainText("$185.00");

    await page.goto(`${BASE}/workers/${encodeURIComponent(workerId)}`);
    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByText("$100.00").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("$185.00").first()).toBeVisible();
    await expectNoFatalUi(page);

    await page.getByRole("tab", { name: "Statements" }).click();
    const statementsPanel = page.getByLabel("Statements");
    await expect(statementsPanel.getByRole("link", { name: /Create Statement/i })).toBeVisible();
    await expect(
      statementsPanel.getByRole("link", { name: /Monthly Payroll Statement/i })
    ).toBeVisible();

    await page.goto(
      `${BASE}/workers/${encodeURIComponent(workerId)}/statement/print?start=${PERIOD_START}&end=${PERIOD_END}`
    );
    await expect(page.getByText(WORKER_NAME).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Worker Statement").first()).toBeVisible();
    await expect(page.locator("body")).toContainText("$300.00");
    await expect(page.locator("body")).toContainText("$35.00");
    await expect(page.locator("body")).toContainText("$50.00");
    await expectNoFatalUi(page);

    let payroll = await payrollSummaryJson(page, PERIOD_START, PERIOD_END);
    expectMoney(payroll.earned, 300);
    expectMoney(payroll.reimbursements, 35);
    expectMoney(payroll.shouldPay, 335);
    expectMoney(payroll.paid, 335);
    expectMoney(payroll.balance, 0);

    await page.goto(`${BASE}/labor/payroll`);
    await page.locator('input[aria-label="From"]').fill(PERIOD_START);
    await page.locator('input[aria-label="To"]').fill(PERIOD_END);
    await page.getByPlaceholder("Search worker…").fill(WORKER_NAME);
    await page.getByRole("button", { name: /Refresh/i }).click();
    const payrollRow = page.locator("tbody tr").filter({ hasText: WORKER_NAME }).first();
    await expect(payrollRow).toBeVisible({ timeout: 30_000 });
    await expect(payrollRow).toContainText("$300.00");
    await expect(payrollRow).toContainText("$335.00");
    await expectNoFatalUi(page);

    await page.goto(
      `${BASE}/worker/${encodeURIComponent(workerId)}/monthly-report?month=${encodeURIComponent(runMonth)}`
    );
    await expect(page.getByRole("heading", { name: /^Monthly report$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Total days", { exact: true })).toHaveCount(1);
    await expect(
      page.getByText("Total days", { exact: true }).locator("xpath=following-sibling::dd[1]")
    ).toHaveText("1.5");
    await page.evaluate(() => {
      (window as typeof window & { __payrollPrintCalls?: number }).__payrollPrintCalls = 0;
      window.print = () => {
        (window as typeof window & { __payrollPrintCalls?: number }).__payrollPrintCalls =
          ((window as typeof window & { __payrollPrintCalls?: number }).__payrollPrintCalls ?? 0) +
          1;
      };
    });
    await page.getByRole("button", { name: "Print / PDF" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __payrollPrintCalls?: number }).__payrollPrintCalls ?? 0
        )
      )
      .toBeGreaterThan(0);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".payroll-statement-print-root")).toBeVisible();
    await expect(page.locator(".payroll-statement-print-root")).toContainText(WORKER_NAME);
    await expect(page.locator(".payroll-statement-print-root")).toContainText("$300.00");
    await page.emulateMedia({ media: "screen" });
    await expectNoFatalUi(page);

    await changeDailyRateViaUi(page);
    await addDailyEntryViaUi(page, {
      date: NEW_RATE_DATE,
      session: "full",
      note: `${PREFIX} new rate full day ${RUN_ID}`,
    });
    await assertEntrySnapshot(`${PREFIX} new rate full day ${RUN_ID}`, 1, 250);

    const { data: allEntries, error: entriesError } = await admin!
      .from("labor_entries")
      .select(
        "notes, days_worked, daily_rate_snapshot, amount_snapshot, labor_cost_snapshot, cost_amount"
      )
      .eq("worker_id", workerId)
      .order("work_date", { ascending: true });
    expect(entriesError?.message).toBeUndefined();
    const entryAmounts = new Map(
      (allEntries ?? []).map((entry) => [
        String(entry.notes),
        Number(entry.amount_snapshot ?? entry.labor_cost_snapshot ?? entry.cost_amount),
      ])
    );
    expectMoney(entryAmounts.get(`${PREFIX} full day ${RUN_ID}`) ?? 0, 200);
    expectMoney(entryAmounts.get(`${PREFIX} half day ${RUN_ID}`) ?? 0, 100);
    expectMoney(entryAmounts.get(`${PREFIX} new rate full day ${RUN_ID}`) ?? 0, 250);

    balance = await balanceJson(page);
    expectMoney(balance.summary.laborOwed, 250);
    expectMoney(balance.summary.balance, 250);

    payroll = await payrollSummaryJson(page, PERIOD_START, PERIOD_END);
    expectMoney(payroll.earned, 550);
    expectMoney(payroll.reimbursements, 35);
    expectMoney(payroll.shouldPay, 585);
    expectMoney(payroll.paid, 335);
    expectMoney(payroll.balance, 250);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of [
      `${BASE}/workers`,
      `${BASE}/workers/${encodeURIComponent(workerId)}`,
      `${BASE}/workers/${encodeURIComponent(workerId)}?tab=work`,
      `${BASE}/workers/${encodeURIComponent(workerId)}?tab=receipts`,
      `${BASE}/workers/${encodeURIComponent(workerId)}?tab=payments`,
      `${BASE}/labor/payroll`,
    ]) {
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");
      await expectNoFatalUi(page);
      await expectNoHorizontalOverflow(page);
    }
  });
});
