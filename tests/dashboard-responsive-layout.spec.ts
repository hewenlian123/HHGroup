import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1366", width: 1366, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "desktop-1180", width: 1180, height: 820 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const viewport of VIEWPORTS) {
  test(`Dashboard keeps readable workspace at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, "/dashboard");

    const commandCenter = page.getByRole("region", { name: "HH Command Center" });
    await expect(commandCenter).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".dashboard-quick-actions")).toBeVisible();
    await capture(page, testInfo, `dashboard-${viewport.name}`);

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const main = document.querySelector<HTMLElement>("[data-app-scroll-root]");
      const commandCenter = document.querySelector<HTMLElement>('[aria-label="HH Command Center"]');
      const quickActions = document.querySelector<HTMLElement>(".dashboard-quick-actions");
      const title = commandCenter?.querySelector<HTMLElement>("h2");
      if (!main || !commandCenter || !quickActions || !title) {
        throw new Error("Dashboard command header is required");
      }
      const header = commandCenter.children[1] as HTMLElement | undefined;
      if (!header) throw new Error("Dashboard command header layout is required");
      const hudBox = commandCenter.getBoundingClientRect();
      const actionsBox = quickActions.getBoundingClientRect();
      return {
        mainOverflow: main.scrollWidth - main.clientWidth,
        pageOverflow: root.scrollWidth - root.clientWidth,
        headerFlow: getComputedStyle(header).flexDirection,
        titleWidth: Math.round(title.getBoundingClientRect().width),
        actionsRight: Math.round(actionsBox.right - hudBox.right),
      };
    });

    expect(metrics.mainOverflow).toBeLessThanOrEqual(0);
    expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
    expect(metrics.actionsRight).toBeLessThanOrEqual(1);

    if (viewport.name === "desktop-1280") {
      expect(metrics.headerFlow).toBe("column");
      expect(metrics.titleWidth).toBeGreaterThanOrEqual(280);
    }
  });
}
