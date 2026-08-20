import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";

const SCREENSHOT_DIR = "/private/tmp/hh-estimate-final-cohesion-screenshots";

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
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const path = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("Estimate List uses the white and graphite Operational Compact hierarchy", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates");

  const workspace = page.getByTestId("estimate-list-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace).not.toHaveClass(/\bdark\b|neo-page-on-graphite/);
  await expect
    .poll(() => workspace.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgb(247, 247, 246)");

  const newEstimate = page.getByRole("link", { name: "New Estimate", exact: true });
  await expect
    .poll(() => newEstimate.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgb(23, 23, 23)");

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "estimate-list-desktop-1440");
});

for (const viewport of [
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`Estimate List ${viewport.name} stays compact and overflow-free`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, "/estimates");

    const workspace = page.getByTestId("estimate-list-workspace");
    await expect(workspace).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 768) {
      const mobileCreate = page.getByRole("link", { name: "New estimate" });
      const mobileCreateBox = await mobileCreate.boundingBox();
      expect(mobileCreateBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(mobileCreateBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      const search = page.getByPlaceholder("Search estimates…").locator("visible=true");
      const searchBox = await search.boundingBox();
      expect(searchBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      const filters = page.getByRole("button", { name: /^Filters/ });
      const filtersBox = await filters.boundingBox();
      expect(filtersBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await capture(page, testInfo, `estimate-list-${viewport.name}`);
  });
}

test("Estimate Builder transient controls use the white and graphite component language", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  const builder = page.locator(".estimate-builder");
  await expect
    .poll(() => builder.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgb(247, 247, 246)");

  await page.getByRole("button", { name: "Edit details" }).click();
  const proposalOption = page.getByRole("radio", { name: "Proposal" }).locator("..");
  await expect(proposalOption).toBeVisible();
  await expect
    .poll(() => proposalOption.evaluate((node) => getComputedStyle(node).borderColor))
    .toBe("rgba(22, 22, 22, 0.09)");
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();

  await page.getByRole("button", { name: "Add Section", exact: true }).first().click();
  const customSectionInput = page.getByRole("textbox", { name: "Custom section title" });
  await expect(customSectionInput).toBeVisible();
  await expect
    .poll(() =>
      customSectionInput.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          color: style.color,
        };
      })
    )
    .toEqual({
      background: "rgb(255, 255, 255)",
      border: "rgba(22, 22, 22, 0.18)",
      color: "rgb(23, 23, 23)",
    });
  const blankSection = page.getByRole("menuitem", { name: "Blank section" });
  await expect
    .poll(() => blankSection.evaluate((node) => getComputedStyle(node).color))
    .toBe("rgb(23, 23, 23)");
  await capture(page, testInfo, "estimate-builder-transient-controls-1440");
});

test("Estimate Preview and Print controls share the Operational Compact action surface", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`);

  const previewToolbar = page.getByRole("toolbar", { name: "Estimate preview actions" });
  await expect(previewToolbar).toBeVisible();
  await expect
    .poll(() => previewToolbar.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgba(24, 24, 24, 0.98)");

  const previewButton = page.getByRole("link", { name: "Back to estimate" });
  await expect
    .poll(() => previewButton.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgba(255, 255, 255, 0.04)");
  await capture(page, testInfo, "estimate-preview-operational-1440");

  const printHref = await page
    .getByRole("link", { name: "Print", exact: true })
    .getAttribute("href");
  expect(printHref).toBeTruthy();
  await page.goto(printHref!);
  const printBar = page.locator(".estimate-print-action-bar");
  await expect(printBar).toBeVisible();
  await expect
    .poll(() => printBar.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgba(24, 24, 24, 0.98)");
  await capture(page, testInfo, "estimate-print-operational-1440");
});

test("Estimate Operational Compact surfaces honor reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAsE2EOwner(page, "/estimates/new");

  const saveButton = page.getByRole("button", { name: "Save Estimate" }).first();
  await expect(saveButton).toBeVisible();
  await expect
    .poll(() =>
      saveButton.evaluate((node) => {
        const style = getComputedStyle(node);
        const maxDuration = Math.max(
          ...[style.animationDuration, style.transitionDuration]
            .flatMap((value) => value.split(","))
            .map((value) => Number.parseFloat(value) || 0)
        );
        return maxDuration <= 0.00001;
      })
    )
    .toBe(true);
});
