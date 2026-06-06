import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { allowWorkerPaymentMutations } from "./e2e-env-helpers";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "[E2E] Labor Worker Center Statement";
const RUN_ID = Date.now();
const WORKER_NAME = `${PREFIX} Worker ${RUN_ID}`;
const OWED_WORKER_NAME = `${PREFIX} Owed Worker ${RUN_ID}`;
const SETTLED_WORKER_NAME = `${PREFIX} Settled Worker ${RUN_ID}`;
const PROJECT_A_NAME = `${PREFIX} Project A ${RUN_ID}`;
const PROJECT_B_NAME = `${PREFIX} Project B ${RUN_ID}`;
const PROJECT_A_ID = randomUUID();
const PROJECT_B_ID = randomUUID();
const DAILY_RATE = 400;
const FULL_DAY_AMOUNT = 400;
const HALF_DAY_AMOUNT = 200;
const TOTAL_EARNED = 800;
const PARTIAL_PAYMENT_NOTE = `${PREFIX} partial payment ${RUN_ID}`;
const FULL_PAYMENT_NOTE = `${PREFIX} full payment ${RUN_ID}`;

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
    projectName: string | null;
    amount: number;
    payrollSettled: boolean;
    session: string | null;
    workerPaymentId: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    notes: string | null;
    paymentMethod: string | null;
  }>;
};

let admin: SupabaseClient;
let workerId = "";
let owedWorkerId = "";
let settledWorkerId = "";

function previousMonthFixtureDates(): {
  monthYm: string;
  fullDate: string;
  splitDate: string;
} {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const monthYm = `${y}-${m}`;
  return {
    monthYm,
    fullDate: `${monthYm}-10`,
    splitDate: `${monthYm}-11`,
  };
}

const DATES = previousMonthFixtureDates();
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ymdParts(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

function financeDateLabel(ymd: string): string {
  const { year, month, day } = ymdParts(ymd);
  return `${MONTH_SHORT[month - 1]} ${String(day).padStart(2, "0")} · ${year}`;
}

function monthCaptionLabel(ymd: string): string {
  const { year, month } = ymdParts(ymd);
  return `${MONTH_LONG[month - 1]} ${year}`;
}

function envClient(): SupabaseClient {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Local Supabase service role env is required for this E2E flow.");
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):54321$/i.test(url)) {
    throw new Error(`Refusing non-local Supabase URL for labor E2E: ${url}`);
  }
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, { auth: { persistSession: false } });
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

async function idsByNamePrefix(client: SupabaseClient, table: string): Promise<string[]> {
  const { data, error } = await client.from(table).select("id, name").ilike("name", `${PREFIX}%`);
  if (error) throw new Error(`Failed to load ${table} cleanup ids: ${error.message}`);
  return ((data ?? []) as Array<{ id?: string }>).map((row) => row.id).filter(Boolean) as string[];
}

async function deleteByIds(
  client: SupabaseClient,
  table: string,
  column: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) throw new Error(`Failed to cleanup ${table}.${column}: ${error.message}`);
}

async function cleanupLocalRows(client: SupabaseClient): Promise<void> {
  const workerIds = [
    ...new Set([
      ...(await idsByNamePrefix(client, "workers")),
      ...(await idsByNamePrefix(client, "labor_workers")),
    ]),
  ];
  const projectIds = await idsByNamePrefix(client, "projects");

  await deleteByIds(client, "worker_reimbursements", "worker_id", workerIds);
  await deleteByIds(client, "worker_advances", "worker_id", workerIds);
  await deleteByIds(client, "worker_payments", "worker_id", workerIds);
  await deleteByIds(client, "labor_entries", "worker_id", workerIds);
  await deleteByIds(client, "labor_entries", "project_id", projectIds);
  await deleteByIds(client, "worker_rate_history", "worker_id", workerIds);
  await deleteByIds(client, "labor_workers", "id", workerIds);
  await deleteByIds(client, "workers", "id", workerIds);
  await deleteByIds(client, "projects", "id", projectIds);
}

