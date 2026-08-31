import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { mkdir } from "node:fs/promises";

import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
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

test("Estimate List uses the Certified V2 operational hierarchy", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates");

  const workspace = page.getByTestId("estimate-list-workspace");
  await expect(workspace).toBeVisible();

  const newEstimate = page.getByRole("link", { name: "New Estimate", exact: true });
  await expect(newEstimate).toBeVisible();
  await expect(newEstimate).toHaveAttribute("href", "/estimates/new");

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

test("Estimate Builder transient controls use the Certified V2 component language", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  const builder = page.locator(".estimate-builder");
  await expect(builder).toBeVisible();

  await page.getByRole("button", { name: "Edit details" }).click();
  const proposalOption = page.getByRole("radio", { name: "Proposal" }).locator("..");
  await expect(proposalOption).toBeVisible();
  await expect(page.getByRole("radio", { name: "Proposal" })).toBeChecked();
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();

  await page.getByRole("button", { name: "Add Section", exact: true }).first().click();
  const customSectionInput = page.getByRole("textbox", { name: "Custom section title" });
  await expect(customSectionInput).toBeVisible();
  await customSectionInput.focus();
  await expect(customSectionInput).toBeFocused();
  const blankSection = page.getByRole("menuitem", { name: "Blank section" });
  await expect(blankSection).toBeVisible();
  await capture(page, testInfo, "estimate-builder-transient-controls-1440");
});

test("Estimate Preview and Print expose the current V2 action surfaces", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`);

  const previewToolbar = page.getByRole("toolbar", { name: "Estimate preview actions" });
  await expect(previewToolbar).toBeVisible();
  await expect(page.locator(".estimate-preview-shell")).toHaveAttribute(
    "data-estimate-preview-shell",
    "light"
  );

  const previewButton = page.getByRole("link", { name: "Back to estimate" });
  await expect(previewButton).toBeVisible();
  await capture(page, testInfo, "estimate-preview-operational-1440");

  const printHref = await page
    .getByRole("link", { name: "Print", exact: true })
    .getAttribute("href");
  expect(printHref).toBeTruthy();
  await gotoWithE2EAuth(page, printHref!);
  const printBar = page.locator(".estimate-print-action-bar");
  await expect(printBar).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to preview" })).toBeVisible();
  await capture(page, testInfo, "estimate-print-operational-1440");
});

test("Estimate Certified V2 surfaces honor reduced motion without spatial animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAsE2EOwner(page, "/estimates/new");

  const saveButton = page.getByRole("button", { name: "Save Estimate" }).first();
  await expect(saveButton).toBeVisible();
  await expect
    .poll(() =>
      saveButton.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          animationName: style.animationName,
          transform: style.transform,
          spatialTransitions: style.transitionProperty
            .split(",")
            .map((property) => property.trim())
            .filter((property) =>
              ["all", "transform", "top", "right", "bottom", "left", "width", "height"].includes(
                property
              )
            ),
        };
      })
    )
    .toEqual({
      reducedMotion: true,
      animationName: "none",
      transform: "none",
      spatialTransitions: [],
    });
});
