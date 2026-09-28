import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const TEST_HEADERS = { "x-hh-test-auth-bypass": "1" };
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 900 },
  { width: 1180, height: 820 },
  { width: 820, height: 900 },
  { width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, `${label}: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(
    widths.client + 1
  );
}

test("settings expenses uses touch-ready mobile records without document overflow", async ({
  browser,
}) => {
  const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/settings/expense-options?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        rows: [
          {
            id: "ui-expense-option",
            name: "Field materials",
            type: "payment_method",
            active: true,
            is_default: true,
            is_system: false,
          },
        ],
      }),
    });
  });

  await loginAsE2EOwner(page, "/settings/expenses");
  await expect(page.getByTestId("settings-expenses-row-ui-expense-option")).toBeVisible();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page, `expenses ${viewport.width}px`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const records = page.getByTestId("settings-expenses-mobile-list");
  await expect(records).toBeVisible();
  const rename = records.getByRole("button", { name: "Rename", exact: true });
  await expect(rename).toBeVisible();
  const renameBox = await rename.boundingBox();
  expect(renameBox?.height, "390px rename target").toBeGreaterThanOrEqual(44);
  await rename.focus();
  await expect(rename).toBeFocused();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(records).toBeVisible();
  await expectNoHorizontalOverflow(page, "expenses forced colors 390px");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("company settings filter sheet keeps navigation controls touch ready", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: TEST_HEADERS,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await loginAsE2EOwner(page, "/settings/company");
  await page.getByRole("button", { name: /filters/i }).click();
  const account = page.getByRole("link", { name: "Account", exact: true });
  await expect(account).toBeVisible();
  const accountBox = await account.boundingBox();
  expect(accountBox?.height, "company settings navigation target").toBeGreaterThanOrEqual(44);
  await account.focus();
  await expect(account).toBeFocused();
  const done = page.getByRole("button", { name: "Done", exact: true });
  const doneBox = await done.boundingBox();
  expect(doneBox?.height, "company filter Done target").toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page, "company settings 390px");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("settings lists and subcontractors retain mobile record paths and touch actions", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/lists");
  await expectNoHorizontalOverflow(page, "settings lists 390px shell");
  const listsSource = readFileSync(
    resolve(process.cwd(), "src/app/settings/lists/page.tsx"),
    "utf8"
  );
  const subcontractorsSource = readFileSync(
    resolve(process.cwd(), "src/app/settings/subcontractors/subcontractors-table-client.tsx"),
    "utf8"
  );
  expect(listsSource).toContain('data-testid="settings-lists-mobile-records"');
  expect(listsSource).toContain('className="hidden md:block"');
  expect(listsSource).toContain("min-h-11 rounded-hh-standard");
  expect(subcontractorsSource).toContain("min-h-11 rounded-hh-standard text-xs");
  expect(subcontractorsSource).toContain("min-h-11 rounded-hh-standard text-hh-helper");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