async function seedProjects(client: SupabaseClient): Promise<void> {
  await insertFirstSuccess(client, "projects", [
    {
      id: PROJECT_A_ID,
      name: PROJECT_A_NAME,
      status: "active",
      budget: 0,
      spent: 0,
      client: PREFIX,
    },
    { id: PROJECT_A_ID, name: PROJECT_A_NAME, status: "active", budget: 0, spent: 0 },
    { id: PROJECT_A_ID, name: PROJECT_A_NAME, status: "active" },
  ]);
  await insertFirstSuccess(client, "projects", [
    {
      id: PROJECT_B_ID,
      name: PROJECT_B_NAME,
      status: "active",
      budget: 0,
      spent: 0,
      client: PREFIX,
    },
    { id: PROJECT_B_ID, name: PROJECT_B_NAME, status: "active", budget: 0, spent: 0 },
    { id: PROJECT_B_ID, name: PROJECT_B_NAME, status: "active" },
  ]);
}

async function goto(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error|Supabase is not configured/i,
    { timeout: 30_000 }
  );
}

async function createWorkerViaWorkerCenter(page: Page, workerName = WORKER_NAME): Promise<string> {
  await goto(page, "/workers");
  await expect(page.getByRole("heading", { name: /^Worker Center$/i })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: /^Add Worker$/i }).click();

  const dialog = page.getByRole("dialog", { name: /^Add Worker$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByPlaceholder("Worker name").fill(workerName);
  await dialog.getByPlaceholder("Trade").fill("E2E Labor");
  await dialog.getByLabel("Daily Rate").fill(String(DAILY_RATE));
  await dialog.getByPlaceholder("Notes").fill(`${PREFIX} created by Playwright`);
  await dialog.getByRole("button", { name: /^Add Worker$/i }).click();

  await page.waitForURL(/\/workers\/[^/?#]+(?:[?#].*)?$/, { timeout: 60_000 });
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).pop() ?? "";
  expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { name: workerName })).toBeVisible({
    timeout: 60_000,
  });
  return id;
}

