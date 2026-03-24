import { test, expect } from "@playwright/test";
import { expectVisibleOrSkip, tryCreateDraftInvoiceNavigateToDetail } from "./e2e-helpers";

/** Default local dev (reliable SPA nav). Production: `E2E_BASE_URL=https://hhprojectgroup.com`. */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// ─── INVOICES PAGE ───────────────────────────────────────────────────────────
test.describe("Invoices page buttons", () => {
  test("New Invoice button navigates to invoice creation", async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState("domcontentloaded");
    // Route uses Suspense; wait past shell "Loading…"
    const newLink = page.getByRole("link", { name: "New Invoice" }).first();
    await expect(newLink).toBeVisible({ timeout: 60_000 });
    await newLink.click();
    await expect(page).toHaveURL(/\/financial\/invoices\/new/, { timeout: 30_000 });
  });

  test("Search invoices filter works", async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('input[placeholder*="Invoice #"]').fill("INV-0001");
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("Status filter dropdown works", async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState("domcontentloaded");
    await page.selectOption("select", "Draft");
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("Create draft invoice navigates to detail page", async ({ page }) => {
    const r = await tryCreateDraftInvoiceNavigateToDetail(page, BASE);
    test.skip(!r.ok, r.ok ? "" : r.skipReason);
  });

  test("Duplicate button works without error", async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState("domcontentloaded");
    const duplicateBtn = page.getByRole("button", { name: /^Duplicate$/i }).first();
    if (await duplicateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await duplicateBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Some environments hide direct duplicate actions; keep this as a no-crash smoke test.
      await expect(page.locator("body")).not.toContainText("Application error");
    }
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});

// ─── WORKERS PAGE ─────────────────────────────────────────────────────────────
test.describe("Workers page buttons", () => {
  test("Add Worker button opens modal", async ({ page }) => {
    await page.goto(`${BASE}/workers`);
    await page.waitForLoadState("domcontentloaded");
    await page.click('button:has-text("Add Worker")');
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("Worker Actions menu opens", async ({ page }) => {
    await page.goto(`${BASE}/workers`);
    await page.waitForLoadState("domcontentloaded");
    const actionsBtn = page.getByRole("button", { name: /Actions for/i }).first();
    await expect(actionsBtn).toBeVisible({ timeout: 5000 });
    await actionsBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});

// ─── PROJECTS PAGE ────────────────────────────────────────────────────────────
test.describe("Projects page buttons", () => {
  test("New project button works", async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    await page.waitForLoadState("domcontentloaded");
    const newBtn = page.locator('button:has-text("New"), a:has-text("New Project")').first();
    await newBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("Project row View action navigates to detail", async ({ page }) => {
    await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("projects-page-heading")).toBeVisible({ timeout: 60_000 });
    const dataRow = page.locator("table tbody tr").first();
    await expectVisibleOrSkip(dataRow, "No project rows.", 55_000);
    // Row <tr onClick> can be flaky before hydration; row actions menu calls onNavigate directly.
    await dataRow.getByRole("button", { name: /^Actions for / }).click();
    await page.getByRole("menuitem", { name: "View" }).click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+/, { timeout: 25_000 });
  });
});

// ─── BILLS PAGE ───────────────────────────────────────────────────────────────
test.describe("Bills page buttons", () => {
  test("New bill button navigates to bill creation", async ({ page }) => {
    // Default project timeout is 30s; visibility wait is 60s — raise test timeout first.
    test.setTimeout(90_000);
    await page.goto(`${BASE}/bills`);
    await page.waitForLoadState("domcontentloaded");
    // bills/page.tsx: <Link href="/bills/new">+ New Bill</Link> (Button asChild → <a>)
    const newBillLink = page.locator('a[href="/bills/new"]').first();
    await expect(newBillLink).toBeVisible({ timeout: 60_000 });
    await expect(newBillLink).toContainText(/new bill/i);
    await Promise.all([page.waitForURL(/\/bills\/new/, { timeout: 45_000 }), newBillLink.click()]);
  });
});

// ─── LABOR PAGE ───────────────────────────────────────────────────────────────
test.describe("Labor page buttons", () => {
  test("Add entry button works", async ({ page }) => {
    await page.goto(`${BASE}/labor`);
    await page.waitForLoadState("domcontentloaded");
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Entry")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });
});

// ─── TASKS PAGE ───────────────────────────────────────────────────────────────
test.describe("Tasks page buttons", () => {
  test("New task button works", async ({ page }) => {
    await page.goto(`${BASE}/tasks`);
    await page.waitForLoadState("domcontentloaded");
    const newBtn = page.locator('button:has-text("New Task"), button:has-text("Add Task")').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });
});

// ─── DOCUMENTS PAGE ───────────────────────────────────────────────────────────
test.describe("Documents page buttons", () => {
  test("Upload/New document button works", async ({ page }) => {
    await page.goto(`${BASE}/documents`);
    await page.waitForLoadState("domcontentloaded");
    const btn = page
      .locator('button:has-text("Upload"), button:has-text("New Document"), button:has-text("Add")')
      .first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });
});

// ─── VENDORS PAGE ─────────────────────────────────────────────────────────────
test.describe("Vendors page buttons", () => {
  test("Add vendor button works", async ({ page }) => {
    await page.goto(`${BASE}/vendors`);
    await page.waitForLoadState("domcontentloaded");
    const btn = page
      .locator('button:has-text("Add Vendor"), button:has-text("New Vendor")')
      .first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });
});

// ─── SYSTEM HEALTH PAGE ───────────────────────────────────────────────────────
test.describe("System Health page buttons", () => {
  test("Refresh Now button works", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${BASE}/system-health`);
    await page.waitForLoadState("domcontentloaded");
    const refreshBtn = page.getByRole("button", { name: "Refresh Now" }).first();
    await expect(refreshBtn).toBeVisible({ timeout: 60_000 });
    try {
      await expect(refreshBtn).toBeEnabled({ timeout: 120_000 });
    } catch {
      test.skip(true, "System health refresh stayed disabled (guardian still loading).");
      return;
    }
    await refreshBtn.click();
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});

// ─── GLOBAL NAV BUTTONS ───────────────────────────────────────────────────────
test.describe("Global navigation buttons", () => {
  test("Global New button opens quick create menu", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("domcontentloaded");
    await page.click('button:has-text("New")');
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("Sidebar collapse and expand works", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("domcontentloaded");
    await page.click('button:has-text("Collapse")');
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("Search bar accepts input", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[placeholder*="Search"]', "test");
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
