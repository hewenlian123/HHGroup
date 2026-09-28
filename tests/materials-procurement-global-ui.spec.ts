import AxeBuilder from "@axe-core/playwright";
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

test.describe("Materials and procurement global UI", () => {
  test("material preview viewer uses operational light while preserving document light", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/materials/[id]/preview/material-selection-preview-shell.tsx"),
      "utf8"
    );
    expect(source).toContain('data-hh-theme="operational-light"');
    expect(source).toContain('data-hh-theme="document-light"');
    expect(source).not.toContain('data-hh-theme="neo-dark"');
  });

  test("material selections retains its real header action and responsive workspace", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await loginAsE2EOwner(page, "/materials");
    await expect(page.getByRole("heading", { name: "Material Selections" })).toBeVisible();
    await expect(page.getByText("Customer/project material approval sheets.")).toBeVisible();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, `materials ${viewport.width}px`);
    }

    await page.setViewportSize({ width: 820, height: 900 });
    const newSelection = page.getByRole("link", { name: "New Selection" });
    await expect(newSelection).toBeVisible();
    expect(
      (await newSelection.boundingBox())?.height,
      "820px new-selection target"
    ).toBeGreaterThanOrEqual(44);
    await newSelection.focus();
    await expect(newSelection).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const contrast = await new AxeBuilder({ page })
      .include("main")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("cost codes use certified dense records and stack safely on mobile", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await loginAsE2EOwner(page, "/estimating/cost-codes");
    await expect(page.getByRole("heading", { name: "Cost Codes", exact: true })).toBeVisible();
    await expect(page.getByTestId("cost-code-records")).toBeVisible();
    await expect(page.getByTestId("cost-code-table").locator("table table")).toHaveCount(0);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, `cost codes ${viewport.width}px`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("cost-code-cards")).toBeVisible();
    await expect(page.getByTestId("cost-code-table")).toBeHidden();
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("purchase orders remains an honest unavailable surface at every viewport", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await loginAsE2EOwner(page, "/procurement/purchase-orders");
    await expect(page.getByRole("heading", { name: "Purchase Orders" })).toBeVisible();
    const placeholder = page.getByTestId("purchase-orders-placeholder");
    await expect(placeholder).toContainText("Purchase order workflows are not available yet.");
    await expect(placeholder.getByRole("button")).toHaveCount(0);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, `purchase orders ${viewport.width}px`);
    }

    expect(pageErrors).toEqual([]);
    await context.close();
  });
});
