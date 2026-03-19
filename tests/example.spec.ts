import { test, expect } from '@playwright/test';

const BASE = 'https://hhprojectgroup.com';

async function checkPage(
  page: import('@playwright/test').Page,
  path: string
) {
  const response = await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');

  // Check HTTP status is not 500
  expect(response?.status()).not.toBe(500);
  expect(response?.status()).not.toBe(404);

  // Check for Next.js error page specific text only
  const body = page.locator('body');
  await expect(body).not.toContainText('Application error: a client-side exception has occurred');
  await expect(body).not.toContainText('Internal Server Error');
  await expect(body).not.toContainText('This page could not be found');

  // Check the page actually rendered something meaningful (not blank)
  const text = await body.innerText();
  expect(text.length).toBeGreaterThan(50);
}

test('dashboard', async ({ page }) => {
  await checkPage(page, '/dashboard');
});
test('invoices', async ({ page }) => {
  await checkPage(page, '/financial/invoices');
});
test('bills', async ({ page }) => {
  await checkPage(page, '/bills');
});
test('expenses', async ({ page }) => {
  await checkPage(page, '/financial/expenses');
});
test('labor', async ({ page }) => {
  await checkPage(page, '/labor');
});
test('workers', async ({ page }) => {
  await checkPage(page, '/workers');
});
test('projects', async ({ page }) => {
  await checkPage(page, '/projects');
});
test('tasks', async ({ page }) => {
  await checkPage(page, '/tasks');
});
test('documents', async ({ page }) => {
  await checkPage(page, '/documents');
});
test('vendors', async ({ page }) => {
  await checkPage(page, '/vendors');
});
test('subcontractors', async ({ page }) => {
  await checkPage(page, '/subcontractors');
});
test('punch-list', async ({ page }) => {
  await checkPage(page, '/punch-list');
});
test('site-photos', async ({ page }) => {
  await checkPage(page, '/site-photos');
});
test('schedule', async ({ page }) => {
  await checkPage(page, '/schedule');
});
test('estimates', async ({ page }) => {
  await checkPage(page, '/estimates');
});
test('change-orders', async ({ page }) => {
  await checkPage(page, '/change-orders');
});
test('system-health', async ({ page }) => {
  await checkPage(page, '/system-health');
});
test('system-logs', async ({ page }) => {
  await checkPage(page, '/system-logs');
});
test('settings', async ({ page }) => {
  await checkPage(page, '/settings');
});
