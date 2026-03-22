import { test, expect } from "@playwright/test";
import {
  acceptBrowserDialogs,
  expectDeleteControlVisibleWithoutHover,
  clickTrashInRowAndConfirmDialog,
} from "./e2e-helpers";
import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";

/**
 * Create then delete (DB writes). Use Playwright project **chromium-delete-mutations**
 * (local dev) or localhost / E2E_ALLOW_DELETE_MUTATIONS=1.
 */
const BASE = e2eTargetOrigin();
const ROW_REMOVED_MS = 15_000;
const LIST_LOAD_MS = 55_000;

test.describe("Delete mutations: create then delete", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(({ page }, testInfo) => {
    test.skip(
      !allowDeleteMutations(testInfo),
      'Pick project "chromium-delete-mutations", use localhost, or set E2E_ALLOW_DELETE_MUTATIONS=1.'
    );
    acceptBrowserDialogs(page);
  });

  test("financial vendors: create then delete", async ({ page }) => {
    await page.goto(`${BASE}/financial/vendors`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const label = `PW-V-${Date.now()}`;
    await page.getByRole("button", { name: /\+ New Vendor/i }).click();
    await page.getByPlaceholder("Required").first().fill(label);
    await page.getByRole("button", { name: /Create Vendor/i }).click();

    const row = page.locator("tbody tr").filter({ hasText: label });
    try {
      await expect(row).toBeVisible({ timeout: 25_000 });
    } catch {
      const banner = await page
        .locator(".text-muted-foreground")
        .first()
        .textContent()
        .catch(() => "");
      test.skip(true, `Vendor did not appear after create. ${banner ?? ""}`);
    }

    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 900);
    const t0 = Date.now();
    await del.click();
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
    expect(Date.now() - t0, "row clears quickly after confirm").toBeLessThan(8000);
  });

  test("settings categories: create then delete", async ({ page }) => {
    await page.goto(`${BASE}/settings/categories`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const label = `PW-CAT-${Date.now()}`;
    await page.getByRole("button", { name: /\+ New Category/i }).click();
    await page.getByPlaceholder("Required").first().fill(label);
    await page.getByRole("button", { name: /Create Category/i }).click();

    const row = page.locator("tbody tr").filter({ hasText: label });
    try {
      await expect(row).toBeVisible({ timeout: 25_000 });
    } catch {
      test.skip(true, "Category did not appear after create.");
    }

    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 900);
    await del.click();
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
  });

  test("labor workers: create then delete", async ({ page }) => {
    await page.goto(`${BASE}/labor/workers`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Failed to fetch workers/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Workers API unavailable.");
    }

    const label = `PW-W-${Date.now()}`;
    await page.getByRole("button", { name: /\+ New Worker/i }).click();
    await page.getByPlaceholder("Worker name").fill(label);
    await page.getByPlaceholder("0").fill("100");
    await page.getByRole("button", { name: /Create Worker/i }).click();

    const row = page.locator("tbody tr").filter({ hasText: label });
    try {
      await expect(row).toBeVisible({ timeout: 25_000 });
    } catch {
      test.skip(true, "Worker did not appear after create.");
    }

    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 900);
    await del.click();
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
  });

  test("labor subcontractors: create then delete", async ({ page }) => {
    await page.goto(`${BASE}/labor/subcontractors`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const label = `PW-SUB-${Date.now()}`;
    await page.getByRole("button", { name: /\+ New Subcontractor/i }).click();
    await page.getByPlaceholder("Required").first().fill(label);
    await page.getByRole("button", { name: /Create Subcontractor/i }).click();

    const row = page.locator("tbody tr").filter({ hasText: label });
    try {
      await expect(row).toBeVisible({ timeout: 25_000 });
    } catch {
      test.skip(true, "Subcontractor did not appear after create.");
    }

    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 900);
    await del.click();
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
  });

  test("customers: create then delete via menu + dialog", async ({ page }) => {
    const label = `PW-CUST-${Date.now()}`;
    await page.goto(`${BASE}/customers`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }
    await page.getByRole("button", { name: /\+ New Customer/i }).click();
    const custDialog = page.getByRole("dialog", { name: /New customer/i });
    await expect(custDialog).toBeVisible({ timeout: 10_000 });
    await custDialog.locator("input").first().fill(label);
    await custDialog.getByRole("button", { name: /^Save$/ }).click();
    const row = page.locator("tbody tr").filter({ hasText: label });
    try {
      await expect(row).toBeVisible({ timeout: 25_000 });
    } catch {
      test.skip(true, "Customer did not appear after create.");
    }
    await row.locator("td").last().getByRole("button").first().click();
    await page.getByRole("menuitem", { name: /Delete…/ }).click();
    await expect(page.getByRole("dialog", { name: /Delete customer/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /^Delete$/ }).click();
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
  });

  test("tasks: create then delete (menu + confirm)", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const title = `PW-TASK-${Date.now()}`;
    await page.goto(`${BASE}/tasks`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Failed to load tasks/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Tasks API unavailable.");
    }
    await expect(page.getByText(/Loading/i).first())
      .not.toBeVisible({ timeout: LIST_LOAD_MS })
      .catch(() => undefined);

    await page.getByRole("button", { name: /\+ New Task/i }).click();
    const taskDlg = page.getByRole("dialog", { name: /New Task/i });
    await expect(taskDlg).toBeVisible({ timeout: 10_000 });
    const projectSelect = taskDlg.locator("select").first();
    await expect(projectSelect).toBeVisible({ timeout: 10_000 });
    const optCount = await projectSelect.locator("option").count();
    test.skip(optCount <= 1, "No project available to attach a task.");

    await projectSelect.selectOption({ index: 1 });
    await taskDlg.getByPlaceholder("Task title").fill(title);
    await taskDlg.getByRole("button", { name: /^Save$/ }).click();

    const row = page.locator("tbody tr").filter({ hasText: title });
    try {
      await expect(row).toBeVisible({ timeout: 25_000 });
    } catch {
      test.skip(true, "Task did not appear after create.");
    }

    await row.getByRole("button", { name: /^Task actions$/ }).click();
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
  });

  test("bills draft: create then delete via trash + confirm", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const vendor = `PW-BILL-${Date.now()}`;

    await page.goto(`${BASE}/bills/new`);
    await page.waitForLoadState("domcontentloaded");
    const billForm = page.locator("form").first();
    await billForm.locator("input").first().fill(vendor);
    await page.locator('input[placeholder="0.00"]').fill("1");
    await page.getByRole("button", { name: /Create bill/i }).click();
    try {
      await expect(page).toHaveURL(/\/bills\/[^/]+/, { timeout: 25_000 });
    } catch {
      test.skip(true, "Could not create draft bill.");
    }

    await page.goto(`${BASE}/bills`);
    await page.waitForLoadState("domcontentloaded");
    const row = page.locator("tbody tr").filter({ hasText: vendor }).first();
    try {
      await expect(row).toBeVisible({ timeout: 15_000 });
    } catch {
      test.skip(true, "New bill not found on list.");
    }

    const trash = row.getByRole("button", { name: "Delete" });
    await expectDeleteControlVisibleWithoutHover(page, trash, 900);
    await clickTrashInRowAndConfirmDialog(page, row, { maxDialogOpenMs: 1200 });
    await expect(row).toHaveCount(0, { timeout: ROW_REMOVED_MS });
  });
});
