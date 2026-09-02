import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const TEST_HEADERS = {
  "x-hh-test-auth-bypass": "1",
};

async function openSystemTests(page: import("@playwright/test").Page) {
  await page.route("**/api/test/run-all-tests", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        groups: [
          { name: "System Tests", ok: true, executionTimeMs: 42 },
          { name: "UI Tests", ok: false, executionTimeMs: 84, error: "Mocked UI failure" },
        ],
      }),
    });
  });

  await expect(page.getByRole("heading", { name: "System Tests" })).toBeVisible();
}

test.describe("Settings and admin global UI", () => {
  test("system test results retain semantic status and stack at every target viewport", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await loginAsE2EOwner(page, "/system-tests");
    await openSystemTests(page);
    await page.getByRole("button", { name: "Run All Tests" }).click();
    await expect(page.locator("[data-neo-table]").first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const resultCards = page.getByTestId("system-test-result-cards");
    await expect(resultCards).toBeVisible();
    await expect(resultCards.getByText("System Tests", { exact: true })).toBeVisible();
    await expect(resultCards.getByText("Mocked UI failure")).toBeVisible();

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 900 },
      { width: 1180, height: 820 },
      { width: 820, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflow, `${viewport.width}px has no page overflow`).toBe(false);
    }

    await page.setViewportSize({ width: 820, height: 900 });
    const runAllAction = await page.getByRole("button", { name: "Run All Tests" }).boundingBox();
    expect(runAllAction?.height, "820px run action touch target").toBeGreaterThanOrEqual(44);

    await page.setViewportSize({ width: 390, height: 844 });
    const firstResult = page.getByTestId("system-test-result-card").first();
    await expect(firstResult).toBeVisible();
    const resultBox = await firstResult.boundingBox();
    expect(resultBox?.width).toBeLessThanOrEqual(390);
    const contrast = await new AxeBuilder({ page })
      .include("main")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("settings sub-navigation is keyboard reachable and provides 44px touch targets", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: TEST_HEADERS,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await loginAsE2EOwner(page, "/settings/account");

    const nav = page.getByTestId("settings-subnav");
    await expect(nav).toBeVisible();
    const account = nav.getByRole("link", { name: "Account" });
    await expect(account).toHaveAttribute("aria-current", "page");
    for (const viewport of [
      { width: 820, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const box = await account.boundingBox();
      expect(box?.height, `${viewport.width}px settings target`).toBeGreaterThanOrEqual(44);
    }
    await account.focus();
    await expect(account).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/account$/);
    await context.close();
  });

  test("UI test results use semantic records without mobile horizontal overflow", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: TEST_HEADERS,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.route("**/api/test/run-ui-tests", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          tests: [
            { name: "projects", ok: true },
            { name: "estimates", ok: false, error: "Mocked UI failure" },
          ],
        }),
      });
    });

    await loginAsE2EOwner(page, "/system-tests/ui");
    await page.getByRole("button", { name: "Run UI Tests" }).click();
    await expect(page.getByTestId("ui-system-test-cards")).toBeVisible();
    await expect(page.getByTestId("ui-system-test-card")).toHaveCount(2);
    await expect(
      page.getByTestId("ui-system-test-cards").getByText("Mocked UI failure")
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);

    await page.setViewportSize({ width: 820, height: 900 });
    const runUiAction = await page.getByRole("button", { name: "Run UI Tests" }).boundingBox();
    expect(runUiAction?.height, "820px UI run action touch target").toBeGreaterThanOrEqual(44);
    await context.close();
  });
});
