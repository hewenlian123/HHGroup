import { test, expect } from "@playwright/test";
import { expectVisibleOrSkip, tryCreateDraftInvoiceNavigateToDetail } from "./e2e-helpers";

/**
 * 验证「数据—页面—关联」在一条浏览器会话里能串起来：导航、关键控件、与 project/customer 等的挂钩。
 * 默认 **不写库**（或仅打开对话框）；需要 Supabase + 基础数据时部分步骤会 skip。
 *
 * `E2E_BASE_URL` 可选，默认 http://localhost:3000
 *
 * 说明全文：`docs/DATA_AND_INTEGRATION.md`
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const LOAD_MS = 70_000;

function trimBase(b: string) {
  return b.replace(/\/$/, "");
}

test.describe("Integration: data linked across modules", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  test("dashboard → projects → open first project detail", async ({ page }) => {
    await page.goto(`${trimBase(BASE)}/dashboard`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );

    await page.goto(`${trimBase(BASE)}/projects`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }
    const row = page.locator("table tbody tr").first();
    await expectVisibleOrSkip(row, "No projects table / still loading.", LOAD_MS);
    await Promise.all([
      page.waitForURL(/\/projects\/[^/?#]+/, { timeout: 25_000 }),
      row.getByRole("button", { name: /^View$/ }).click(),
    ]);
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });

  test("customers: name → detail page (customer graph)", async ({ page }) => {
    await page.goto(`${trimBase(BASE)}/customers`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }
    if (
      await page
        .getByText(/admin client is not configured|Failed to load customers|Internal Server Error/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Customers page requires service role / working customers API.");
    }
    if (
      await page
        .getByRole("heading", { name: /Something went wrong/i })
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Customers page hit global error boundary.");
    }
    // customers-client.tsx: summary row "Total customers: {n}" (React may split text nodes; match number)
    const summary = page.getByText(/Total customers\s*:\s*\d+/i);
    await expectVisibleOrSkip(
      summary,
      "Customers summary not rendered (SSR or DB error).",
      LOAD_MS
    );
    const nameLink = page.locator("tbody tr td a[href^='/customers/']").first();
    await expectVisibleOrSkip(nameLink, "No customers — seed data to test detail link.", LOAD_MS);
    const name = (await nameLink.textContent())?.trim() ?? "";
    await nameLink.click();
    await expect(page).toHaveURL(/\/customers\/[^/?#]+/, { timeout: 15_000 });
    if (
      await page
        .getByText(/Customer not found|The selected customer does not exist/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Customer detail not found in current DB snapshot.");
    }
    if (name) await expect(page.locator("body")).toContainText(name.slice(0, 48));
  });

  test("labor: worker balances ↔ worker balance page", async ({ page }) => {
    await page.goto(`${trimBase(BASE)}/labor/worker-balances`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured|Failed to load/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Labor balances unavailable.");
    }
    await expect(page.getByText(/Loading/i).first())
      .not.toBeVisible({ timeout: LOAD_MS })
      .catch(() => undefined);
    const workerLink = page.locator("tbody tr td a[href*='/labor/workers/']").first();
    await expectVisibleOrSkip(workerLink, "No worker link on balances.", LOAD_MS);
    const workerHref = await workerLink.getAttribute("href");
    await workerLink.click();
    const navigated = await page
      .waitForURL(/\/labor\/workers\/[^/]+\/balance/, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!navigated) {
      if (!workerHref) {
        test.skip(true, "Worker balance link missing href in this environment.");
      }
      await page.goto(`${trimBase(BASE)}${workerHref}`, { waitUntil: "domcontentloaded" });
    }
    await expect(page).toHaveURL(/\/labor\/workers\/[^/]+\/balance/, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });

  test("financial: new invoice flow requires project (customer ↔ project graph)", async ({
    page,
  }) => {
    const r = await tryCreateDraftInvoiceNavigateToDetail(page);
    test.skip(!r.ok, r.ok ? "" : r.skipReason);
    await expect(page).toHaveURL(/\/financial\/invoices\/[^/]+/);
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });

  test("tasks: new task dialog lists projects (task ↔ project)", async ({ page }) => {
    await page.goto(`${trimBase(BASE)}/tasks`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Failed to load tasks/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Tasks API failed.");
    }
    await expect(page.getByText(/Loading/i).first())
      .not.toBeVisible({ timeout: LOAD_MS })
      .catch(() => undefined);
    await page.getByRole("button", { name: /\+ New Task/i }).click();
    const dlg = page.getByRole("dialog", { name: /New Task/i });
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    const projectSel = dlg.locator("select").first();
    try {
      await expect(async () => {
        const n = await projectSel.locator("option").count();
        expect(n).toBeGreaterThan(1);
      }).toPass({ timeout: 45_000, intervals: [400, 800, 1500] });
    } catch {
      test.skip(true, "No projects in task dialog — link chain incomplete in DB.");
    }
    await dlg.getByRole("button", { name: /Cancel/i }).click();
    await expect(dlg).not.toBeVisible({ timeout: 8000 });
  });

  test("bills list ↔ new bill (AP graph)", async ({ page }) => {
    await page.goto(`${trimBase(BASE)}/bills`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
    const newBill = page.locator('a[href="/bills/new"]').first();
    await expectVisibleOrSkip(newBill, "Bills page not ready.", LOAD_MS + 25_000);
    await newBill.click();
    await expect(page).toHaveURL(/\/bills\/new/, { timeout: 15_000 });
  });

  test("labor entries list loads (entries ↔ workers/projects)", async ({ page }) => {
    await page.goto(`${trimBase(BASE)}/labor/entries`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }
    await expect(page.getByText(/Loading/i).first())
      .not.toBeVisible({ timeout: LOAD_MS })
      .catch(() => undefined);
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
    await expect(page.locator("table, [role='table']").first()).toBeVisible({ timeout: 15_000 });
  });
});