async function openAddDailyDialog(page: Page): Promise<Locator> {
  await goto(page, "/labor");
  await page
    .getByRole("button", { name: /^Add Entry$/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /^Add Daily Entry$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function waitForProjectOption(dialog: Locator, projectId: string): Promise<void> {
  const select = dialog.locator("select").first();
  await expect
    .poll(async () => select.locator(`option[value="${projectId}"]`).count(), {
      timeout: 30_000,
    })
    .toBe(1);
}

async function workerRowInDailyDialog(
  page: Page,
  dialog: Locator,
  workerName = WORKER_NAME
): Promise<Locator> {
  const search = dialog.getByRole("searchbox", { name: /Search workers/i });
  await search.fill(workerName);
  const row = dialog.getByRole("row").filter({ hasText: workerName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  return row;
}

async function saveDailyEntry(params: {
  page: Page;
  projectId: string;
  workDate: string;
  morning: boolean;
  afternoon: boolean;
  notes: string;
  expectQuickActions?: boolean;
  workerName?: string;
}): Promise<void> {
  const {
    page,
    projectId,
    workDate,
    morning,
    afternoon,
    notes,
    expectQuickActions = false,
    workerName = WORKER_NAME,
  } = params;
  const dialog = await openAddDailyDialog(page);
  await waitForProjectOption(dialog, projectId);
  await dialog.locator("select").first().selectOption(projectId);
  await dialog.locator('input[type="date"]').fill(workDate);
  const row = await workerRowInDailyDialog(page, dialog, workerName);
  if (morning) await row.getByRole("button", { name: /^AM$/ }).click();
  if (afternoon) await row.getByRole("button", { name: /^PM$/ }).click();
  await dialog.getByPlaceholder("Optional").last().fill(notes);

  const saved = page.waitForResponse(
    (res) => res.url().includes("/api/labor/entries") && res.request().method() === "POST",
    { timeout: 60_000 }
  );
  await dialog.getByRole("button", { name: /^Save$/i }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  if (expectQuickActions) {
    const nextActions = page.getByTestId("daily-entry-next-actions");
    await expect(nextActions).toBeVisible({ timeout: 30_000 });
    await expect(nextActions).toContainText("Entry saved");
    await expect(nextActions.getByRole("button", { name: /^Add Another$/i })).toBeVisible();
    await expect(nextActions.getByRole("link", { name: /^Open Worker$/i })).toHaveAttribute(
      "href",
      `/workers/${workerId}`
    );
    await expect(nextActions.getByRole("link", { name: /^Pay Worker$/i })).toHaveAttribute(
      "href",
      `/labor/workers/${workerId}/balance?returnTo=%2Fworkers%2F${workerId}%3Ftab%3Dpayments`
    );
  }
}

async function seedWorkerCenterSortRows(page: Page): Promise<void> {
  owedWorkerId = await createWorkerViaWorkerCenter(page, OWED_WORKER_NAME);
  settledWorkerId = await createWorkerViaWorkerCenter(page, SETTLED_WORKER_NAME);

  await saveDailyEntry({
    page,
    projectId: PROJECT_A_ID,
    workDate: DATES.fullDate,
    morning: true,
    afternoon: true,
    notes: `${PREFIX} owed worker sort seed`,
    workerName: OWED_WORKER_NAME,
  });

  const body = await balanceJsonForWorker(page, owedWorkerId);
  expectMoney(body.summary.balance, FULL_DAY_AMOUNT);
}

async function visibleWorkerNames(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="worker-center-row"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-worker-name") ?? "")
        .filter((name) => name.length > 0)
    );
}

async function verifyWorkerCenterSearchAndSort(page: Page): Promise<void> {
  await goto(page, "/workers");
  await expect(page.getByRole("heading", { name: /^Worker Center$/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(async () => visibleWorkerNames(page), { timeout: 60_000 })
    .toContain(OWED_WORKER_NAME);

  const names = await visibleWorkerNames(page);
  expect(names.indexOf(OWED_WORKER_NAME)).toBeGreaterThanOrEqual(0);
  expect(names.indexOf(SETTLED_WORKER_NAME)).toBeGreaterThanOrEqual(0);
  expect(names.indexOf(OWED_WORKER_NAME)).toBeLessThan(names.indexOf(SETTLED_WORKER_NAME));

  await page.getByRole("textbox", { name: /^Search workers$/i }).fill("Owed Worker");
  await expect(
    page.getByTestId("worker-center-row").filter({ hasText: OWED_WORKER_NAME })
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByTestId("worker-center-row").filter({ hasText: SETTLED_WORKER_NAME })
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: /^Search workers$/i }).fill("");
}

async function expectDuplicateSessionUiBlocked(page: Page, projectId: string, workDate: string) {
  const dialog = await openAddDailyDialog(page);
  await waitForProjectOption(dialog, projectId);
  await dialog.locator("select").first().selectOption(projectId);
  await dialog.locator('input[type="date"]').fill(workDate);
  const row = await workerRowInDailyDialog(page, dialog);
  await expect(row).toContainText(/Already has full day|AM already entered/i);
  await expect(row.getByRole("button", { name: /^AM$/ })).toBeDisabled();
  await dialog.getByRole("button", { name: /^Cancel$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

async function expectMorningBlockedAfternoonAllowed(
  page: Page,
  projectId: string,
  workDate: string
) {
  const dialog = await openAddDailyDialog(page);
  await waitForProjectOption(dialog, projectId);
  await dialog.locator("select").first().selectOption(projectId);
  await dialog.locator('input[type="date"]').fill(workDate);
  const row = await workerRowInDailyDialog(page, dialog);
  await expect(row).toContainText("AM already entered");
  await expect(row.getByRole("button", { name: /^AM$/ })).toBeDisabled();
  await expect(row.getByRole("button", { name: /^PM$/ })).toBeEnabled();
  await row.getByRole("button", { name: /^PM$/ }).click();
  await dialog.getByPlaceholder("Optional").last().fill(`${PREFIX} afternoon different project`);

  const saved = page.waitForResponse(
    (res) => res.url().includes("/api/labor/entries") && res.request().method() === "POST",
    { timeout: 60_000 }
  );
  await dialog.getByRole("button", { name: /^Save$/i }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
}

async function balanceJson(page: Page): Promise<BalanceResponse> {
  return balanceJsonForWorker(page, workerId);
}

async function balanceJsonForWorker(page: Page, targetWorkerId: string): Promise<BalanceResponse> {
  const response = await page.request.get(
    `/api/labor/workers/${encodeURIComponent(targetWorkerId)}/balance?t=${Date.now()}`
  );
  expect(response.ok(), `GET balance failed: ${response.status()} ${await response.text()}`).toBe(
    true
  );
  return (await response.json()) as BalanceResponse;
}

function expectMoney(actual: number, expected: number): void {
  expect(Math.round(Number(actual) * 100)).toBe(Math.round(expected * 100));
}

async function expectBalanceSummary(
  page: Page,
  expected: { laborOwed: number; payments: number; balance: number }
): Promise<BalanceResponse> {
  const body = await balanceJson(page);
  expectMoney(body.summary.laborOwed, expected.laborOwed);
  expectMoney(body.summary.payments, expected.payments);
  expectMoney(body.summary.balance, expected.balance);
  return body;
}

async function openBalancePage(page: Page): Promise<void> {
  await goto(page, `/labor/workers/${encodeURIComponent(workerId)}/balance`);
  await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: /^Pay Worker$/i })).toBeVisible({
    timeout: 30_000,
  });
}

function totalPaymentAmount(dialog: Locator): Locator {
  return dialog
    .getByText("Total Payment Amount", { exact: true })
    .locator("xpath=following-sibling::dd[1]");
}

async function closeReceiptPreviewIfOpen(page: Page): Promise<void> {
  const receipt = page.getByRole("dialog", { name: /Receipt preview/i });
  if (await receipt.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await expect(receipt.getByText("Loading receipt…")).not.toBeVisible({ timeout: 30_000 });
    const close = receipt.getByRole("button", { name: /^Close$/i });
    if (await close.isVisible().catch(() => false)) await close.click();
    else await page.keyboard.press("Escape");
    await expect(receipt).not.toBeVisible({ timeout: 30_000 });
  }
}

async function choosePayDate(page: Page, dialog: Locator, ymd: string): Promise<void> {
  const trigger = dialog.getByRole("button", { name: "Choose date" });
  await trigger.click();

  const calendar = page.locator(".rdp-root").last();
  await expect(calendar).toBeVisible({ timeout: 10_000 });
  const targetCaption = monthCaptionLabel(ymd);
  for (let i = 0; i < 18; i += 1) {
    if (
      await calendar
        .getByText(targetCaption, { exact: true })
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }
    await calendar.getByRole("button", { name: "Go to the Previous Month" }).click();
  }
  await expect(calendar.getByText(targetCaption, { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const { day } = ymdParts(ymd);
  await calendar
    .locator("button")
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first()
    .click();
  await expect(trigger).toContainText(financeDateLabel(ymd));
}

async function payOnlyProjectAHalfDay(page: Page): Promise<void> {
  await openBalancePage(page);
  await page.getByRole("button", { name: /^Pay Worker$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^Pay Worker$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(totalPaymentAmount(dialog)).toHaveText("$800.00");

  await dialog.locator("label").filter({ hasText: "$400.00" }).locator("input").uncheck();
  await dialog
    .locator("label")
    .filter({ hasText: PROJECT_B_NAME })
    .filter({ hasText: "$200.00" })
    .locator("input")
    .uncheck();
  await expect(totalPaymentAmount(dialog)).toHaveText("$200.00");
  await choosePayDate(page, dialog, DATES.splitDate);
  await dialog.getByPlaceholder("Optional notes").fill(PARTIAL_PAYMENT_NOTE);

  const paid = page.waitForResponse(
    (res) =>
      res.url().includes(`/api/labor/workers/${workerId}/pay`) && res.request().method() === "POST",
    { timeout: 65_000 }
  );
  await dialog.getByRole("button", { name: /^Confirm Payment$/i }).click();
  const response = await paid;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  await closeReceiptPreviewIfOpen(page);
  await expect(page.getByTestId("worker-payment-next-actions")).toBeVisible({ timeout: 30_000 });
  const nextActions = page.getByTestId("worker-payment-next-actions");
  await expect(nextActions.getByRole("link", { name: /^View Statement$/i })).toBeVisible();
  await expect(nextActions.getByRole("link", { name: /^Print Statement$/i })).toBeVisible();
  await expect(nextActions.getByRole("link", { name: /^Back to Worker$/i })).toBeVisible();
}

async function expectOverpayRejectedByApi(page: Page, remainingLaborIds: string[]): Promise<void> {
  const response = await page.request.post(
    `/api/labor/workers/${encodeURIComponent(workerId)}/pay`,
    {
      data: {
        amount: 601,
        payment_method: "Cash",
        payment_date: DATES.splitDate,
        notes: `${PREFIX} rejected overpay ${RUN_ID}`,
        labor_entry_ids: remainingLaborIds,
        reimbursement_ids: [],
      },
    }
  );
  expect(response.status()).toBe(400);
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  expect(body.message ?? "").toMatch(/must match selected items/i);
}

async function expectOverpayRejectedByUi(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Pay Worker$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^Pay Worker$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(totalPaymentAmount(dialog)).toHaveText("$600.00");

  await dialog.getByRole("button", { name: /Edit payment split 1/i }).click();
  const edit = page.getByRole("dialog", { name: /^Edit payment$/i });
  await expect(edit).toBeVisible({ timeout: 10_000 });
  await edit.locator('input[type="number"]').fill("601");
  await edit.getByRole("button", { name: /^Save$/i }).click();
  await expect(edit).toContainText("Split total can’t exceed Total Payment Amount.");
  await edit.getByRole("button", { name: /^Cancel$/i }).click();
  await expect(edit).not.toBeVisible({ timeout: 10_000 });
  await expect(totalPaymentAmount(dialog)).toHaveText("$600.00");
}

async function payRemainingBalance(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /^Pay Worker$/i });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await choosePayDate(page, dialog, DATES.splitDate);
  await dialog.getByPlaceholder("Optional notes").fill(FULL_PAYMENT_NOTE);

  const paid = page.waitForResponse(
    (res) =>
      res.url().includes(`/api/labor/workers/${workerId}/pay`) && res.request().method() === "POST",
    { timeout: 65_000 }
  );
  await dialog.getByRole("button", { name: /^Confirm Payment$/i }).click();
  const response = await paid;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  await closeReceiptPreviewIfOpen(page);
}

async function verifyWorkerCenterDetail(page: Page): Promise<void> {
  await goto(page, `/workers/${encodeURIComponent(workerId)}?tab=work`);
  await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("tab", { name: /^Work$/i }).click();
  const work = page.getByTestId("worker-work-month-groups");
  await expect(work).toBeVisible({ timeout: 30_000 });
  await expect(work).toContainText(PROJECT_A_NAME);
  await expect(work).toContainText(PROJECT_B_NAME);
  await expect(work).toContainText("$400.00");
  await expect(work).toContainText("$200.00");

  await page.getByRole("tab", { name: /^Statements$/i }).click();
  await expect(page.getByText(/Worker statement|Statements/i).first()).toBeVisible({
    timeout: 10_000,
  });
}

async function verifyPaymentHistoryOnBalancePage(page: Page): Promise<void> {
  await openBalancePage(page);
  const partialRow = page.locator("tbody tr").filter({ hasText: PARTIAL_PAYMENT_NOTE }).first();
  const fullRow = page.locator("tbody tr").filter({ hasText: FULL_PAYMENT_NOTE }).first();
  await expect(partialRow).toBeVisible({ timeout: 30_000 });
  await expect(partialRow).toContainText("$200.00");
  await expect(fullRow).toBeVisible({ timeout: 30_000 });
  await expect(fullRow).toContainText("$600.00");
}

async function verifyStatement(page: Page): Promise<void> {
  await goto(
    page,
    `/worker/${encodeURIComponent(workerId)}/monthly-report?month=${encodeURIComponent(
      DATES.monthYm
    )}`
  );
  await expect(page.getByRole("heading", { name: /^Monthly report$/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });

  await expect(page.getByText(PROJECT_A_NAME).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(PROJECT_B_NAME).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Labor").first()).toBeVisible();
  await expect(page.getByText("Payment").first()).toBeVisible();
  await expect(page.getByText("$800.00").first()).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const printRoot = page.locator(".payroll-statement-print-root");
  await expect(printRoot).toBeVisible({ timeout: 15_000 });
  const box = await printRoot.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
  expect(box?.height ?? 0).toBeGreaterThan(300);
  await expect(printRoot.getByRole("heading", { name: "Payroll Statement" })).toBeVisible();
  await expect(printRoot).toContainText(WORKER_NAME);
  await expect(printRoot).toContainText("Labor");
  await expect(printRoot).toContainText("Payment");
  await expect(printRoot).toContainText(`$${TOTAL_EARNED.toFixed(2)}`);
  await expect(printRoot).toContainText("$0.00");
  await expect(printRoot).not.toContainText("$-0.00");
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Daily Labor Entry → Worker Center → Pay Worker → Statement", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test.beforeAll(async () => {
    admin = envClient();
    await cleanupLocalRows(admin);
    await seedProjects(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanupLocalRows(admin);
  });

  test("runs the local UI labor/payment/statement chain with same-day session guards", async ({
    page,
  }, testInfo: TestInfo) => {
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      "Worker payment mutations are only allowed for local/payment-safe E2E targets."
    );

    workerId = await createWorkerViaWorkerCenter(page);
    await seedWorkerCenterSortRows(page);

    await saveDailyEntry({
      page,
      projectId: PROJECT_A_ID,
      workDate: DATES.fullDate,
      morning: true,
      afternoon: true,
      notes: `${PREFIX} full day`,
      expectQuickActions: true,
    });
    await expectDuplicateSessionUiBlocked(page, PROJECT_B_ID, DATES.fullDate);

    const duplicateFullDay = await page.request.post("/api/labor/entries", {
      data: {
        projectId: PROJECT_B_ID,
        workDate: DATES.fullDate,
        rows: [{ workerId, morning: true, afternoon: true }],
      },
    });
    expect(duplicateFullDay.status()).toBe(409);
    expect(((await duplicateFullDay.json()) as { message?: string }).message ?? "").toMatch(
      /already has.*date\/session|already has.*entry/i
    );

    await saveDailyEntry({
      page,
      projectId: PROJECT_A_ID,
      workDate: DATES.splitDate,
      morning: true,
      afternoon: false,
      notes: `${PREFIX} morning project A`,
    });
    await expectMorningBlockedAfternoonAllowed(page, PROJECT_B_ID, DATES.splitDate);

    let body = await expectBalanceSummary(page, {
      laborOwed: TOTAL_EARNED,
      payments: 0,
      balance: TOTAL_EARNED,
    });
    expect(body.laborEntries).toHaveLength(3);
    expect(body.laborEntries.filter((entry) => entry.session === "Full day")).toHaveLength(1);
    expect(body.laborEntries.filter((entry) => entry.session === "Morning")).toHaveLength(1);
    expect(body.laborEntries.filter((entry) => entry.session === "Afternoon")).toHaveLength(1);
    expectMoney(
      body.laborEntries.reduce((sum, entry) => sum + entry.amount, 0),
      TOTAL_EARNED
    );

    await verifyWorkerCenterDetail(page);
    await verifyWorkerCenterSearchAndSort(page);

    await payOnlyProjectAHalfDay(page);
    body = await expectBalanceSummary(page, {
      laborOwed: FULL_DAY_AMOUNT + HALF_DAY_AMOUNT,
      payments: HALF_DAY_AMOUNT,
      balance: FULL_DAY_AMOUNT + HALF_DAY_AMOUNT,
    });
    expect(body.laborEntries.filter((entry) => entry.payrollSettled)).toHaveLength(1);

    const remainingLaborIds = body.laborEntries
      .filter((entry) => !entry.payrollSettled)
      .map((entry) => entry.id);
    expect(remainingLaborIds).toHaveLength(2);
    await expectOverpayRejectedByApi(page, remainingLaborIds);
    await openBalancePage(page);
    await expectOverpayRejectedByUi(page);
    await payRemainingBalance(page);

    body = await expectBalanceSummary(page, {
      laborOwed: 0,
      payments: TOTAL_EARNED,
      balance: 0,
    });
    expect(body.laborEntries.every((entry) => entry.payrollSettled)).toBe(true);
    expect(body.payments).toHaveLength(2);

    await verifyPaymentHistoryOnBalancePage(page);
    await verifyStatement(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await goto(page, `/labor/workers/${encodeURIComponent(workerId)}/balance`);
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
  });
});
