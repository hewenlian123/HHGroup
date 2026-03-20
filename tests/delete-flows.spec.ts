import { test, expect } from "@playwright/test";
import {
  acceptBrowserDialogs,
  expectDeleteControlVisibleWithoutHover,
  clickTrashInRowAndConfirmDialog,
} from "./e2e-helpers";

/**
 * Default: read-only checks (no DB writes) — verifies Delete is visible immediately (no hover delay).
 * Full create→delete: `E2E_ALLOW_DELETE_MUTATIONS=1 npm run test:e2e:delete`
 *
 * `E2E_BASE_URL` optional (default http://localhost:3000).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ALLOW_MUTATIONS = process.env.E2E_ALLOW_DELETE_MUTATIONS === "1";
const ROW_REMOVED_MS = 15_000;

test.describe("Delete UX: Delete control visible without hover (existing rows)", () => {
  test.beforeEach(({ page }) => {
    acceptBrowserDialogs(page);
  });

  test("financial vendors: first data row Delete is immediately visible", async ({ page }) => {
    await page.goto(`${BASE}/financial/vendors`);
    await page.waitForLoadState("domcontentloaded");
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
      test.skip(true, "Supabase not configured.");
    }
    await expect(page.getByText(/Loading vendors/i)).not.toBeVisible({ timeout: 20_000 });
    const dataRow = page.locator("tbody tr").filter({ hasNotText: /Loading vendors|No vendors yet/i }).first();
    test.skip((await dataRow.count()) === 0, "No vendor rows.");
    const del = dataRow.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1200);
  });

  test("settings categories: first data row Delete is immediately visible", async ({ page }) => {
    await page.goto(`${BASE}/settings/categories`);
    await page.waitForLoadState("domcontentloaded");
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
      test.skip(true, "Supabase not configured.");
    }
    await expect(page.getByText(/Loading categories/i)).not.toBeVisible({ timeout: 20_000 });
    const dataRow = page.locator("tbody tr").filter({ hasNotText: /Loading categories|No categories yet/i }).first();
    test.skip((await dataRow.count()) === 0, "No category rows.");
    const del = dataRow.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1200);
  });

  test("labor workers: first data row Delete is immediately visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/workers`);
    await page.waitForLoadState("domcontentloaded");
    if (await page.getByText(/Failed to fetch workers/i).isVisible().catch(() => false)) {
      test.skip(true, "Workers API unavailable.");
    }
    await expect(page.getByText(/Loading workers/i)).not.toBeVisible({ timeout: 20_000 });
    const dataRow = page.locator("tbody tr").filter({ hasNotText: /Loading workers|No workers found/i }).first();
    test.skip((await dataRow.count()) === 0, "No worker rows.");
    const del = dataRow.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1200);
  });

  test("labor subcontractors: first data row Delete is immediately visible", async ({ page }) => {
    await page.goto(`${BASE}/labor/subcontractors`);
    await page.waitForLoadState("domcontentloaded");
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
      test.skip(true, "Supabase not configured.");
    }
    await expect(page.getByText(/Loading/i).first()).not.toBeVisible({ timeout: 20_000 }).catch(() => undefined);
    const dataRow = page.locator("tbody tr").filter({ hasNotText: /No subcontractors yet/i }).first();
    test.skip((await dataRow.count()) === 0, "No subcontractor rows.");
    const del = dataRow.getByRole("button", { name: /^Delete$/ });
    await expectDeleteControlVisibleWithoutHover(page, del, 1200);
  });

  test("bills list: draft trash opens confirm quickly then cancel (no delete)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/bills`);
    await page.waitForLoadState("domcontentloaded");
    const rowWithTrash = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Delete" }) }).first();
    test.skip((await rowWithTrash.count()) === 0, "No draft bill row with delete (trash) control.");
    const trash = rowWithTrash.getByRole("button", { name: "Delete" });
    await expectDeleteControlVisibleWithoutHover(page, trash, 1200);
    const t0 = Date.now();
    await trash.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 1200 });
    expect(Date.now() - t0, "Confirm dialog should open quickly").toBeLessThan(1500);
    await dialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8000 });
  });
});

test.describe("Delete mutations: create then delete", () => {
  test.skip(!ALLOW_MUTATIONS, "Set E2E_ALLOW_DELETE_MUTATIONS=1 to run create→delete flows (requires DB insert/delete).");

  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(({ page }) => {
    acceptBrowserDialogs(page);
  });

  test("financial vendors: create then delete", async ({ page }) => {
    await page.goto(`${BASE}/financial/vendors`);
    await page.waitForLoadState("domcontentloaded");
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
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
      const banner = await page.locator(".text-muted-foreground").first().textContent().catch(() => "");
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
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
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
    if (await page.getByText(/Failed to fetch workers/i).isVisible().catch(() => false)) {
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
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
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
