import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { allowWorkerPaymentMutations } from "./e2e-env-helpers";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RUN = Date.now();
const workerName = `[E2E] Labor Full ${RUN}`;
const vendorName = `[E2E] Vendor ${RUN}`;
const paymentNote = `[E2E] partial labor payment ${RUN}`;
const invoiceUrl = `https://example.test/e2e-invoice-${RUN}.pdf`;
const receiptUrl = `https://example.test/e2e-receipt-${RUN}.png`;

let workerId = "";

test.describe.configure({ mode: "serial", timeout: 240_000 });

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForStablePage(page);
  await expectNoVisibleAppError(page);
}

async function waitForStablePage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("[data-app-scroll-root]")).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .locator("body")
      .getByText(/^Loading/)
      .first()
  )
    .not.toBeVisible({ timeout: 60_000 })
    .catch(() => undefined);
}

async function expectNoVisibleAppError(page: Page) {
  await expect(page.getByRole("heading", { name: /^(404|500|Not found)$/i })).not.toBeVisible();
  await expect(
    page
      .locator("body")
      .getByText(
        /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Something went wrong|Supabase is not configured|already settled|duplicate payment|negative balance/i
      )
      .first()
  ).not.toBeVisible();
}

async function pageIncludesText(page: Page, text: string, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const body = await page
      .locator("body")
      .textContent()
      .catch(() => "");
    if (body?.includes(text)) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function skipUnlessLocalMutationTarget(testInfo: TestInfo) {
  test.skip(
    !allowWorkerPaymentMutations(testInfo),
    "Labor full integration creates local E2E labor/payment rows only on mutation-safe targets."
  );
}

async function waitForSelectOptions(select: Locator, min = 2) {
  await expect
    .poll(async () => select.locator("option").count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(min);
}

async function selectByLabelOrFirst(select: Locator, label: string) {
  await waitForSelectOptions(select);
  await select.selectOption({ label }).catch(async () => {
    await select.selectOption({ index: 1 });
  });
}

async function selectWorker(select: Locator) {
  await expect(select.locator("option").filter({ hasText: workerName })).toHaveCount(1, {
    timeout: 30_000,
  });
  await select.selectOption({ label: workerName });
}

async function visibleRowByText(page: Page, text: string) {
  return page.locator("tbody tr, [role=row], .md\\:hidden > div").filter({ hasText: text }).first();
}

async function findDailyWorkerRow(page: Page, dialog: Locator, name: string) {
  const row = dialog.locator('[role="row"]').filter({ hasText: name }).first();
  const scroller = dialog.locator("div.overflow-auto").first();
  for (let i = 0; i < 24; i += 1) {
    if (await row.isVisible().catch(() => false)) return row;
    await scroller.evaluate((el) => {
      el.scrollTop += Math.max(el.clientHeight, 120);
    });
    await page.waitForTimeout(50);
  }
  await expect(row).toBeVisible({ timeout: 5_000 });
  return row;
}

async function createWorker(page: Page) {
  await goto(page, "/labor/workers/new");
  await expect(page.getByRole("heading", { name: /^New Worker$/i })).toBeVisible();

  const form = page.locator("section").filter({ hasText: "Name" }).first();
  await form.locator("input").nth(0).fill(workerName);
  await form.locator("input").nth(1).fill("555-0100");
  await form.locator("input").nth(2).fill("E2E Labor");
  await form.locator('input[type="number"]').fill("200");
  await form.locator("textarea").fill(`Created by labor-full-integration ${RUN}`);
  await page.getByRole("button", { name: /^Create Worker$/i }).click();
  await page.waitForURL(
    (url) => /\/workers\/[^/?#]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 30_000 }
  );
  workerId = new URL(page.url()).pathname.split("/").filter(Boolean).pop() ?? "";
  expect(workerId).toBeTruthy();
}

async function createLaborEntry(page: Page) {
  await goto(page, "/labor");
  await page
    .getByRole("button", { name: /^Add Entry$/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog", { name: /^Add Daily Entry$/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  const selects = dialog.locator("select");
  await selectByLabelOrFirst(selects.nth(0), E2E_PRESERVED_PROJECT_LABEL);
  await dialog.locator('input[type="date"]').fill(todayLocalISO());

  const workerRow = await findDailyWorkerRow(page, dialog, workerName);
  await workerRow.getByRole("button", { name: /^AM$/ }).click();
  await workerRow.getByRole("button", { name: /^PM$/ }).click();
  await dialog.locator("input").last().fill(`labor entry ${RUN}`);
  await dialog.getByRole("button", { name: /^Save$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });

  const row = await visibleRowByText(page, workerName);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("$200.00");
}

async function createReimbursement(page: Page) {
  await goto(page, "/labor/reimbursements");
  await page.getByRole("button", { name: /^\+ New Reimbursement$/i }).click();

  const form = page.locator("form").filter({ hasText: "Worker" }).first();
  await expect(form).toBeVisible({ timeout: 20_000 });
  await selectWorker(form.locator("select").nth(0));
  await selectByLabelOrFirst(form.locator("select").nth(1), E2E_PRESERVED_PROJECT_LABEL);
  await form.locator('input[type="date"]').fill(todayLocalISO());
  await form.getByPlaceholder("Vendor").fill(vendorName);
  await form.locator('input[type="number"]').fill("30");
  await form.getByPlaceholder("Link").fill(receiptUrl);
  await form.getByPlaceholder("Description").fill(`receipt ${RUN}`);

  const created = page.waitForResponse(
    (r) => r.url().includes("/api/worker-reimbursements") && r.request().method() === "POST"
  );
  await form.getByRole("button", { name: /^Save$/i }).click();
  await expect((await created).ok()).toBeTruthy();
  await expect(form).not.toBeVisible({ timeout: 20_000 });
  const row = page
    .locator("tbody tr")
    .filter({ hasText: vendorName })
    .filter({ hasText: workerName })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("$30.00");
}

async function createDeductedAdvance(page: Page) {
  await goto(page, "/labor/advances");
  await page.getByRole("button", { name: /^Create Advance$/i }).click();

  const dialog = page.getByRole("dialog", { name: /^Create Advance$/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await selectWorker(dialog.locator("select").nth(0));
  await selectByLabelOrFirst(dialog.locator("select").nth(1), E2E_PRESERVED_PROJECT_LABEL);
  await dialog.locator('input[type="number"]').fill("25");
  await dialog.locator('input[type="date"]').fill(todayLocalISO());
  await dialog.getByPlaceholder("Optional").fill(`advance ${RUN}`);

  const created = page.waitForResponse(
    (r) => r.url().includes("/api/labor/advances") && r.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: /^Save$/i }).click();
  await expect((await created).ok()).toBeTruthy();
  await expect(dialog).not.toBeVisible({ timeout: 20_000 });

  const row = page
    .locator("tbody tr")
    .filter({ hasText: workerName })
    .filter({ hasText: "$25.00" })
    .first();
  await expect(row).toContainText("$25.00", { timeout: 30_000 });
  await row.getByRole("button").last().click();

  const deducted = page.waitForResponse(
    (r) => r.url().includes("/api/labor/advances/") && r.request().method() === "PATCH"
  );
  await page.getByRole("menuitem", { name: /^Mark as deducted$/i }).click();
  await expect((await deducted).ok()).toBeTruthy();
  await expect(row).toContainText("Deducted", { timeout: 30_000 });
}

async function openWorkerBalanceFromList(page: Page) {
  await goto(page, "/labor/worker-balances");
  const search = page.getByRole("textbox", { name: /Search workers/i }).first();
  if (await search.isVisible().catch(() => false)) await search.fill(workerName);
  const link = page.getByRole("link", { name: new RegExp(`^${escapeRegex(workerName)}$`) }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await page.waitForURL(/\/labor\/workers\/[^/?#]+\/balance(?:[?#].*)?$/, { timeout: 30_000 });
  await waitForStablePage(page);
  workerId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2) ?? workerId;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectDetailBalance(page: Page, amountText: string) {
  await expect(page.getByRole("heading", { name: workerName })).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .getByText(/^Balance$/)
      .locator("..")
      .filter({ hasText: amountText })
      .first()
  )
    .toBeVisible({ timeout: 30_000 })
    .catch(async () => {
      await expect(page.locator("body")).toContainText(amountText, { timeout: 30_000 });
    });
  await expectNoVisibleAppError(page);
}

function itemLabel(dialog: Locator, amountText: string) {
  return dialog.locator("label").filter({ hasText: amountText });
}

async function payLaborOnly(page: Page) {
  await page.getByRole("button", { name: /^Pay Worker$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^Pay Worker$/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  await expect(itemLabel(dialog, "$200.00")).toBeVisible();
  await expect(itemLabel(dialog, "$30.00")).toBeVisible();
  await itemLabel(dialog, "$30.00").locator('input[type="checkbox"]').uncheck();
  await expect(dialog.locator("p").filter({ hasText: "Total Payment Amount" })).toContainText(
    "$200.00"
  );
  await dialog.getByPlaceholder("Optional notes").fill(paymentNote);

  const paid = page.waitForResponse(
    (r) => r.url().includes(`/api/labor/workers/${workerId}/pay`) && r.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: /^Confirm Payment$/i }).click();
  await expect((await paid).ok()).toBeTruthy();
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });

  const receiptDialog = page
    .getByRole("dialog")
    .filter({ hasText: /Receipt|Payment/i })
    .first();
  if (await receiptDialog.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(receiptDialog)
      .not.toBeVisible({ timeout: 10_000 })
      .catch(() => undefined);
  }
}

async function verifyOnlyReimbursementSelectable(page: Page) {
  await page.getByRole("button", { name: /^Pay Worker$/i }).click();
  const dialog = page.getByRole("dialog", { name: /^Pay Worker$/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(itemLabel(dialog, "$200.00")).toHaveCount(0);
  await expect(itemLabel(dialog, "$30.00")).toBeVisible();
  await expect(dialog.locator("p").filter({ hasText: "Total Payment Amount" })).toContainText(
    "$30.00"
  );
  await dialog.getByRole("button", { name: /^Cancel$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

async function verifyPaymentsLedger(page: Page) {
  await goto(page, "/labor/payments");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: workerName })
    .filter({ hasText: paymentNote });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row.first()).toContainText("$200.00");
}

async function createWorkerInvoice(page: Page): Promise<boolean> {
  await goto(page, "/labor/worker-invoices");
  if (await pageIncludesText(page, "worker_invoices", 8_000)) return false;
  await page.getByRole("button", { name: /^New Invoice$/i }).click();

  const form = page.locator("form").filter({ hasText: "Worker" }).first();
  await expect(form).toBeVisible({ timeout: 20_000 });
  await selectWorker(form.locator("select").nth(0));
  await selectByLabelOrFirst(form.locator("select").nth(1), E2E_PRESERVED_PROJECT_LABEL);
  await form.locator('input[type="number"]').fill("40");
  await form.getByPlaceholder("Link to invoice file").fill(invoiceUrl);
  await form.getByRole("button", { name: /^Save$/i }).click();
  if (await pageIncludesText(page, "worker_invoices", 5_000)) return false;
  const row = page
    .locator("tbody tr")
    .filter({ hasText: workerName })
    .filter({ hasText: "$40.00" })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return true;
}

async function verifyPayrollSummary(page: Page, invoiceSupported: boolean) {
  await goto(page, "/labor/payroll");
  const search = page.getByPlaceholder(/Search worker/i).first();
  if (await search.isVisible().catch(() => false)) await search.fill(workerName);
  const row = page.locator("tbody tr").filter({ hasText: workerName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(invoiceSupported ? "$240.00" : "$200.00");
  await expect(row).toContainText("$30.00");
  await expect(row).toContainText("$225.00");
  await expect(row).toContainText(invoiceSupported ? "$45.00" : "$5.00");
}

async function expectMobileScrollWorks(page: Page) {
  const root = page.locator("[data-app-scroll-root]");
  await expect
    .poll(
      () =>
        root.evaluate(
          (el) =>
            el.scrollHeight > el.clientHeight + 8 ||
            document.documentElement.scrollHeight > window.innerHeight + 8
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
  await root.evaluate((el) => {
    el.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => root.evaluate((el) => el.scrollTop > 0 || window.scrollY > 0), {
      timeout: 5_000,
    })
    .toBe(true);
  await page.mouse.wheel(0, -700);
  await page.waitForTimeout(100);
  await expectNoVisibleAppError(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          bodyOverflow: getComputedStyle(document.body).overflow,
          bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
          overlayCount: document.querySelectorAll("[data-radix-portal] [data-state='open']").length,
        })),
      { timeout: 10_000 }
    )
    .toMatchObject({ bodyPointerEvents: "auto", overlayCount: 0 });
}

test("real desktop Labor flow covers entries, balances, payments, advances, invoices, and payroll", async ({
  page,
}, testInfo) => {
  await skipUnlessLocalMutationTarget(testInfo);

  await createWorker(page);
  await createLaborEntry(page);
  await createReimbursement(page);
  await openWorkerBalanceFromList(page);
  await expectDetailBalance(page, "$230.00");

  await createDeductedAdvance(page);
  await goto(page, `/labor/workers/${workerId}/balance`);
  await expectDetailBalance(page, "$205.00");

  await payLaborOnly(page);
  await expectDetailBalance(page, "$5.00");
  await verifyOnlyReimbursementSelectable(page);
  await verifyPaymentsLedger(page);
  const invoiceSupported = await createWorkerInvoice(page);
  await verifyPayrollSummary(page, invoiceSupported);

  await goto(page, `/labor/workers/${workerId}/balance`);
  await page.reload();
  await waitForStablePage(page);
  await expectDetailBalance(page, "$5.00");
  await verifyOnlyReimbursementSelectable(page);
});

test("mobile Labor balance and pay modal remain usable after the full flow", async ({
  page,
}, testInfo) => {
  await skipUnlessLocalMutationTarget(testInfo);
  test.skip(!workerId, "Desktop flow did not create the worker fixture.");

  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, "/labor/worker-balances");
  const search = page.getByRole("textbox", { name: /Search workers/i }).first();
  if (await search.isVisible().catch(() => false)) await search.fill(workerName);
  await expect(page.getByText(workerName).first()).toBeVisible({ timeout: 30_000 });

  await goto(page, `/labor/workers/${workerId}/balance`);
  await expectDetailBalance(page, "$5.00");
  await verifyOnlyReimbursementSelectable(page);

  await goto(page, "/labor/payroll");
  await expect(page.getByRole("heading", { name: /^Payroll Summary$/i })).toBeVisible();
  await expectMobileScrollWorks(page);
});
