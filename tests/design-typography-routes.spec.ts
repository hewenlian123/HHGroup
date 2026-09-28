import { expect, test } from "@playwright/test";
import { loginAsE2EOwner } from "./e2e-auth-owner";

const routes = [
  "/dashboard",
  "/financial/expenses",
  "/estimates",
  "/financial/invoices",
  "/projects",
  "/labor",
] as const;

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`Phase 4 shared typography remains usable across representative routes at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginAsE2EOwner(page, routes[0]);

    for (const route of routes) {
      if (page.url() !== new URL(route, "http://localhost:3000").href) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
      }
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll("/", "\\/")}(?:\\?.*)?$`));
      await expect(page.locator("body")).toBeVisible();

      const shell = await page.locator("body").evaluate((body) => {
        const style = getComputedStyle(body);
        return {
          fontFamily: style.fontFamily,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(shell.fontFamily).toMatch(/Geist/i);
      expect(shell.horizontalOverflow).toBeLessThanOrEqual(1);

      const sharedPageTitle = page.locator('[data-page-header="true"] h1').first();
      if (await sharedPageTitle.isVisible().catch(() => false)) {
        const title = await sharedPageTitle.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.fontSize, style.lineHeight, style.fontWeight];
        });
        expect(title).toEqual(
          viewport.width < 768 ? ["20px", "26px", "600"] : ["24px", "30px", "600"]
        );
      }

      const sharedEntry = page.locator(".hh-type-text-entry:visible").first();
      if ((await sharedEntry.count()) > 0) {
        const entry = await sharedEntry.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.fontSize, style.lineHeight, style.fontWeight];
        });
        expect(entry).toEqual(
          viewport.width < 768 ? ["16px", "24px", "400"] : ["14px", "20px", "400"]
        );
      }

      const sharedHeader = page.locator("table th:visible").first();
      if ((await sharedHeader.count()) > 0) {
        const header = await sharedHeader.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.fontSize, style.lineHeight, style.fontWeight];
        });
        expect(header).toEqual(["11px", "16px", "600"]);
      }

      const sharedCell = page.locator("table td:visible").first();
      if ((await sharedCell.count()) > 0) {
        const cell = await sharedCell.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.fontSize, style.lineHeight];
        });
        expect(cell).toEqual(["13px", "18px"]);
      }
    }
  });
}
