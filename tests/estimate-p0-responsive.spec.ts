import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return Math.max(
          root.scrollWidth - root.clientWidth,
          app ? app.scrollWidth - app.clientWidth : 0
        );
      })
    )
    .toBe(0);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} keeps New and Existing Estimate workspaces usable`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, "/estimates/new");
    await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
      timeout: 30_000,
    });

    await page
      .getByRole("button", { name: /^Add Section$/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Blank section" }).click();
    const addDetails = page.getByRole("button", { name: "Add details" }).first();
    if (await addDetails.isVisible().catch(() => false)) await addDetails.click();

    const unit = page
      .getByLabel("Line item 1 unit", { exact: true })
      .locator("visible=true")
      .first();
    await expect(unit).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & Preview" }).first()).toBeVisible();
    await expect(page.locator("body.estimate-builder-active")).toHaveCount(0);
    await expect(page.locator("main.estimate-builder-active")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const workspaceTheme = await page.locator(".estimate-builder").evaluate((builder) => {
      const templateTool = builder.querySelector<HTMLElement>(
        '[data-testid="estimate-template-selector"] > .eb-glass-panel'
      );
      return {
        background: getComputedStyle(builder).backgroundColor,
        colorScheme: getComputedStyle(builder).colorScheme,
        templateBackground: templateTool ? getComputedStyle(templateTool).backgroundColor : "",
      };
    });
    expect(workspaceTheme.background).toBe("rgb(247, 247, 246)");
    expect(workspaceTheme.colorScheme).toBe("light");
    expect(workspaceTheme.templateBackground).toBe("rgba(0, 0, 0, 0)");
    if (viewport.width === 390) {
      await page.mouse.move(0, 0);
      const mobileCardStyle = await page
        .locator(".eb-line-item-mobile-summary")
        .evaluate((card) => {
          const style = getComputedStyle(card);
          return { background: style.backgroundColor, opacity: style.opacity };
        });
      const channels =
        mobileCardStyle.background
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      expect(channels).toHaveLength(3);
      expect(Math.min(...channels)).toBeGreaterThanOrEqual(240);
      expect(mobileCardStyle.opacity).toBe("1");
    }
    if (viewport.width < 768) {
      const box = await unit.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await capture(page, testInfo, `${viewport.name}-new-estimate`);

    await page.goto(`/estimates/${E2E_PRESERVED_ESTIMATE_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save & Preview" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Drag to reorder line item" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `${viewport.name}-existing-estimate`);
  });
}
