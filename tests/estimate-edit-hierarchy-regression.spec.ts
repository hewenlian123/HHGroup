import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { mkdir } from "node:fs/promises";

import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import {
  cleanupPopulatedEditableEstimateFixture,
  POPULATED_EDITABLE_ESTIMATE_ID,
  seedPopulatedEditableEstimateFixture,
} from "./estimate-populated-editable-fixture";

const SCREENSHOT_DIR = "/private/tmp/hh-estimate-edit-hierarchy";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
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

function collectRuntimeErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

test.beforeAll(async () => {
  await seedPopulatedEditableEstimateFixture();
});

test.afterAll(async () => {
  await cleanupPopulatedEditableEstimateFixture();
});

test("Existing Estimate Edit mode has one identity hierarchy and canonical details access", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);

  const commandHeader = page.getByTestId("estimate-detail-header");
  const estimateNumber = (
    await commandHeader.getByRole("heading", { level: 1 }).innerText()
  ).trim();

  // View mode keeps complete metadata without repeating the command-bar identity.
  await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);
  await expect(
    page.getByTestId("estimate-details-summary").getByText(estimateNumber, { exact: true })
  ).toHaveCount(0);
  await expect(commandHeader.getByRole("button", { name: "Edit details" })).toHaveCount(0);

  const editAction = commandHeader.getByRole("button", { name: "Edit", exact: true });
  const sendAction = commandHeader.getByRole("button", {
    name: "Mark as Sent",
    exact: true,
  });
  await expect(editAction).toBeVisible();
  await expect(sendAction).toBeVisible();
  const [editBackground, sendBackground, renderedActionTokens] = await Promise.all([
    editAction.evaluate((node) => getComputedStyle(node).backgroundColor),
    sendAction.evaluate((node) => getComputedStyle(node).backgroundColor),
    page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.visibility = "hidden";
      document.body.append(probe);

      probe.style.backgroundColor = "var(--hh-surface-workspace)";
      const edit = getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor = "var(--hh-accent-primary)";
      const send = getComputedStyle(probe).backgroundColor;
      probe.remove();

      return { edit, send };
    }),
  ]);
  expect(editBackground).toBe(renderedActionTokens.edit);
  expect(sendBackground).toBe(renderedActionTokens.send);

  await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();

  // Edit mode owns identity and commands in one canonical header.
  await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);
  const editDetails = commandHeader.getByRole("button", { name: "Edit details" });
  await expect(editDetails).toBeVisible();
  await expect(commandHeader.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(commandHeader.getByRole("button", { name: "Save & Preview" })).toBeVisible();
  await expect(commandHeader.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);

  await editDetails.click();
  const detailsSheet = page.getByRole("dialog", {
    name: "Customer / project / pricing details",
  });
  await expect(detailsSheet.getByLabel("Customer")).toBeVisible();
  await expect(detailsSheet.getByLabel("Project / reference")).toBeVisible();
  await expect(detailsSheet.getByRole("textbox", { name: "Billing address" })).toBeVisible();
  await expect(detailsSheet.getByRole("textbox", { name: "Site address" })).toBeVisible();
  await expect(detailsSheet.getByText("Estimate date", { exact: true })).toBeVisible();
  await expect(detailsSheet.getByText("Estimate style", { exact: true })).toBeVisible();
  await detailsSheet.getByRole("button", { name: "Cancel", exact: true }).click();

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-estimate-edit-1440");
});

test("editable Section titles use current V2 field and control states", async ({
  page,
}, testInfo) => {
  const runtime = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${POPULATED_EDITABLE_ESTIMATE_ID}`);
  await page.getByTestId("estimate-detail-header").getByRole("button", { name: "Edit" }).click();

  const section = page.locator("[data-estimate-section-id]:visible").first();
  const sectionTitle = section.getByRole("button", { name: /^Section:/ });
  await expect(sectionTitle).toBeVisible();
  await expect
    .poll(() =>
      sectionTitle.evaluate((node) => {
        const style = getComputedStyle(node);
        const probe = document.createElement("span");
        probe.style.color = "var(--hh-text-primary)";
        probe.style.visibility = "hidden";
        document.body.append(probe);
        const tokenColor = getComputedStyle(probe).color;
        probe.remove();
        return {
          background: style.backgroundColor,
          usesTextPrimaryToken: style.color === tokenColor,
        };
      })
    )
    .toEqual({
      background: "rgba(0, 0, 0, 0)",
      usesTextPrimaryToken: true,
    });
  await capture(page, testInfo, "existing-section-title-1440");

  await sectionTitle.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(sectionTitle).toBeFocused();
  await expect
    .poll(() => sectionTitle.evaluate((node) => getComputedStyle(node).boxShadow))
    .not.toBe("none");
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});

test("Existing Estimate Save restores View hierarchy and New Estimate remains unchanged", async ({
  page,
}) => {
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  const commandHeader = page.getByTestId("estimate-detail-header");
  const estimateNumber = (
    await commandHeader.getByRole("heading", { level: 1 }).innerText()
  ).trim();

  await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();
  await commandHeader.getByRole("button", { name: "Save", exact: true }).click();
  await expect(commandHeader.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);

  await gotoWithE2EAuth(page, "/estimates/new");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible();
});

test("Existing Estimate Save and Save & Preview preserve the established workflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  const commandHeader = page.getByTestId("estimate-detail-header");

  await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();
  await commandHeader.getByRole("button", { name: "Save", exact: true }).click();
  await expect(commandHeader.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.locator('[data-estimate-inspector="pricing"]')).toBeVisible();

  await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();
  await commandHeader.getByRole("button", { name: "Save & Preview" }).click();
  await expect(page).toHaveURL(new RegExp(`/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`));
  await page.getByRole("link", { name: "Back to estimate" }).click();
  await expect(page).toHaveURL(new RegExp(`/estimates/${E2E_PRESERVED_ESTIMATE_ID}(?:\\?|$)`));
  await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
});

for (const viewport of [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`Existing Estimate Edit hierarchy stays compact at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    const runtime = collectRuntimeErrors(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${POPULATED_EDITABLE_ESTIMATE_ID}`);
    const commandHeader = page.getByTestId("estimate-detail-header");
    const estimateNumber = (
      await commandHeader.getByRole("heading", { level: 1 }).innerText()
    ).trim();

    await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("estimate-details-summary")).toHaveCount(0);
    const editDetails = commandHeader.getByRole("button", { name: "Edit details" });
    await expect(editDetails).toBeVisible();
    if (viewport.width <= 767) {
      const box = await editDetails.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await page
      .locator("[data-estimate-section-id], [data-estimate-section-mobile-id]")
      .locator("visible=true")
      .first()
      .scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `existing-edit-${viewport.name}`);
    expect(runtime.consoleErrors).toEqual([]);
    expect(runtime.pageErrors).toEqual([]);
  });
}
