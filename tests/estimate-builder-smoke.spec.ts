import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

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

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

async function addBlankEstimateSection(page: import("@playwright/test").Page): Promise<void> {
  const addSection = page.getByRole("button", { name: /^Add Section$/i }).first();
  await expect(addSection).toBeVisible({ timeout: 30_000 });
  await addSection.click();

  const blankSection = page.getByRole("menuitem", { name: /^Blank section$/i }).first();
  if (await blankSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankSection.click();
  }
}

test("estimate builder smoke: create, edit totals, preview, open existing edit", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const suffix = Date.now();
  const clientName = `PW Estimate Smoke ${suffix}`;
  const projectName = `PW Estimate Smoke Project ${suffix}`;
  const lineTitle = `PW smoke line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /Edit details/i }).click();
  await page.getByPlaceholder("Client or company name").fill(clientName);
  await page.getByPlaceholder("Project name").fill(projectName);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();

  await addBlankEstimateSection(page);

  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 15_000 });
  await lineTitleInput.fill(lineTitle);
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("110");

  await expect(page.getByText("$110.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("2");
  await expect(page.getByText("$220.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("3");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("100");
  await expect(page.getByText("$300.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  const unitPriceInput = page.getByLabel("Line item 1 unit price").locator("visible=true");
  await unitPriceInput.fill("1367896.16");
  await expect(page.getByText("$4,103,688.48").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });
  const unitPriceBox = await unitPriceInput.boundingBox();
  expect(unitPriceBox?.width ?? 0).toBeGreaterThanOrEqual(130);
  await unitPriceInput.fill("100");
  await expect(page.getByText("$300.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  const detailUrl = page.url();

  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page).toHaveURL(/\/preview/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("Something went wrong");
  const previewMainText = await page.locator("main").evaluate((el) => el.textContent ?? "");
  expect(previewMainText).not.toContain("\u2028");

  await page.goto(detailUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("main")).toContainText(lineTitle, { timeout: 15_000 });

  const secondLineTitle = `PW second line ${suffix}`;
  await page.getByRole("button", { name: "Add line" }).first().click();
  await page.waitForLoadState("networkidle");
  const secondDesc = page.getByLabel("Line item description").locator("visible=true").nth(1);
  await expect(secondDesc).toBeVisible({ timeout: 30_000 });
  await secondDesc.fill(secondLineTitle);
  await secondDesc.blur();
  await page.getByLabel("Line item quantity").locator("visible=true").nth(1).fill("1");
  await page.getByLabel("Line item quantity").locator("visible=true").nth(1).blur();
  await page.getByLabel("Line item unit price").locator("visible=true").nth(1).fill("50");
  await page.getByLabel("Line item unit price").locator("visible=true").nth(1).blur();
  await expect(page.locator("main")).toContainText(secondLineTitle, { timeout: 15_000 });

  const sectionName = `PW Section ${suffix}`;
  const addSectionInput = page.getByRole("textbox", { name: "Search or add section" });
  await addSectionInput.scrollIntoViewIfNeeded();
  await addSectionInput.fill(sectionName);
  await page.getByRole("button", { name: "Add Section", exact: true }).click();
  await expect(
    page.getByText("Section created").or(page.getByText("Section added")).first()
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("main")).toContainText(secondLineTitle, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(sectionName, { timeout: 30_000 });
});
