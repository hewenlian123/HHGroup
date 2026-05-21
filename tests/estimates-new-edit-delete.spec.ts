import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

function isEstimatesListUrl(url: URL): boolean {
  const pathname = url.pathname;
  return pathname === "/estimates" || pathname === "/estimates/";
}

async function cleanupEstimateTestData(
  clientNames: Iterable<string>,
  projectNames: Iterable<string>
): Promise<void> {
  const clients = Array.from(clientNames);
  const projects = Array.from(projectNames);
  if (clients.length === 0 && projects.length === 0) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const estimateIds = new Set<string>();

  if (clients.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("client", clients);
    for (const row of data ?? []) {
      if (row.id) estimateIds.add(String(row.id));
    }
  }
  if (projects.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("project", projects);
    for (const row of data ?? []) {
      if (row.id) estimateIds.add(String(row.id));
    }
  }

  const ids = Array.from(estimateIds);
  if (ids.length === 0) return;

  await supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_snapshots").delete().in("estimate_id", ids);
  await supabase.from("estimate_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_categories").delete().in("estimate_id", ids);
  await supabase.from("estimate_meta").delete().in("estimate_id", ids);
  await supabase.from("estimates").delete().in("id", ids);
}

async function fillNewEstimateCustomerFields(
  page: Page,
  params: { clientName: string; projectName: string }
): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Edit details/i }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
  }
  await dialog.getByPlaceholder("Client or company name").fill(params.clientName);
  await dialog.getByPlaceholder("Project name").fill(params.projectName);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
}

async function expectDialogInViewport(page: Page, dialogName: RegExp | string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(
      async () =>
        dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const horizontallyVisible = rect.left >= -1 && rect.right <= window.innerWidth + 1;
          const verticallyVisible = rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
          return {
            inViewport: horizontallyVisible && verticallyVisible,
            position: style.position,
          };
        }),
      { timeout: 10_000 }
    )
    .toMatchObject({ inViewport: true, position: "fixed" });
}

async function fillNewEstimate(
  page: Page,
  params: {
    clientName: string;
    projectName: string;
    lineTitle: string;
    quantity?: string;
    unitPrice?: string;
  }
): Promise<void> {
  await fillNewEstimateCustomerFields(page, {
    clientName: params.clientName,
    projectName: params.projectName,
  });

  await addBlankEstimateSection(page);

  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 15_000 });
  await lineTitleInput.fill(params.lineTitle);
  await page
    .getByLabel("Line item 1 quantity")
    .locator("visible=true")
    .fill(params.quantity ?? "2");
  await page
    .getByLabel("Line item 1 unit price")
    .locator("visible=true")
    .fill(params.unitPrice ?? "125.5");
}

async function addBlankEstimateSection(page: Page): Promise<void> {
  const addSection = page.getByRole("button", { name: /^Add Section$/i }).first();
  await expect(addSection).toBeVisible({ timeout: 30_000 });
  await addSection.click();

  const blankSection = page.getByRole("menuitem", { name: /^Blank section$/i }).first();
  if (await blankSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankSection.click();
  }
}

async function addBlankEstimateLine(page: Page): Promise<void> {
  const addLine = page.getByRole("button", { name: /^Add line$/i }).first();
  await expect(addLine).toBeVisible({ timeout: 10_000 });
  await addLine.click();

  const blankLine = page.getByRole("menuitem", { name: /^Blank line$/i }).first();
  if (await blankLine.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankLine.click();
  }
}

/** Wait until no estimate list row links mention this client (post-delete). */
async function expectNoEstimateListRowForClient(page: Page, clientName: string): Promise<void> {
  await expect(page).toHaveURL(isEstimatesListUrl, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Estimates", level: 1 }).locator("visible=true")
  ).toBeVisible({ timeout: 30_000 });

  const rowLinks = () =>
    page.locator("main").locator('a[href^="/estimates/"]').filter({ hasText: clientName });

  await expect.poll(async () => rowLinks().count(), { timeout: 30_000 }).toBe(0);

  const listSearch = page.getByPlaceholder("Search estimates…").locator("visible=true").first();
  if ((await listSearch.count()) > 0) {
    await listSearch.fill(clientName);
    await expect.poll(async () => rowLinks().count(), { timeout: 15_000 }).toBe(0);
  }
}

