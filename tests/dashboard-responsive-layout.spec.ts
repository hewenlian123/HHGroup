import { expect, test, type Page } from "@playwright/test";

const DASHBOARD_VIEWPORTS = [
  { width: 320, height: 568, name: "mobile-320" },
  { width: 390, height: 844, name: "mobile-390" },
  { width: 768, height: 1024, name: "ipad-portrait" },
  { width: 1024, height: 768, name: "ipad-landscape" },
  { width: 1366, height: 768, name: "laptop-1366" },
  { width: 1440, height: 900, name: "desktop-1440" },
] as const;

async function openDashboard(page: Page): Promise<void> {
  const response = await page.goto("/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(response?.status()).not.toBe(500);
  await expect(page.getByRole("heading", { name: "HH Command Center", level: 1 })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByRole("region", { name: "HH Command Center" })).toBeVisible({
    timeout: 90_000,
  });
}

async function dashboardLayout(page: Page) {
  return page.getByRole("region", { name: "HH Command Center" }).evaluate((dashboard) => {
    const visible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const outsideViewport = Array.from(dashboard.querySelectorAll("*"))
      .filter(visible)
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < -1 || bounds.right > window.innerWidth + 1;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").trim().slice(0, 80),
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      }));

    return {
      internalOverflow: dashboard.scrollWidth - dashboard.clientWidth,
      outsideViewport,
    };
  });
}

test.describe("Dashboard responsive layout", () => {
  test.describe.configure({ timeout: 180_000 });

  test("keeps the dashboard readable and fully contained at critical breakpoints", async ({
    page,
  }) => {
    await openDashboard(page);

    for (const viewport of DASHBOARD_VIEWPORTS) {
      await page.setViewportSize(viewport);

      await expect(
        page.getByRole("heading", { name: "HH Command Center", level: 1 })
      ).toBeVisible();

      const layout = await dashboardLayout(page);
      expect(
        layout.internalOverflow,
        `${viewport.name} dashboard content must not be silently clipped`
      ).toBeLessThanOrEqual(1);
      expect(
        layout.outsideViewport,
        `${viewport.name} visible dashboard content must stay inside the viewport`
      ).toEqual([]);

      const smallInteractiveTargets = await page
        .getByRole("region", { name: "HH Command Center" })
        .locator("a, button")
        .evaluateAll((controls) =>
          controls.flatMap((control) => {
            const style = window.getComputedStyle(control);
            const bounds = control.getBoundingClientRect();
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              bounds.width === 0 ||
              bounds.height === 0 ||
              (bounds.width >= 44 && bounds.height >= 44)
            ) {
              return [];
            }
            return [
              {
                text: (control.textContent ?? control.getAttribute("aria-label") ?? "")
                  .trim()
                  .slice(0, 60),
                width: Math.round(bounds.width),
                height: Math.round(bounds.height),
              },
            ];
          })
        );
      expect(
        smallInteractiveTargets,
        `${viewport.name} interactive targets must be at least 44px`
      ).toEqual([]);
    }
  });

  test("shows long financial values and action labels without truncation", async ({ page }) => {
    await openDashboard(page);

    const values = ["$1,248,320.75", "$428,650.20", "-$14,680.20", "128", "$24,895.50", "100.00%"];

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator(".dashboard-hud-card").evaluateAll((cards, stressValues) => {
        cards.forEach((card, index) => {
          const value = card.children[3];
          if (value && stressValues[index]) value.textContent = stressValues[index];
        });
        const core = document.querySelector(".dashboard-profit-core__value");
        if (core) core.textContent = "$1,248,320.75";
      }, values);

      const clippedFinancialValues = await page
        .locator(".dashboard-hud-card > :nth-child(4), .dashboard-profit-core__value")
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            const style = window.getComputedStyle(element);
            if (
              element.scrollWidth <= element.clientWidth + 1 &&
              style.textOverflow !== "ellipsis"
            ) {
              return [];
            }
            return [
              {
                text: element.textContent,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                textOverflow: style.textOverflow,
              },
            ];
          })
        );
      expect(
        clippedFinancialValues,
        `${viewport.width}x${viewport.height} financial values must remain complete`
      ).toEqual([]);

      const clippedActionLabels = await page
        .locator(".dashboard-quick-actions a span")
        .evaluateAll((labels) =>
          labels.flatMap((label) => {
            const style = window.getComputedStyle(label);
            if (label.scrollWidth <= label.clientWidth + 1 && style.textOverflow !== "ellipsis") {
              return [];
            }
            return [
              {
                text: label.textContent,
                scrollWidth: label.scrollWidth,
                clientWidth: label.clientWidth,
                textOverflow: style.textOverflow,
              },
            ];
          })
        );
      expect(
        clippedActionLabels,
        `${viewport.width}x${viewport.height} action labels must remain readable`
      ).toEqual([]);
    }
  });

  test("announces the desktop sidebar toggle state", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openDashboard(page);

    const collapseButton = page.getByRole("button", { name: "Collapse sidebar" });
    await expect(collapseButton).toBeVisible();
    await collapseButton.click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("keeps the mobile navigation close control clickable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDashboard(page);

    await page.getByRole("button", { name: "Open menu" }).click();
    const navigationDialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(navigationDialog).toBeVisible();

    await navigationDialog.getByRole("button", { name: "Close" }).click();
    await expect(navigationDialog).toBeHidden();
  });

  test("puts business health before quick navigation in the reading order", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDashboard(page);

    const healthPrecedesActions = await page
      .getByRole("region", { name: "HH Command Center" })
      .evaluate((dashboard) => {
        const firstHealthCard = dashboard.querySelector(".dashboard-hud-card");
        const quickActions = dashboard.querySelector(".dashboard-quick-actions");
        return Boolean(
          firstHealthCard &&
          quickActions &&
          firstHealthCard.compareDocumentPosition(quickActions) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      });

    expect(healthPrecedesActions).toBe(true);
  });
});
