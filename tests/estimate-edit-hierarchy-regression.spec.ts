import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

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

async function findLocalEditableEstimateWithItems(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase configuration is required.");
  assertE2ESupabaseUrlSafeForMutations(url);

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: itemRows, error: itemError } = await admin
    .from("estimate_items")
    .select("estimate_id")
    .limit(500);
  if (itemError) throw itemError;
  const estimateIds = Array.from(
    new Set((itemRows ?? []).map((row) => row.estimate_id as string).filter(Boolean))
  );
  if (estimateIds.length === 0) throw new Error("A local Estimate with line items is required.");

  const { data: estimateRows, error: estimateError } = await admin
    .from("estimates")
    .select("id, status")
    .in("id", estimateIds)
    .in("status", ["Draft", "Sent"])
    .limit(1);
  if (estimateError) throw estimateError;
  const estimateId = estimateRows?.[0]?.id as string | undefined;
  if (!estimateId) throw new Error("An editable local Estimate with line items is required.");
  return estimateId;
}

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
  const sendAction = commandHeader.getByRole("button", { name: "Send", exact: true });
  await expect
    .poll(async () => {
      const [edit, send] = await Promise.all(
        [editAction, sendAction].map((action) =>
          action.evaluate((node) =>
            (getComputedStyle(node).backgroundColor.match(/\d+/g) ?? []).map(Number)
          )
        )
      );
      const average = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3;
      return average(edit) < 80 && average(send) > 220;
    })
    .toBe(true);

  await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();

  // Edit mode owns identity and commands in one canonical header.
  await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);
  const editDetails = commandHeader.getByRole("button", { name: "Edit details" });
  await expect(editDetails).toBeVisible();
  await expect(commandHeader.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(commandHeader.getByRole("button", { name: "Save & Preview" })).toBeVisible();
  await expect(commandHeader.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();

  await editDetails.click();
  const detailsSheet = page.getByRole("dialog", {
    name: "Customer / project / pricing details",
  });
  await expect(detailsSheet.getByLabel("Customer")).toBeVisible();
  await expect(detailsSheet.getByLabel("Project / reference")).toBeVisible();
  await expect(detailsSheet.getByLabel("Address")).toBeVisible();
  await expect(detailsSheet.getByText("Estimate date", { exact: true })).toBeVisible();
  await expect(detailsSheet.getByText("Estimate style", { exact: true })).toBeVisible();
  await detailsSheet.getByRole("button", { name: "Cancel", exact: true }).click();

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-estimate-edit-1440");
});

test("editable Section titles use normal white and graphite control states", async ({
  page,
}, testInfo) => {
  const estimateId = await findLocalEditableEstimateWithItems();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${estimateId}`);
  await page.getByTestId("estimate-detail-header").getByRole("button", { name: "Edit" }).click();

  const sectionTitle = page.getByRole("button", { name: /^Section:/ }).first();
  await expect(sectionTitle).toBeVisible();
  await expect
    .poll(() =>
      sectionTitle.evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, color: style.color };
      })
    )
    .toEqual({ background: "rgba(0, 0, 0, 0)", color: "rgb(23, 23, 23)" });
  await capture(page, testInfo, "existing-section-title-1440");

  const precedingControl = sectionTitle.locator("xpath=preceding::button[1]");
  await precedingControl.focus();
  await page.keyboard.press("Tab");
  await expect(sectionTitle).toBeFocused();
  await expect
    .poll(() => sectionTitle.evaluate((node) => getComputedStyle(node).boxShadow))
    .not.toBe("none");
});

test("Existing Estimate Cancel restores View hierarchy and New Estimate remains unchanged", async ({
  page,
}) => {
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  const commandHeader = page.getByTestId("estimate-detail-header");
  const estimateNumber = (
    await commandHeader.getByRole("heading", { level: 1 }).innerText()
  ).trim();

  await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();
  await commandHeader.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(commandHeader.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);

  await page.goto("/estimates/new");
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
  await expect(page.getByTestId("estimate-details-summary")).toBeVisible();

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
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
    const commandHeader = page.getByTestId("estimate-detail-header");
    const estimateNumber = (
      await commandHeader.getByRole("heading", { level: 1 }).innerText()
    ).trim();

    await commandHeader.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText(estimateNumber, { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("estimate-details-summary")).toHaveCount(0);
    const editDetails = commandHeader.getByRole("button", { name: "Edit details" });
    await expect(editDetails).toBeVisible();
    if (viewport.width < 1024) {
      const box = await editDetails.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("heading", { name: "Scope of work" }).scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `existing-edit-${viewport.name}`);
  });
}
