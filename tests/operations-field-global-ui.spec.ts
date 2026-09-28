import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const TEST_HEADERS = { "x-hh-test-auth-bypass": "1" };
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 900 },
  { width: 1180, height: 820 },
  { width: 820, height: 900 },
  { width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, `${label}: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(
    widths.client + 1
  );
}

test.describe("Operations field global UI", () => {
  test("site photos keeps its field controls reachable without horizontal overflow", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/operations/site-photos", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, photos: [], projects: [] }),
      });
    });

    await loginAsE2EOwner(page, "/site-photos");
    await expect(page.getByTestId("operations-site-photos")).toBeVisible();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, `site photos ${viewport.width}px`);
    }

    await page.setViewportSize({ width: 820, height: 900 });
    const upload = page.getByRole("button", { name: "+ Upload Photo", exact: true });
    await expect(upload).toBeVisible();
    const uploadBox = await upload.boundingBox();
    expect(uploadBox?.height, "820px upload target").toBeGreaterThanOrEqual(44);
    await upload.focus();
    await expect(upload).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileUpload = page.getByLabel("Upload photo");
    await expect(mobileUpload).toBeVisible();
    const mobileUploadBox = await mobileUpload.boundingBox();
    expect(mobileUploadBox?.height, "390px upload target").toBeGreaterThanOrEqual(44);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await expect(page.getByTestId("operations-site-photos")).toBeVisible();
    await expect(mobileUpload).toBeVisible();
    await expectNoHorizontalOverflow(page, "site photos forced colors 390px");
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("inspection log keeps the add workflow keyboard reachable across field viewports", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/operations/inspection-log", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, entries: [], projects: [] }),
      });
    });

    await loginAsE2EOwner(page, "/inspection-log");
    await expect(page.getByTestId("operations-inspection-log")).toBeVisible();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, `inspection log ${viewport.width}px`);
    }

    await page.setViewportSize({ width: 820, height: 900 });
    const newInspection = page.getByRole("button", { name: "+ New Inspection", exact: true });
    await expect(newInspection).toBeVisible();
    const inspectionBox = await newInspection.boundingBox();
    expect(inspectionBox?.height, "820px inspection target").toBeGreaterThanOrEqual(44);
    await newInspection.focus();
    await expect(newInspection).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: /new inspection/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("site photos upload uses a focus-managed dialog that Escape closes without selecting a file", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: TEST_HEADERS,
      viewport: { width: 820, height: 900 },
    });
    const page = await context.newPage();
    await page.route("**/api/operations/site-photos", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, photos: [], projects: [] }),
      });
    });

    await loginAsE2EOwner(page, "/site-photos");
    const trigger = page.getByRole("button", { name: "+ Upload Photo", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Upload Photo", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Select a project, then choose file.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTrigger = page.getByLabel("Upload photo");
    await mobileTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(mobileTrigger).toBeFocused();
    await context.close();
  });
});