async function createEstimate(
  page: Page,
  params: {
    clientName: string;
    projectName: string;
    lineTitle: string;
  }
): Promise<string> {
  createdClientNames.add(params.clientName);
  createdProjectNames.add(params.projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimate(page, params);
  const saveButton = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByText(params.clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(params.lineTitle, { exact: true }).locator("visible=true")
  ).toBeVisible({
    timeout: 30_000,
  });
  return page.url();
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("creates, edits, cancels, saves, and deletes a draft estimate", async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = Date.now();
  const clientName = `PW Estimate E2E ${suffix}`;
  const canceledClientName = `${clientName} CANCELLED`;
  const savedClientName = `${clientName} SAVED`;
  const projectName = `PW Estimate Project ${suffix}`;
  const lineTitle = `PW estimate line ${suffix}`;
  createdClientNames.add(clientName);
  createdClientNames.add(canceledClientName);
  createdClientNames.add(savedClientName);
  createdProjectNames.add(projectName);

  await page.goto("/finance");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText("Something went wrong");

  const estimatesLink = page.locator('main a[href="/financial/estimates"]').first();
  await expect(estimatesLink).toBeVisible({ timeout: 30_000 });
  await estimatesLink.click();
  await expect(page).toHaveURL(isEstimatesListUrl, { timeout: 30_000 });

  await page.locator('main a[href="/estimates/new"]:visible').first().click();
  await expect(page).toHaveURL(/\/estimates\/new(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page.getByText("Client name is required.").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Project name is required.").first()).toBeVisible();
  await expect(page.getByText("At least one line item is required.").first()).toBeVisible();

  await fillNewEstimate(page, { clientName, projectName, lineTitle });
  await addBlankEstimateLine(page);
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "More actions" }).locator("visible=true").last().click();
  await page.getByRole("menuitem", { name: "Remove line item" }).click();
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toHaveCount(0);

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(lineTitle, { exact: true }).locator("visible=true")).toBeVisible({
    timeout: 30_000,
  });

  const detailUrl = page.url();
  await page.goto("/estimates");
  await page.waitForLoadState("domcontentloaded");
  const listSearch = page.locator('input[placeholder="Search estimates…"]:visible').first();
  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(clientName);
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(detailUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: /Edit details/i }).click();
  await page
    .getByRole("dialog")
    .getByPlaceholder("Client or company name")
    .fill(canceledClientName);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator("header").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(canceledClientName, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: /Edit details/i }).click();
  await page.getByRole("dialog").getByPlaceholder("Client or company name").fill(savedClientName);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(savedClientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Delete estimate" }).click();
  let deleteDialog = page.getByRole("dialog", { name: "Delete estimate?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText(savedClientName, { exact: true }).locator("visible=true")
  ).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Delete estimate" }).click();
  deleteDialog = page.getByRole("dialog", { name: "Delete estimate?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(isEstimatesListUrl, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Estimates", level: 1 }).locator("visible=true")
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText("Something went wrong");
  await expectNoEstimateListRowForClient(page, savedClientName);
});

