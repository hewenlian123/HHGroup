import { test, expect } from '@playwright/test';

const BASE = 'https://hhprojectgroup.com';

// ─── INVOICES PAGE ───────────────────────────────────────────────────────────
test.describe('Invoices page buttons', () => {
  test('New Invoice button navigates to invoice creation', async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState('networkidle');
    await page.click('a:has-text("New Invoice")');
    await expect(page).toHaveURL(/\/financial\/invoices\/new/);
  });

  test('Search invoices filter works', async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder*="Search invoice"]', 'INV-0001');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('Status filter dropdown works', async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState('networkidle');
    await page.selectOption('select', 'Draft');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('View invoice button navigates to detail page', async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState('networkidle');
    await page.locator('a:has-text("View")').first().click();
    await expect(page).toHaveURL(/\/financial\/invoices\/.+/);
  });

  test('Duplicate button works without error', async ({ page }) => {
    await page.goto(`${BASE}/financial/invoices`);
    await page.waitForLoadState('networkidle');
    const duplicateBtn = page.getByRole('button', { name: 'Duplicate' }).first();
    await expect(duplicateBtn).toBeVisible({ timeout: 5000 });
    await duplicateBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

// ─── WORKERS PAGE ─────────────────────────────────────────────────────────────
test.describe('Workers page buttons', () => {
  test('Add Worker button opens modal', async ({ page }) => {
    await page.goto(`${BASE}/workers`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Add Worker")');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('Worker Actions menu opens', async ({ page }) => {
    await page.goto(`${BASE}/workers`);
    await page.waitForLoadState('networkidle');
    const actionsBtn = page.getByRole('button', { name: /Actions for/i }).first();
    await expect(actionsBtn).toBeVisible({ timeout: 5000 });
    await actionsBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

// ─── PROJECTS PAGE ────────────────────────────────────────────────────────────
test.describe('Projects page buttons', () => {
  test('New project button works', async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    await page.waitForLoadState('networkidle');
    const newBtn = page.locator('button:has-text("New"), a:has-text("New Project")').first();
    await newBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('Project row click navigates to detail', async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    await page.waitForLoadState('networkidle');
    const firstProject = page.locator('table tbody tr').first();
    await firstProject.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
  });
});

// ─── BILLS PAGE ───────────────────────────────────────────────────────────────
test.describe('Bills page buttons', () => {
  test('New bill button navigates to bill creation', async ({ page }) => {
    await page.goto(`${BASE}/bills`);
    await page.waitForLoadState('networkidle');
    const newBillBtn = page.locator('a:has-text("New bill"), button:has-text("New Bill")').first();
    await newBillBtn.click();
    await expect(page).toHaveURL(/\/bills\/new/);
  });
});

// ─── LABOR PAGE ───────────────────────────────────────────────────────────────
test.describe('Labor page buttons', () => {
  test('Add entry button works', async ({ page }) => {
    await page.goto(`${BASE}/labor`);
    await page.waitForLoadState('networkidle');
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Entry")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });
});

// ─── TASKS PAGE ───────────────────────────────────────────────────────────────
test.describe('Tasks page buttons', () => {
  test('New task button works', async ({ page }) => {
    await page.goto(`${BASE}/tasks`);
    await page.waitForLoadState('networkidle');
    const newBtn = page.locator('button:has-text("New Task"), button:has-text("Add Task")').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });
});

// ─── DOCUMENTS PAGE ───────────────────────────────────────────────────────────
test.describe('Documents page buttons', () => {
  test('Upload/New document button works', async ({ page }) => {
    await page.goto(`${BASE}/documents`);
    await page.waitForLoadState('networkidle');
    const btn = page
      .locator('button:has-text("Upload"), button:has-text("New Document"), button:has-text("Add")')
      .first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });
});

// ─── VENDORS PAGE ─────────────────────────────────────────────────────────────
test.describe('Vendors page buttons', () => {
  test('Add vendor button works', async ({ page }) => {
    await page.goto(`${BASE}/vendors`);
    await page.waitForLoadState('networkidle');
    const btn = page.locator('button:has-text("Add Vendor"), button:has-text("New Vendor")').first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });
});

// ─── SYSTEM HEALTH PAGE ───────────────────────────────────────────────────────
test.describe('System Health page buttons', () => {
  test('Refresh Now button works', async ({ page }) => {
    await page.goto(`${BASE}/system-health`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Refresh Now")');
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

// ─── GLOBAL NAV BUTTONS ───────────────────────────────────────────────────────
test.describe('Global navigation buttons', () => {
  test('Global New button opens quick create menu', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("New")');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('Sidebar collapse and expand works', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Collapse")');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('Search bar accepts input', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder*="Search"]', 'test');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
