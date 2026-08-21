import { expect, test } from "@playwright/test";

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
  { name: "tablet-landscape", width: 1194, height: 834 },
  { name: "tablet-portrait", width: 834, height: 1194 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`Phase 5 shared ownership remains stable across representative routes at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll("/", "\\/")}(?:\\?.*)?$`));
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator('[aria-label="Notifications"][aria-live="polite"]')).toHaveCount(1);
      await expect(page.locator("[data-sonner-toaster], [data-hot-toast]")).toHaveCount(0);

      for (const theme of ["light", "dark"] as const) {
        await page.evaluate((nextTheme) => {
          document.documentElement.classList.toggle("dark", nextTheme === "dark");
        }, theme);
        await page.evaluate(
          () =>
            new Promise((resolveFrame) =>
              requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
            )
        );

        const result = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const shell = document.querySelector<HTMLElement>(".hh-app-shell");
          const workspace = document.querySelector<HTMLElement>("[data-app-scroll-root]");
          const body = getComputedStyle(document.body);
          return {
            bodyFont: body.fontFamily,
            canvas: shell ? getComputedStyle(shell).backgroundColor : null,
            canvasToken: root.getPropertyValue("--hh-l0-canvas").trim(),
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            workspace: workspace ? getComputedStyle(workspace).backgroundColor : null,
            workspaceToken: root.getPropertyValue("--hh-l1-workspace").trim(),
          };
        });

        expect(result.bodyFont).toMatch(/Geist/i);
        expect(result.noOverflow).toBe(true);
        expect(result.canvas).not.toBe("rgba(0, 0, 0, 0)");
        expect(result.workspace).not.toBe("rgba(0, 0, 0, 0)");
        expect(result.canvasToken).toBe(theme === "light" ? "#f7f7f6" : "#0a0a0a");
        expect(result.workspaceToken).toBe(theme === "light" ? "#ffffff" : "#111111");

        const firstSharedTouchTarget = page
          .locator(".hh-touch-min:visible, .hh-touch-square:visible, .hh-touch-row:visible")
          .first();
        if (viewport.name === "mobile" && (await firstSharedTouchTarget.count()) > 0) {
          const touch = await firstSharedTouchTarget.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return {
              height: box.height,
              square: element.classList.contains("hh-touch-square"),
              width: box.width,
            };
          });
          expect(touch.height).toBeGreaterThanOrEqual(44);
          if (touch.square) expect(touch.width).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
}
