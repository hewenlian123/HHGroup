import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { allowWorkerPaymentMutations } from "./e2e-env-helpers";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "LOCAL-WORKER-QA-DELETE-ME";
const RUN_ID = Date.now();
const WORKER_NAME = `${PREFIX} Worker ${RUN_ID}`;
const PROJECT_NAME = `${PREFIX} Project ${RUN_ID}`;
const RECEIPT_VENDOR = `${PREFIX} Receipt Vendor`;
const REIMB_VENDOR = `${PREFIX} Reimbursement Vendor`;
const ADVANCE_NOTE = `${PREFIX} advance ${RUN_ID}`;
const PROJECT_ID = randomUUID();
const DAILY_RATE = 650;
const REIMBURSEMENT_AMOUNT = 35;

let admin: SupabaseClient | null = null;
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

function parseWorkerReceiptStoragePath(receiptUrl: string | null | undefined): string | null {
  const url = String(receiptUrl ?? "");
  const marker = "/storage/v1/object/public/worker-receipts/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rawPath = url.slice(index + marker.length).split("?")[0] ?? "";
  return rawPath ? decodeURIComponent(rawPath) : null;
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

async function deleteByIds(client: SupabaseClient, table: string, column: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) throw new Error(`Failed to cleanup ${table}.${column}: ${error.message}`);
}

async function cleanupLocalQaData(client: SupabaseClient): Promise<void> {
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

  await deleteByIds(client, "worker_receipts", "project_id", projectIds);
  await deleteByIds(client, "worker_reimbursements", "project_id", projectIds);
  await deleteByIds(client, "worker_advances", "project_id", projectIds);
  await deleteByIds(client, "labor_entries", "project_id", projectIds);

  await deleteByIds(client, "labor_workers", "id", workerIds);
  await deleteByIds(client, "workers", "id", workerIds);
  await deleteByIds(client, "projects", "id", projectIds);
}

async function waitForWorkerIdByName(page: Page, client: SupabaseClient): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const { data, error } = await client
      .from("workers")
      .select("*")
      .eq("name", WORKER_NAME)
      .maybeSingle();
    if (error) throw new Error(`Failed to load created worker: ${error.message}`);
    const id = (data as { id?: string } | null)?.id;
    if (id) return id;
    await page.waitForTimeout(500);
  }
  throw new Error("Created worker was not found in local database.");
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

