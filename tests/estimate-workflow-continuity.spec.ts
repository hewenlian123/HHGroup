import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { mkdir } from "node:fs/promises";

import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;
const SCREENSHOT_DIR = "/private/tmp/hh-estimate-workflow-continuity-screenshots";

async function expectNoPageOverflow(page: Page): Promise<void> {
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

test("Builder Preview and Print preserve return context and document identity", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);

  const visibleSection = page.locator("[data-estimate-section-id]:visible").first();
  const hasSection = (await visibleSection.count()) > 0;
  if (hasSection) await visibleSection.scrollIntoViewIfNeeded();
  const expectedSectionId = hasSection
    ? await visibleSection.getAttribute("data-estimate-section-id")
    : null;

  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/?#]+\/preview\?origin=builder/, {
    timeout: 30_000,
  });
  const previewUrl = new URL(page.url());
  expect(previewUrl.searchParams.get("returnSection")).toBe(expectedSectionId);
  expect(Number(previewUrl.searchParams.get("returnScroll"))).toBeGreaterThanOrEqual(0);

  await expect(page.getByTestId("estimate-preview-document-mode")).toHaveText(/Proposal|Itemized/);
  const previewStyle = await page
    .getByTestId("estimate-document")
    .getAttribute("data-estimate-document-style");
  const previewLineCount = await page.getByTestId("estimate-line-item-output").count();
  const printHref = await page
    .getByRole("link", { name: "Print", exact: true })
    .getAttribute("href");
  expect(printHref).toContain("returnTo=");
  await capture(page, testInfo, "estimate-workflow-preview-desktop");

  await gotoWithE2EAuth(page, printHref!);
  await expect(page.getByRole("link", { name: "Back to preview" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^(Proposal|Itemized)$/)).toBeVisible();
  await expect(page.getByTestId("estimate-document")).toHaveAttribute(
    "data-estimate-document-style",
    previewStyle ?? ""
  );
  await expect(page.getByTestId("estimate-line-item-output")).toHaveCount(previewLineCount);
  await expect(page.getByRole("document", { name: "Estimate print view" })).toBeVisible();
  await expect(page.locator(".estimate-print-action-bar")).toBeVisible();
  await capture(page, testInfo, "estimate-workflow-print-desktop");
  await page.getByRole("link", { name: "Back to preview" }).click();
  await expect(page).toHaveURL(/\/preview\?origin=builder/, { timeout: 30_000 });

  await page.getByTestId("estimate-preview-back-link").click();
  await expect(page).toHaveURL(/\/estimates\/[^/?#]+\?returnScroll=/, { timeout: 30_000 });
  if (expectedSectionId) {
    await expect(
      page.locator(`[data-estimate-section-id="${expectedSectionId}"]:visible`)
    ).toBeFocused();
  } else {
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
  }
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} keeps Preview actions touch-safe and readable`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`);

    await expect(page.getByTestId("estimate-preview-document-mode")).toBeVisible({
      timeout: 30_000,
    });
    const previewToolbar = page.getByRole("toolbar", { name: "Estimate preview actions" });
    const previewSurface = await page.locator(".estimate-preview-shell").evaluate((node) => {
      const toolbar = node.querySelector<HTMLElement>(".estimate-preview-toolbar");
      const paper = node.querySelector<HTMLElement>(".estimate-a4-page");
      return {
        toolbarHeight: toolbar?.getBoundingClientRect().height ?? 0,
        paperTop: paper?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        shellMode: node.getAttribute("data-estimate-preview-shell"),
        hasToolbar: toolbar !== null,
        hasPaper: paper !== null,
      };
    });
    expect(previewSurface.shellMode).toBe("light");
    expect(previewSurface.hasToolbar).toBe(true);
    expect(previewSurface.hasPaper).toBe(true);
    expect(previewSurface.toolbarHeight).toBeLessThanOrEqual(viewport.width <= 700 ? 72 : 72);
    if (viewport.width <= 700) expect(previewSurface.paperTop).toBeLessThan(210);
    await expect(previewToolbar.getByTestId("estimate-preview-context")).toContainText(
      /Proposal|Itemized/
    );
    if (viewport.width <= 700) {
      for (const control of [
        page.getByRole("link", { name: "Back to estimate", exact: true }),
        page.getByRole("link", { name: "Download PDF", exact: true }),
        page.getByRole("button", { name: "More preview actions", exact: true }),
      ]) {
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      await expect(page.getByRole("link", { name: "Print", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Zoom out", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Fit pages", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeHidden();

      const moreActions = page.getByRole("button", {
        name: "More preview actions",
        exact: true,
      });
      await moreActions.click();
      for (const itemName of ["Print", "Zoom out", "Fit page", "Zoom in"]) {
        const menuItem = page.getByRole("menuitem", { name: itemName, exact: true });
        await expect(menuItem).toBeVisible();
        const box = await menuItem.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const fitPageMenuItem = page.getByRole("menuitem", { name: "Fit page", exact: true });
      await fitPageMenuItem.press("Escape");
      await expect(fitPageMenuItem).toBeHidden();
      await expect(moreActions).toBeFocused();
      await expect(page).toHaveURL(/\/estimates\/[^/?#]+\/preview(?:\?|$)/);

      const viewportScroll = await page
        .getByTestId("estimate-preview-viewport")
        .evaluate((node) => ({
          clientWidth: node.clientWidth,
          paperWidth:
            node.querySelector<HTMLElement>(".estimate-a4-page")?.getBoundingClientRect().width ??
            0,
          scrollWidth: node.scrollWidth,
        }));
      expect(viewportScroll.paperWidth).toBeGreaterThan(viewportScroll.clientWidth);
      expect(viewportScroll.scrollWidth).toBeGreaterThan(viewportScroll.clientWidth);
    } else {
      for (const control of [
        { role: "link" as const, name: "Back to estimate" },
        { role: "link" as const, name: "Print" },
        { role: "link" as const, name: "Download PDF" },
        { role: "button" as const, name: "Zoom out" },
        { role: "button" as const, name: "Fit pages" },
        { role: "button" as const, name: "Zoom in" },
      ]) {
        const element = page.getByRole(control.role, { name: control.name, exact: true });
        await expect(element).toBeVisible();
        const box = await element.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
    await expectNoPageOverflow(page);
    await capture(page, testInfo, `estimate-workflow-preview-${viewport.name}`);
    if (viewport.width <= 700) {
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/estimates\/[^/?#]+\?returnScroll=/, { timeout: 30_000 });
    }
  });
}
