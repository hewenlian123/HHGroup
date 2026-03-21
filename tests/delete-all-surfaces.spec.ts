import { test, expect } from "@playwright/test";
import {
  expectDeleteControlVisibleWithoutHover,
  clickFirstRowOverflowMenu,
  expectDeleteMenuItemThenClose,
} from "./e2e-helpers";

/**
 * Read-only: each major list surface exposes a **Delete** entry (button, trash, or overflow menu).
 * Does not remove production rows except where the flow only opens a menu/dialog then dismisses.
 *
 * Full create→delete flows: `E2E_ALLOW_DELETE_MUTATIONS=1 npm run test:e2e:delete`
 *
 * `E2E_BASE_URL` optional (default http://localhost:3000).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const LIST_LOAD_MS = 55_000;

async function waitForListLoaded(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByText(/^Loading/i).first())
    .not.toBeVisible({ timeout: LIST_LOAD_MS })
    .catch(() => undefined);
}

async function skipIfSupabaseMissing(page: import("@playwright/test").Page): Promise<void> {
  if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
    test.skip(true, "Supabase not configured.");
  }
}

async function skipIfBackendError(page: import("@playwright/test").Page, re: RegExp): Promise<void> {
  if (await page.getByText(re).isVisible().catch(() => false)) {
    test.skip(true, "Backend unavailable.");
  }
}

test.describe("Delete surface catalog (read-only)", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  test("customers: overflow menu has Delete…", async ({ page }) => {
    await page.goto(`${BASE}/customers`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No customer rows.");
    await clickFirstRowOverflowMenu(page);
    await expect(page.getByRole("menuitem", { name: /Delete…/ })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });

  test("projects: overflow menu has Delete", async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    const row = page.locator("table tbody tr").first();
    test.skip((await row.count()) === 0, "No project rows.");
    await expect(row).toBeVisible({ timeout: LIST_LOAD_MS });
    await clickFirstRowOverflowMenu(page);
    await expectDeleteMenuItemThenClose(page);
  });

  test("tasks (desktop table): overflow has Delete", async ({ page }) => {
    await page.goto(`${BASE}/tasks`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfBackendError(page, /Failed to load tasks/i);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("table tbody tr").first();
    test.skip((await row.count()) === 0, "No task rows.");
    await clickFirstRowOverflowMenu(page);
    await expectDeleteMenuItemThenClose(page);
  });

  test("estimates: overflow menu has Delete", async ({ page }) => {
    await page.goto(`${BASE}/estimates`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No estimate rows.");
    await expect(row).toBeVisible({ timeout: LIST_LOAD_MS });
    await clickFirstRowOverflowMenu(page);
    await expectDeleteMenuItemThenClose(page);
  });

  test("documents: first row Delete control visible", async ({ page }) => {
    await page.goto(`${BASE}/documents`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No document rows.");
    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("financial expenses: trash Delete control visible", async ({ page }) => {
    await page.goto(`${BASE}/financial/expenses`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No expense rows.");
    const del = row.getByRole("button", { name: "Delete" });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("financial accounts: row trash visible", async ({ page }) => {
    await page.goto(`${BASE}/financial/accounts`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No account rows.");
    const del = row.getByRole("button", { name: "Delete" });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("financial payments (outbound): row trash visible", async ({ page }) => {
    await page.goto(`${BASE}/financial/payments`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No payment rows.");
    const del = row.getByRole("button", { name: "Delete" });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("labor entries: first row Delete visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/entries`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No labor entry rows.");
    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("labor review: first row Delete visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/review`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const reviewRows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Delete$/ }) });
    test.skip((await reviewRows.count()) === 0, "No review rows with Delete.");
    const row = reviewRows.first();
    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("labor invoices (internal): first row Delete visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/invoices`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await waitForListLoaded(page);
    await expect(page.locator("tbody tr").first()).not.toContainText(/\bLoading\b/i, { timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No labor invoice rows.");
    const rowText = (await row.innerText()).trim();
    test.skip(/\bloading\b/i.test(rowText), "Labor invoices table still loading.");
    test.skip(/no labor invoices yet/i.test(rowText), "No labor invoice rows.");
    // Text button "Delete" in Actions column (not icon-only).
    const del = row.getByRole("button", { name: /^Delete$/i });
    await expectDeleteControlVisibleWithoutHover(page, del, 4000);
  });

  test("labor reimbursements: trash Delete visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/reimbursements`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await waitForListLoaded(page);
    await expect(page.locator("tbody tr").first()).not.toContainText(/\bLoading\b/i, { timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No reimbursement rows.");
    const rowText = (await row.innerText()).trim();
    test.skip(/\bloading\b/i.test(rowText), "Reimbursements table still loading.");
    test.skip(/no reimbursements yet/i.test(rowText), "No reimbursement rows.");
    const del = row.locator('button[aria-label="Delete"]');
    await expectDeleteControlVisibleWithoutHover(page, del, 4000);
  });

  test("labor daily: first row delete (trash) visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/daily`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No daily labor rows.");
    const del = row.getByRole("button", { name: /Delete entry/i });
    await expectDeleteControlVisibleWithoutHover(page, del, 1500);
  });

  test("labor worker invoices: first row Delete visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/worker-invoices`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.locator("tbody tr").first()).not.toContainText(/\bLoading\b/i, { timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No worker invoice rows.");
    const rowText = (await row.innerText()).trim();
    test.skip(/\bloading\b/i.test(rowText), "Worker invoices table still loading.");
    test.skip(/no worker invoices yet/i.test(rowText), "No worker invoice rows.");
    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 4000);
  });

  test("labor payments (worker payouts list): first row Delete visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/payments`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await waitForListLoaded(page);
    await expect(page.locator("tbody tr").first()).not.toContainText(/\bLoading\b/i, { timeout: LIST_LOAD_MS }).catch(() => undefined);
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No payment rows.");
    const rowText = (await row.innerText()).trim();
    test.skip(/\bloading\b/i.test(rowText), "Payments table still loading.");
    test.skip(/no payments yet/i.test(rowText), "No worker payment rows.");
    const del = row.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 4000);
  });

  test("site-photos: first card overflow has Delete", async ({ page }) => {
    await page.goto(`${BASE}/site-photos`);
    await page.waitForLoadState("domcontentloaded");
    await skipIfSupabaseMissing(page);
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: LIST_LOAD_MS }).catch(() => undefined);
    const menuBtn = page.getByRole("button", { name: /^Actions for photo$/ }).first();
    test.skip((await menuBtn.count()) === 0, "No site photos.");
    await menuBtn.click();
    await expect(page.getByRole("menuitem", { name: /^Delete$/ })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });
});
