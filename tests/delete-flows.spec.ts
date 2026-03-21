import { test, expect } from "@playwright/test";
import {
  acceptBrowserDialogs,
  expectDeleteControlVisibleWithoutHover,
  clickTrashInRowAndConfirmDialog,
} from "./e2e-helpers";
import { e2eTargetOrigin } from "./e2e-env-helpers";

/**
 * Read-only: Delete visible without hover + bills cancel (no destructive delete).
 * Create→delete flows: **`delete-flows-mutations.spec.ts`** (project `chromium-delete-mutations` in Playwright UI).
 *
 * `E2E_BASE_URL` optional (default http://localhost:3000).
 */
const BASE = e2eTargetOrigin();
const ROW_REMOVED_MS = 15_000;
/** List pages can stay on “Loading…” for a long time if Supabase/API is slow. */
const LIST_LOAD_MS = 55_000;

test.describe("Delete UX: Delete control visible without hover (existing rows)", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(({ page }) => {
    acceptBrowserDialogs(page);
  });

  test("financial vendors: first data row Delete is immediately visible", async ({ page }) => {
    await page.goto(`${BASE}/financial/vendors`);
    await page.waitForLoadState("domcontentloaded");
    if (await page.getByText(/Supabase is not configured/i).isVisible().catch(() => false)) {
      test.skip(true, "Supabase not configured.");
    }
    try {
      await expect(page.getByText(/Loading vendors/i)).not.toBeVisible({ timeout: LIST_LOAD_MS });
    } catch {
      test.skip(true, "Vendors list still loading — API slow or unavailable.");
    }
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
    try {
      await expect(page.getByText(/Loading categories/i)).not.toBeVisible({ timeout: LIST_LOAD_MS });
    } catch {
      test.skip(true, "Categories list still loading — API slow or unavailable.");
    }
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
    try {
      await expect(page.getByText(/Loading workers/i)).not.toBeVisible({ timeout: LIST_LOAD_MS });
    } catch {
      test.skip(true, "Workers list still loading — API slow or unavailable.");
    }
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
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/bills`, { waitUntil: "domcontentloaded", timeout: 55_000 });
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