test("opens approved estimate conversion without creating a project", async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = Date.now();
  const clientName = `PW Estimate Convert ${suffix}`;
  const projectName = `PW Estimate Convert Project ${suffix}`;
  const lineTitle = `PW estimate convert line ${suffix}`;

  await createEstimate(page, { clientName, projectName, lineTitle });

  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("header").getByText("Sent", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const statusButton = page.getByRole("button", { name: /^Status/i });
  await expect(statusButton).toBeEnabled({ timeout: 15_000 });
  await statusButton.click();
  const markAccepted = page.getByRole("menuitem", { name: /Mark accepted/i });
  await expect(markAccepted).toBeVisible({ timeout: 15_000 });
  await markAccepted.click();
  await expect(page.locator("header").getByText("Approved")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Convert to Project" }).click();
  await expect(page.getByText("Set up project")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Create project" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Set up project")).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/estimates\/[^/?#]+/, { timeout: 10_000 });
});

test("formats fractional-cent estimate amounts as standard currency", async ({ page }) => {
  test.setTimeout(120_000);

  const rawFractionalCurrency = /\$0\.(?:011|012|014)(?!\d)/;
  const suffix = Date.now();
  const clientName = `PW Estimate Precision ${suffix}`;
  const projectName = `PW Estimate Precision Project ${suffix}`;
  const lineTitle = `PW fractional-cent line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimate(page, {
    clientName,
    projectName,
    lineTitle,
    quantity: "1",
    unitPrice: "0.011",
  });
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").locator("visible=true").first()).toBeVisible({
    timeout: 30_000,
  });

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  const detailUrl = page.url();
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").locator("visible=true").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").locator("visible=true").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('input[name="unitCost"]').locator("visible=true")).toHaveValue("0.01");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/estimates");
  await page.waitForLoadState("domcontentloaded");
  const listSearch = page.locator('input[placeholder="Search estimates…"]:visible').first();
  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(clientName);
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").locator("visible=true").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`${detailUrl}/preview`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").locator("visible=true").first()).toBeVisible({
    timeout: 30_000,
  });
});

test("keeps estimate actions usable on mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/financial/estimates");
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(isEstimatesListUrl, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("Something went wrong");
  await expect(page.getByRole("heading", { name: "Estimates", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("New estimate")).toBeVisible({ timeout: 30_000 });

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /^Add Section$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Estimate" })).toBeVisible();

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page.getByText("Client name is required.").first()).toBeVisible();
  await expect(page.getByText("Project name is required.").first()).toBeVisible();
  await expect(page.getByText("At least one line item is required.").first()).toBeVisible();

  const suffix = Date.now();
  const clientName = `PW Estimate Mobile ${suffix}`;
  const projectName = `PW Estimate Mobile Project ${suffix}`;
  const lineTitle = `PW mobile line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  const detailsDialog = page.getByRole("dialog", {
    name: /Customer \/ project \/ pricing details/i,
  });
  await expect(detailsDialog).toBeVisible({ timeout: 10_000 });
  const mobileViewport = page.viewportSize();
  await expect
    .poll(
      async () => {
        const box = await detailsDialog.boundingBox();
        return box ? Math.ceil(box.x + box.width) : 9999;
      },
      { timeout: 10_000 }
    )
    .toBeLessThanOrEqual((mobileViewport?.width ?? 390) + 1);

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  await addBlankEstimateSection(page);

  const lineCard = page.getByRole("article").first();
  await expect(lineCard).toBeVisible({ timeout: 15_000 });
  await lineCard.getByRole("button", { expanded: false }).first().click();
  await expect(lineCard.getByLabel("Line item 1 title")).toBeVisible({ timeout: 10_000 });
  await lineCard.getByLabel("Line item 1 title").fill(lineTitle);
  await lineCard.getByLabel("Line item 1 quantity").fill("2");
  await lineCard.getByLabel("Line item 1 unit price").fill("50");
  await expect(lineCard.getByText(/\$100\.00/)).toBeVisible({ timeout: 10_000 });

  await expect(lineCard.getByRole("button", { name: "Hide details" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(lineCard.getByText("More", { exact: true })).toHaveCount(0);
  await lineCard.getByRole("button", { name: "Line item options" }).click();
  await expect(page.getByLabel("Line item 1 unit", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await page.keyboard.press("Escape");

  const scheduleSection = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Payment schedule" }) })
    .first();
  await scheduleSection.evaluate((node) => {
    if (node instanceof HTMLDetailsElement) node.open = true;
  });
  await scheduleSection.getByRole("button", { name: "Schedule Payment" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(scheduleDialog).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(
      async () => {
        const box = await scheduleDialog.boundingBox();
        return box ? Math.ceil(box.x + box.width) : 9999;
      },
      { timeout: 10_000 }
    )
    .toBeLessThanOrEqual((mobileViewport?.width ?? 390) + 1);
  await scheduleDialog.getByLabel("Due Date").fill("2026-06-01");
  await scheduleDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(scheduleDialog).toBeHidden({ timeout: 10_000 });

  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw + 1);

  const stickyTotal = page.getByLabel("Estimate total");
  await expect(stickyTotal).toBeVisible();
  await stickyTotal.scrollIntoViewIfNeeded();
  const saveBtn = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveBtn).toBeVisible();
});

test("keeps new estimate detail and payment drawers visible on desktop and mobile", async ({
  page,
}) => {
  test.setTimeout(90_000);

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/estimates/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /Edit details/i }).click();
    await expectDialogInViewport(page, /Customer \/ project \/ pricing details/i);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: /Customer \/ project \/ pricing details/i })
    ).toBeHidden({ timeout: 10_000 });

    await page.getByRole("button", { name: /Edit details/i }).click();
    const detailsDialog = page.getByRole("dialog", {
      name: /Customer \/ project \/ pricing details/i,
    });
    await expectDialogInViewport(page, /Customer \/ project \/ pricing details/i);
    await detailsDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(detailsDialog).toBeHidden({ timeout: 10_000 });

    await page.getByRole("button", { name: /Edit details/i }).click();
    await expectDialogInViewport(page, /Customer \/ project \/ pricing details/i);
    await detailsDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(detailsDialog).toBeHidden({ timeout: 10_000 });

    const scheduleSection = page
      .locator("details")
      .filter({ has: page.locator("summary").filter({ hasText: "Payment schedule" }) })
      .first();
    await scheduleSection.evaluate((node) => {
      if (node instanceof HTMLDetailsElement) node.open = true;
    });
    await scheduleSection.getByRole("button", { name: "Schedule Payment" }).click();
    await expectDialogInViewport(page, "Schedule Payment");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Schedule Payment" })).toBeHidden({
      timeout: 10_000,
    });

    await scheduleSection.getByRole("button", { name: "Schedule Payment" }).click();
    const scheduleDialog = page.getByRole("dialog", { name: "Schedule Payment" });
    await expectDialogInViewport(page, "Schedule Payment");
    await scheduleDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(scheduleDialog).toBeHidden({ timeout: 10_000 });

    await scheduleSection.getByRole("button", { name: "Schedule Payment" }).click();
    await expectDialogInViewport(page, "Schedule Payment");
    await scheduleDialog.getByLabel("Payment Name").fill(`Deposit ${viewport.width}`);
    await scheduleDialog.getByLabel("Amount").fill("500");
    await scheduleDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(scheduleDialog).toBeHidden({ timeout: 10_000 });
  }
});