async function closeAnyReceiptPreview(page: Page) {
  const receipt = page.getByRole("dialog", { name: /Receipt preview/i });
  if (await receipt.isVisible({ timeout: 20_000 }).catch(() => false)) {
    const close = receipt.getByRole("button", { name: /^Close$/i });
    if (await close.isVisible().catch(() => false)) await close.click();
    else await page.keyboard.press("Escape");
    await expect(receipt).not.toBeVisible({ timeout: 20_000 });
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Worker Center full local flow", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    await cleanupLocalQaData(admin);
    await seedProject(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanupLocalQaData(admin);
  });

  test("creates local worker flow data and verifies Worker Center navigation", async ({
    page,
  }, testInfo) => {
    test.skip(!admin, "Supabase service role env is not available.");
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      "Worker payment mutations are only allowed for local/payment E2E targets."
    );

    await page.goto(`${BASE}/workers`);
    await expect(page.getByRole("heading", { name: /^Worker Center$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Worker Center").first()).toBeVisible();
    await page
      .getByRole("button", { name: /^Add Worker$/i })
      .first()
      .click();

    const addWorker = page.getByRole("dialog", { name: /^Add Worker$/i });
    await expect(addWorker).toBeVisible();
    await addWorker.getByPlaceholder("Worker name").fill(WORKER_NAME);
    await addWorker.getByPlaceholder("Trade").fill("QA");
    await addWorker.getByPlaceholder("0").first().fill(String(DAILY_RATE));
    await addWorker.getByPlaceholder("Notes").fill(`${PREFIX} created by Playwright`);
    await addWorker.getByRole("button", { name: /^Add Worker$/i }).click();
    await expect(addWorker).not.toBeVisible({ timeout: 30_000 });

    const createdWorkerId = await waitForWorkerIdByName(page, admin!);
    await syncLaborWorker(admin!, createdWorkerId);

    await page.goto(`${BASE}/workers/${encodeURIComponent(createdWorkerId)}`);
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
      timeout: 30_000,
    });
    for (const tab of [
      "Overview",
      "Work",
      "Receipts & Reimbursements",
      "Advances",
      "Payments",
      "Statements",
      "Rate History",
    ]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
    await expect(page.getByText("Net To Pay").first()).toBeVisible();
    await expect(page.getByText("Current Daily Rate").first()).toBeVisible();

    await page.getByRole("link", { name: /Add Time Entry/i }).click();
    const dailyDialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
    await expect(dailyDialog).toBeVisible({ timeout: 30_000 });
    await dailyDialog.locator("select").first().selectOption(PROJECT_ID);
    const workerRow = dailyDialog.getByRole("row").filter({ hasText: WORKER_NAME }).first();
    await expect(workerRow).toBeVisible({ timeout: 30_000 });
    await workerRow.getByRole("button", { name: "AM" }).click();
    await workerRow.getByRole("button", { name: "PM" }).click();
    await dailyDialog.getByPlaceholder("Optional").first().fill("QA");
    await dailyDialog.getByPlaceholder("Optional").last().fill(`${PREFIX} time entry`);
    const laborPost = page.waitForResponse(
      (res) => res.url().includes("/api/labor/entries") && res.request().method() === "POST",
      { timeout: 45_000 }
    );
    await dailyDialog.getByRole("button", { name: /^Save$/i }).click();
    expect((await laborPost).ok()).toBe(true);
    await expect(dailyDialog).not.toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE}/workers/${encodeURIComponent(createdWorkerId)}`);
    await page.getByRole("link", { name: /Upload Worker Receipt/i }).click();
    await expect(page.getByRole("heading", { name: /Worker Receipt Upload/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("select").first()).toHaveValue(createdWorkerId, {
      timeout: 30_000,
    });
    await page.locator("select").nth(1).selectOption(PROJECT_ID);
    await page.locator('input[type="file"]').setInputFiles("public/favicon.png");
    await expect(page.getByRole("button", { name: /Submit Receipt/i })).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByPlaceholder("商家名称").fill(RECEIPT_VENDOR);
    await page.getByPlaceholder("0.00").fill("12.34");
    await page.getByPlaceholder("选填").fill(`${PREFIX} receipt note`);
    const uploadPost = page.waitForResponse(
      (res) =>
        res.url().includes("/api/upload-receipt/upload") && res.request().method() === "POST",
      { timeout: 45_000 }
    );
    const receiptSubmitPost = page.waitForResponse(
      (res) =>
        res.url().includes("/api/upload-receipt/submit") && res.request().method() === "POST",
      { timeout: 45_000 }
    );
    await page.getByRole("button", { name: /Submit Receipt/i }).click();
    const uploadResponse = await uploadPost;
    expect(uploadResponse.ok(), await uploadResponse.text()).toBe(true);
    const uploadJson = (await uploadResponse.json()) as { path?: string };
    if (uploadJson.path) uploadedStoragePaths.add(uploadJson.path);
    expect((await receiptSubmitPost).ok()).toBe(true);
    await expect(page).toHaveURL(
      new RegExp(
        `/workers/${createdWorkerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?tab=receipts`
      ),
      { timeout: 30_000 }
    );
    await expect(page.getByText(RECEIPT_VENDOR)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: /Add Reimbursement/i }).click();
    await expect(page.getByRole("heading", { name: /Worker Reimbursements/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "New Reimbursement" })).toBeVisible({
      timeout: 30_000,
    });
    const reimbursementForm = page.locator("form").filter({ hasText: "Vendor" }).first();
    await expect(reimbursementForm.locator("select").first()).toHaveValue(createdWorkerId);
    await reimbursementForm.locator("select").nth(1).selectOption(PROJECT_ID);
    await reimbursementForm.getByPlaceholder("Vendor").fill(REIMB_VENDOR);
    await reimbursementForm.locator('input[type="number"]').fill(String(REIMBURSEMENT_AMOUNT));
    await reimbursementForm.getByPlaceholder("Description").fill(`${PREFIX} reimbursement`);
    const reimbPost = page.waitForResponse(
      (res) =>
        res.url().includes("/api/worker-reimbursements") && res.request().method() === "POST",
      { timeout: 45_000 }
    );
    await reimbursementForm.getByRole("button", { name: /^Save$/i }).click();
    expect((await reimbPost).ok()).toBe(true);

    await page.goto(`${BASE}/workers/${encodeURIComponent(createdWorkerId)}`);
    await page.getByRole("link", { name: /Add Advance/i }).click();
    const advanceDialog = page.getByRole("dialog", { name: /Create Advance/i });
    await expect(advanceDialog).toBeVisible({ timeout: 30_000 });
    await expect(advanceDialog.locator("select").first()).toHaveValue(createdWorkerId);
    await advanceDialog.locator('input[type="number"]').fill("50");
    await advanceDialog.getByPlaceholder("Optional").fill(ADVANCE_NOTE);
    const advancePost = page.waitForResponse(
      (res) => res.url().includes("/api/labor/advances") && res.request().method() === "POST",
      { timeout: 45_000 }
    );
    await advanceDialog.getByRole("button", { name: /^Save$/i }).click();
    expect((await advancePost).ok()).toBe(true);
    await expect(advanceDialog).not.toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE}/workers/${encodeURIComponent(createdWorkerId)}`);
    await page.getByRole("tab", { name: "Advances" }).click();
    await page.getByRole("link", { name: /Pay Worker/i }).click();
    await expect(page.getByRole("button", { name: /^Pay Selected$/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    const laborRow = page.locator("tr", { hasText: "$650.00" }).first();
    await expect(laborRow).toBeVisible({ timeout: 30_000 });
    await laborRow.locator('input[type="checkbox"]').check();
    const reimbursementRow = page.locator("tr", { hasText: REIMB_VENDOR }).first();
    await expect(reimbursementRow).toBeVisible({ timeout: 30_000 });
    await reimbursementRow.locator('input[type="checkbox"]').check();
    await expect(page.getByText("1 item · $35.00")).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: /^Pay Selected$/i })
      .first()
      .click();
    const payDialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(payDialog).toBeVisible();
    await expect(payDialog.getByText("Selected labor", { exact: true }).first()).toBeVisible();
    await expect(
      payDialog.getByText("Selected reimbursements", { exact: true }).first()
    ).toBeVisible();
    await expect(payDialog.getByText(REIMB_VENDOR).first()).toBeVisible();
    await expect(payDialog.getByText("$35.00").first()).toBeVisible();
    await expect(payDialog.getByText("$635.00").first()).toBeVisible();

    const payPost = page.waitForResponse(
      (res) =>
        res.url().includes("/api/labor/workers/") &&
        res.url().includes("/pay") &&
        res.request().method() === "POST",
      { timeout: 65_000 }
    );
    await payDialog.getByRole("button", { name: /^Confirm Payment$/i }).click();
    const payResponse = await payPost;
    expect(payResponse.ok(), await payResponse.text()).toBe(true);
    await expect(payDialog).not.toBeVisible({ timeout: 30_000 });
    await closeAnyReceiptPreview(page);

    await page.goto(`${BASE}/workers/${encodeURIComponent(createdWorkerId)}`);
    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByText("$635.00").first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Statements" }).click();
    await expect(page.getByText(/Worker statements|Statements/i).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/workers/${encodeURIComponent(createdWorkerId)}`);
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
  });
});
