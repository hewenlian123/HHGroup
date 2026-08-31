import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase service role is required for this test.");
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function cleanupEstimateGraph(estimateId: string): Promise<void> {
  const admin = localAdmin();
  await admin.from("estimate_payment_schedule_items").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_items").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_categories").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_meta").delete().eq("estimate_id", estimateId);
  await deleteLocalEstimateFixtureGraphs([estimateId]);
}

type WorkspaceGeometry = {
  headerHeight: number;
  summaryLeft: number;
  summaryWidth: number;
  scopeTop: number;
};

async function readWorkspaceGeometry(page: Page): Promise<WorkspaceGeometry> {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("[data-estimate-workspace-header]");
    const summary = document.querySelector<HTMLElement>('[aria-label="Estimate pricing summary"]');
    const scopeHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (heading) => heading.textContent?.trim() === "Scope of work"
    );

    if (!header || !summary || !scopeHeading) {
      throw new Error("Estimate workspace geometry anchors are missing.");
    }

    const headerRect = header.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const scopeRect = scopeHeading.getBoundingClientRect();
    return {
      headerHeight: headerRect.height,
      summaryLeft: summaryRect.left,
      summaryWidth: summaryRect.width,
      scopeTop: scopeRect.top,
    };
  });
}

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
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("New Estimate is the unsaved state of the Existing Estimate workspace", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const clientName = `PW Workspace Client ${suffix}`;
  const projectName = `PW Workspace Project ${suffix}`;
  const lineTitle = `Premium finish carpentry ${suffix}`;
  const lineDescription =
    "Provide field verification, shop coordination, installation, protection, and final punch completion.";
  let createdEstimateUrl: string | null = null;
  let createdEstimateId: string | null = null;
  let newMobileScopeTop: number | null = null;

  try {
    const newHeader = page.locator("[data-estimate-workspace-header]");
    await expect(newHeader).toBeVisible({ timeout: 30_000 });
    await expect(newHeader.getByRole("heading", { name: "New Estimate" })).toBeVisible();
    await expect(newHeader.getByText("Draft", { exact: true })).toBeVisible();
    await expect(newHeader.getByRole("button", { name: "Edit details" })).toBeVisible();
    await expect(newHeader.getByRole("button", { name: "Save & Preview" })).toBeVisible();
    const newSaveButton = newHeader.getByRole("button", { name: "Save Estimate", exact: true });
    await expect(newSaveButton).toBeVisible();
    await expect(newSaveButton).toHaveText("Save");
    await expect(newHeader.getByRole("link", { name: "Cancel", exact: true })).toBeVisible();

    await newHeader.getByRole("button", { name: "Edit details" }).click();
    const newDetails = page.getByRole("dialog", {
      name: "Customer / project / pricing details",
    });
    await expect(newDetails.getByLabel("Customer", { exact: true })).toBeVisible();
    await expect(newDetails.getByText("Estimate style", { exact: true })).toBeVisible();
    await newDetails.getByPlaceholder("Client or company name").fill(clientName);
    await newDetails.getByPlaceholder("Project name").fill(projectName);
    await newDetails.getByRole("button", { name: "Save", exact: true }).click();

    await page
      .getByRole("button", { name: /^Add Section$/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /^Blank section$/i }).click();
    await page.getByLabel("Line item 1 title").locator("visible=true").fill(lineTitle);
    await page
      .getByRole("button", { name: "Line item 1 description" })
      .locator("visible=true")
      .click();
    const newDescription = page
      .getByRole("textbox", { name: "Line item 1 description" })
      .locator("visible=true");
    await newDescription.fill(lineDescription);
    await newDescription.focus();
    await page.keyboard.press("Meta+a");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect
      .poll(() => newDescription.evaluate((element) => element.innerHTML))
      .toMatch(/<(strong|b)>/i);
    await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("12");
    await page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true").fill("LF");
    await page
      .getByLabel("Line item 1 unit price", { exact: true })
      .locator("visible=true")
      .fill("145.75");
    await expect(page.getByText("$1,749.00").locator("visible=true").first()).toBeVisible();
    await capture(page, testInfo, "new-estimate-workspace-1440");

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 1180, height: 820 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(newHeader).toBeVisible();
      await expectNoHorizontalOverflow(page);
      if (viewport.width === 390) {
        newMobileScopeTop = (await readWorkspaceGeometry(page)).scopeTop;
        await capture(page, testInfo, "new-estimate-workspace-390");
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    const newGeometry = await readWorkspaceGeometry(page);

    await newSaveButton.click();
    await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+(?:\?created=1)?$/, {
      timeout: 30_000,
    });
    createdEstimateUrl = page.url().replace(/\?.*$/, "");
    createdEstimateId = createdEstimateUrl.split("/").filter(Boolean).at(-1) ?? null;

    const existingHeader = page.getByTestId("estimate-detail-header");
    await expect(existingHeader).toBeVisible({ timeout: 30_000 });
    await expect(existingHeader).toContainText(clientName);
    await expect(page.getByText("$1,749.00").locator("visible=true").first()).toBeVisible();
    await existingHeader.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(existingHeader).toHaveAttribute("data-estimate-workspace-header", "true");
    await expect(existingHeader.getByRole("button", { name: "Edit details" })).toBeVisible();
    await expect(existingHeader.getByRole("button", { name: "Save & Preview" })).toBeVisible();
    await expect(existingHeader.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(existingHeader.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
    const savedDescription = page.getByLabel("Line item description").locator("visible=true");
    await expect(savedDescription).toContainText(lineDescription);
    await savedDescription.click();
    const savedDescriptionEditor = page
      .getByRole("textbox", { name: "Line item description" })
      .locator("visible=true");
    await expect
      .poll(() => savedDescriptionEditor.evaluate((element) => element.innerHTML))
      .toMatch(/<(strong|b)>/i);
    await page.keyboard.press("Escape");

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 1180, height: 820 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(existingHeader).toBeVisible();
      await expectNoHorizontalOverflow(page);
      if (viewport.width === 390) {
        const existingMobileScopeTop = (await readWorkspaceGeometry(page)).scopeTop;
        expect(newMobileScopeTop).not.toBeNull();
        expect((newMobileScopeTop ?? 0) - existingMobileScopeTop).toBeLessThanOrEqual(96);
        await capture(page, testInfo, "existing-estimate-workspace-390");
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await capture(page, testInfo, "existing-estimate-workspace-1440");

    const existingGeometry = await readWorkspaceGeometry(page);
    expect(Math.abs(newGeometry.headerHeight - existingGeometry.headerHeight)).toBeLessThanOrEqual(
      8
    );
    expect(Math.abs(newGeometry.summaryLeft - existingGeometry.summaryLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(newGeometry.summaryWidth - existingGeometry.summaryWidth)).toBeLessThanOrEqual(
      1
    );
    expect(newGeometry.scopeTop - existingGeometry.scopeTop).toBeLessThanOrEqual(96);

    await existingHeader.getByRole("button", { name: "Save & Preview" }).click();
    await expect(page).toHaveURL(/\/estimates\/[^/]+\/preview(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByText(lineTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(lineDescription, { exact: true })).toBeVisible();
    await expect(page.getByText("$1,749.00").first()).toBeVisible();
    await page.getByRole("link", { name: "Back to estimate" }).click();
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible({ timeout: 30_000 });
  } finally {
    if (createdEstimateId) await cleanupEstimateGraph(createdEstimateId);
  }
});
