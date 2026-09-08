import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixture";

test.use({ deviceScaleFactor: 2 });

const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 640, height: 900 },
  { width: 390, height: 844 },
] as const;

const pages = [
  { name: "projects", route: "/projects", heading: "Projects" },
  { name: "invoices", route: "/financial/invoices", heading: "Invoices" },
  {
    name: "expenses",
    route: "/financial/expenses?date_kind=all",
    heading: "Expenses",
    ready: '[data-expenses-list-page="expenses"][data-expenses-query-status="success"]',
  },
  {
    name: "receipt-inbox",
    route: "/financial/inbox?date_kind=all",
    heading: "Receipt Inbox",
    ready: '[data-expenses-list-page="inbox"][data-expenses-query-status="success"]',
  },
  { name: "labor", route: "/labor", heading: "Daily Labor" },
  { name: "customers", route: "/customers", heading: "Customers" },
] as const;

async function expectHealthyPage(page: Page, heading: string, ready?: string) {
  if (ready) await expect(page.locator(ready)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-app-topbar]")).toBeVisible({ timeout: 60_000 });
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  if (viewportWidth >= 640) {
    await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeHidden();
  } else {
    await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeVisible();
  }
  const main = page.locator("main");
  const pageHeading = main.getByRole("heading", { name: heading, exact: true });
  await expect(pageHeading).toBeVisible({ timeout: 60_000 });
  await expect(main.locator("h1:visible")).toHaveCount(1);
  await expect(pageHeading).toHaveCSS("font-size", "24px");

  const overflow = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      app: app ? app.scrollWidth - app.clientWidth : Number.POSITIVE_INFINITY,
      dpr: window.devicePixelRatio,
    };
  });
  expect(overflow.document).toBeLessThanOrEqual(2);
  expect(overflow.app).toBeLessThanOrEqual(2);
  expect(overflow.dpr).toBe(2);
}

for (const viewport of viewports) {
  test(`T2 page language ${viewport.width} DPR2`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await page.setViewportSize(viewport);
    const runtimeErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(`${page.url()}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`${page.url()}: ${message.text()}`);
    });

    for (const target of pages) {
      const response = await page.goto(target.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), target.route).toBe(200);
      await expectHealthyPage(page, target.heading, "ready" in target ? target.ready : undefined);
      await expect(page.getByRole("button", { name: "Open quick actions" })).toBeHidden();

      if (target.name === "invoices") {
        await expect(page.locator("[data-invoices-loading]")).toBeHidden({ timeout: 60_000 });
      }
      if (target.name === "expenses" || target.name === "receipt-inbox") {
        await expect(page.locator("[data-expenses-loading]")).toBeHidden({
          timeout: 60_000,
        });
      }

      if (target.name === "customers") {
        await expect(
          page.locator('main [role="toolbar"]').getByRole("combobox", {
            name: "Customer status",
          })
        ).toBeVisible();
      }

      if (target.name === "labor") {
        if (viewport.width < 768) {
          await expect(page.getByRole("button", { name: "Labor filters" })).toBeVisible();
          await expect(page.locator('select[aria-label="Project"]:visible')).toHaveCount(0);
          await expect(page.locator('select[aria-label="Worker"]:visible')).toHaveCount(0);
        } else {
          await expect(page.locator('select[aria-label="Project"]:visible')).toHaveCount(1);
          await expect(page.locator('select[aria-label="Worker"]:visible')).toHaveCount(1);
        }
      }

      const contrast = await new AxeBuilder({ page })
        .include("main")
        .withRules(["color-contrast"])
        .analyze();
      expect(contrast.violations, `${target.route} color contrast`).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(`${target.name}-${viewport.width}-dpr2.png`),
        fullPage: true,
      });
    }

    await testInfo.attach("runtime-errors", {
      body: JSON.stringify(runtimeErrors, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("console-errors", {
      body: JSON.stringify(consoleErrors, null, 2),
      contentType: "application/json",
    });
    expect(runtimeErrors).toEqual([]);
  });
}
