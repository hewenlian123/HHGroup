import { expect, test, type Page } from "@playwright/test";

type ViewportCase = {
  name: "desktop" | "mobile" | "tablet";
  width: number;
  height: number;
  hasFloatingActionButton: boolean;
};

const VIEWPORTS: readonly ViewportCase[] = [
  { name: "desktop", width: 1440, height: 900, hasFloatingActionButton: false },
  { name: "mobile", width: 390, height: 844, hasFloatingActionButton: true },
  { name: "tablet", width: 820, height: 1180, hasFloatingActionButton: true },
];

async function gotoDashboard(page: Page, viewport: ViewportCase): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
}

async function expectExpenseReceiptInbox(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/financial\/inbox(?:[?#].*)?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /^Inbox$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: /^Worker Receipt Upload$/i })).toHaveCount(0);
}

async function openDashboardUploadReceipt(page: Page): Promise<void> {
  const quickActions = page.locator(".dashboard-quick-actions");
  await expect(quickActions).toBeVisible({ timeout: 30_000 });
  await quickActions.getByRole("link", { name: "Upload Receipt", exact: true }).click();
}

async function openFloatingUploadReceipt(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open quick actions" }).click();
  const quickActions = page.getByRole("navigation", { name: "Quick actions" });
  await expect(quickActions).toBeVisible();
  await quickActions.getByRole("button", { name: "Upload Receipt", exact: true }).click();
}

async function openHeaderUploadReceipt(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Upload Receipt", exact: true }).click();
}

async function openCommandPaletteUploadReceipt(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open command palette" }).click();
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("upload receipt");

  const uploadReceiptOptions = dialog.getByRole("option").filter({ hasText: /^Upload Receipt/ });
  await expect(uploadReceiptOptions).toHaveCount(1);
  await uploadReceiptOptions.click();
}

for (const viewport of VIEWPORTS) {
  test.describe(`Upload Receipt shared routing — ${viewport.name}`, () => {
    test.describe.configure({ timeout: 90_000 });

    test("Dashboard Quick Actions opens the Expense Receipt Inbox", async ({ page }) => {
      await gotoDashboard(page, viewport);
      await openDashboardUploadReceipt(page);
      await expectExpenseReceiptInbox(page);
    });

    test("header Finance shortcut opens the Expense Receipt Inbox", async ({ page }) => {
      await gotoDashboard(page, viewport);
      await openHeaderUploadReceipt(page);
      await expectExpenseReceiptInbox(page);
    });

    test("command palette opens the Expense Receipt Inbox", async ({ page }) => {
      await gotoDashboard(page, viewport);
      await openCommandPaletteUploadReceipt(page);
      await expectExpenseReceiptInbox(page);
    });

    if (viewport.hasFloatingActionButton) {
      test("Floating Action Button opens the Expense Receipt Inbox", async ({ page }) => {
        await gotoDashboard(page, viewport);
        await openFloatingUploadReceipt(page);
        await expectExpenseReceiptInbox(page);
      });
    } else {
      test("Floating Action Button is not exposed at the desktop breakpoint", async ({ page }) => {
        await gotoDashboard(page, viewport);
        await expect(page.getByRole("button", { name: "Open quick actions" })).toBeHidden();
      });
    }
  });
}

test("labor keeps an explicitly named worker receipt upload entry point", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/labor/receipts", { waitUntil: "domcontentloaded", timeout: 90_000 });

  const workerUpload = page
    .getByRole("link", {
      name: "Upload Worker Receipt",
      exact: true,
    })
    .first();
  await expect(workerUpload).toBeVisible({ timeout: 30_000 });
  await workerUpload.click();

  await expect(page).toHaveURL(/\/upload-receipt(?:[?#].*)?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /^Worker Receipt Upload$/i })).toBeVisible({
    timeout: 30_000,
  });
});
