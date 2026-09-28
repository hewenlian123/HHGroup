import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixture";

test.use({ deviceScaleFactor: 2, hasTouch: true });

const viewports = [
  { width: 1440, height: 900 },
  { width: 1140, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 640, height: 900 },
  { width: 390, height: 844 },
] as const;

const pages = [
  { name: "dashboard", route: "/dashboard" },
  { name: "projects", route: "/projects" },
  { name: "estimate", route: "/estimates/44444444-4444-4444-4444-444444444449" },
  { name: "invoice", route: "/financial/invoices" },
  { name: "expenses", route: "/financial/expenses?date_kind=all" },
] as const;

const invoiceFixture = {
  id: "44444444-4444-4444-4444-444444444447",
  invoiceNo: "[E2E]-INV-SEED-001",
  projectId: "11111111-1111-1111-1111-111111111111",
  customerId: "22222222-2222-2222-2222-222222222222",
  clientName: "Seed Client",
  issueDate: "2026-09-01",
  dueDate: "2026-09-30",
  status: "Sent",
  lineItems: [],
  subtotal: 961.26,
  taxAmount: 0,
  total: 961.26,
  paidTotal: 384.5,
  balanceDue: 576.76,
  computedStatus: "Partial",
  daysOverdue: 0,
};

async function waitForPage(page: Page, name: (typeof pages)[number]["name"]) {
  const topbar = page.locator("[data-app-topbar]");
  if (name === "estimate" && (await page.evaluate(() => innerWidth)) >= 1200) {
    await expect(topbar).toBeHidden({ timeout: 60_000 });
  } else {
    await expect(topbar).toBeVisible({ timeout: 60_000 });
  }
  if (name === "dashboard") {
    await expect(page.getByRole("region", { name: "Operations home" })).toBeVisible();
  }
  if (name === "projects") {
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  }
  if (name === "estimate") {
    await expect(page.locator(".estimate-builder-new")).toBeVisible({ timeout: 60_000 });
  }
  if (name === "invoice") {
    await expect(page.locator("[data-invoices-loading]")).toBeHidden({ timeout: 60_000 });
  }
  if (name === "expenses") {
    await expect(
      page.locator('[data-expenses-list-page="expenses"][data-expenses-query-status="success"]')
    ).toBeVisible({ timeout: 60_000 });
  }
}

for (const target of pages) {
  for (const viewport of viewports) {
    test(`T6 ${target.name} ${viewport.width} DPR2`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const runtimeErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      if (target.name === "invoice") {
        await page.route("**/api/invoices?*", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              invoices: [invoiceFixture],
              projects: [{ id: invoiceFixture.projectId, name: "Seed Job" }],
            }),
          });
        });
      }

      const response = await page.goto(target.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), target.route).toBe(200);
      await waitForPage(page, target.name);

      const frame = await page.evaluate(() => {
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return {
          app: app ? app.scrollWidth - app.clientWidth : Number.POSITIVE_INFINITY,
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          dpr: devicePixelRatio,
          coarse: matchMedia("(pointer: coarse)").matches,
        };
      });
      expect(frame).toEqual({ app: 0, document: 0, dpr: 2, coarse: true });

      if (target.name === "dashboard") {
        await expect(
          page.locator(".dashboard-command-hud__grid, .hh-orbital-precision-dial")
        ).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Operations Home", exact: true })
        ).toBeVisible();
        expect(
          await page.locator("[data-dashboard-primary-actions] a").count()
        ).toBeLessThanOrEqual(3);
      }

      if (target.name === "projects") {
        await expect(page.locator("[data-projects-portfolio-kpis]")).toHaveCount(0);
        if (viewport.width < 1280) {
          await expect(page.locator("[data-projects-mobile-list]")).toBeVisible();
          await expect(page.locator("[data-projects-desktop-list]")).toBeHidden();
        } else {
          await expect(page.locator("[data-projects-desktop-list]")).toBeVisible();
        }
      }

      if (target.name === "invoice") {
        const rows = page.locator(
          '[data-testid^="invoice-row-"], [data-testid^="invoice-mobile-card-"]'
        );
        if ((await rows.count()) > 0) {
          await expect(page.locator("[data-invoice-primary-number]:visible").first()).toBeVisible();
          if (viewport.width < 1280) {
            await expect(page.locator('[data-testid="invoices-desktop-list"]')).toBeHidden();
            await expect(
              page.locator('[data-testid^="invoice-mobile-card-"]').first()
            ).toBeVisible();
          } else {
            await expect(page.locator('[data-testid="invoices-desktop-list"]')).toBeVisible();
          }
        }
      }

      if (target.name === "invoice" && viewport.width === 390) {
        const card = page.locator('[data-testid^="invoice-mobile-card-"]').first();
        if ((await card.count()) > 0) {
          await card.getByRole("button", { name: /Actions for/ }).click();
          const items = page.getByRole("menuitem").filter({ visible: true });
          const heights = await items.evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().height)
          );
          expect(heights.length).toBeGreaterThan(0);
          expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
          await page.keyboard.press("Escape");
        }
      }

      if (target.name === "expenses") {
        const strip = page.locator("[data-expenses-kpi-strip]");
        expect(
          await strip.evaluate((node) => node.scrollWidth - node.clientWidth)
        ).toBeLessThanOrEqual(1);
      }

      if (target.name === "expenses" && viewport.width === 390) {
        await page.getByRole("button", { name: /Filters/ }).click();
        const date = page.locator("[data-expenses-filter-date]:visible");
        await expect(date).toBeVisible();
        expect((await date.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
        await page.keyboard.press("Escape");
      }

      const contrast = await new AxeBuilder({ page })
        .include("main")
        .withRules(["color-contrast"])
        .analyze();
      expect(contrast.violations).toEqual([]);

      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`${target.name}-${viewport.width}-dpr2.png`),
      });
      expect(runtimeErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }
}
