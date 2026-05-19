import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const customerNames = new Set<string>();
const projectNames = new Set<string>();
const estimateClients = new Set<string>();
const estimateProjects = new Set<string>();
const changeOrderTitles = new Set<string>();

async function cleanupProjectsModuleData(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const projects = Array.from(projectNames);
  const customers = Array.from(customerNames);
  const estimateClientList = Array.from(estimateClients);
  const estimateProjectList = Array.from(estimateProjects);
  const coTitles = Array.from(changeOrderTitles);

  const projectIds = new Set<string>();
  if (projects.length > 0) {
    const { data } = await supabase.from("projects").select("id").in("name", projects);
    for (const row of data ?? []) {
      if (row.id) projectIds.add(String(row.id));
    }
  }

  const coIds = new Set<string>();
  if (coTitles.length > 0) {
    const { data } = await supabase
      .from("project_change_orders")
      .select("id")
      .in("title", coTitles);
    for (const row of data ?? []) {
      if (row.id) coIds.add(String(row.id));
    }
  }
  if (projectIds.size > 0) {
    const { data } = await supabase
      .from("project_change_orders")
      .select("id")
      .in("project_id", Array.from(projectIds));
    for (const row of data ?? []) {
      if (row.id) coIds.add(String(row.id));
    }
  }
  const coIdList = Array.from(coIds);
  if (coIdList.length > 0) {
    await supabase
      .from("project_change_order_attachments")
      .delete()
      .in("change_order_id", coIdList);
    await supabase.from("project_change_order_items").delete().in("change_order_id", coIdList);
    await supabase.from("project_change_orders").delete().in("id", coIdList);
  }

  const estimateIds = new Set<string>();
  if (estimateClientList.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("client", estimateClientList);
    for (const row of data ?? []) {
      if (row.id) estimateIds.add(String(row.id));
    }
  }
  if (estimateProjectList.length > 0) {
    const { data } = await supabase
      .from("estimates")
      .select("id")
      .in("project", estimateProjectList);
    for (const row of data ?? []) {
      if (row.id) estimateIds.add(String(row.id));
    }
  }
  const estimateIdList = Array.from(estimateIds);
  if (estimateIdList.length > 0) {
    await supabase.from("estimate_payment_schedule").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_snapshots").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_items").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_categories").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_meta").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimates").delete().in("id", estimateIdList);
  }

  if (projectIds.size > 0) {
    await supabase.from("projects").delete().in("id", Array.from(projectIds));
  }

  if (customers.length > 0) {
    await supabase.from("customers").delete().in("name", customers);
  }
}

async function expectHealthy(page: Page): Promise<void> {
  const body = page.locator("body");
  await expect(body).not.toContainText("Something went wrong");
  await expect(body).not.toContainText("404");
  await expect(body).not.toContainText("Hydration failed");
}

async function createCustomer(
  page: Page,
  params: { name: string; email: string; address: string }
) {
  customerNames.add(params.name);
  await page.goto("/customers");
  await page.waitForLoadState("domcontentloaded");
  await expectHealthy(page);

  await page
    .getByRole("button", { name: /\+ New Customer|New customer/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "New customer" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const inputs = dialog.locator("input");
  await inputs.nth(0).fill(params.name);
  await inputs.nth(1).fill(params.email);
  await inputs.nth(2).fill("808-555-0100");
  await inputs.nth(3).fill("Playwright Contact");
  await inputs.nth(4).fill(params.address);
  await inputs.nth(5).fill("Created by projects module navigation e2e.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const search = page.locator('input[placeholder="Search customers…"]:visible').first();
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(params.name);
  const link = page.getByRole("link", { name: params.name }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/\/customers\/[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: params.name })).toBeVisible({ timeout: 30_000 });
  return page.url();
}

async function selectCustomer(page: Page, customerName: string): Promise<void> {
  await page
    .getByRole("button", { name: /^Select customer$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Select customer" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Search by name or email").fill(customerName);
  await dialog.getByRole("button", { name: new RegExp(customerName) }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function createLinkedProject(
  page: Page,
  params: { customerName: string; projectName: string; address: string }
) {
  projectNames.add(params.projectName);
  await page.goto("/projects/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: 30_000,
  });
  await selectCustomer(page, params.customerName);
  await expect(page.getByPlaceholder("Client or company name")).toHaveValue(params.customerName);
  await page.getByPlaceholder("Luxury Villa E").fill(params.projectName);
  await page.locator("#project-address").click();
  const addressDialog = page.getByRole("dialog", { name: "Address details" });
  await expect(addressDialog).toBeVisible({ timeout: 10_000 });
  await addressDialog.getByLabel("Street address").fill(params.address);
  await addressDialog.getByRole("button", { name: "Save address" }).click();
  await expect(addressDialog).toBeHidden({ timeout: 10_000 });
  await page.locator('input[name="budget"]').fill("125000");
  await page.locator('select[name="status"]').selectOption("active");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects(?:[/?#]|$)/, { timeout: 30_000 });

  const search = page.getByTestId("projects-list-search-desktop");
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(params.projectName);
  await page
    .getByRole("link", { name: `Open project ${params.projectName}` })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+/, { timeout: 30_000 });
  await expect(page.locator("h1", { hasText: params.projectName }).first()).toBeVisible({
    timeout: 30_000,
  });
  return page.url();
}

async function createEstimateForProject(
  page: Page,
  params: { customerName: string; projectName: string; lineTitle: string }
) {
  estimateClients.add(params.customerName);
  estimateProjects.add(params.projectName);
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });
  await selectCustomer(page, params.customerName);
  await page.getByPlaceholder("Project name").fill(params.projectName);
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  await page.getByLabel("Line item 1 title").fill(params.lineTitle);
  await page.getByLabel("Line item 1 quantity").fill("1");
  await page.getByLabel("Line item 1 unit price").fill("500");
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByText(params.customerName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  return page.url();
}

async function createChangeOrderFromList(
  page: Page,
  params: { projectName: string; title: string }
): Promise<{ url: string; label: string }> {
  changeOrderTitles.add(params.title);
  await page.goto("/change-orders");
  await page.waitForLoadState("domcontentloaded");
  await expectHealthy(page);

  await page.getByRole("button", { name: /New Change Order/i }).click();
  await page.getByRole("menuitem", { name: params.projectName }).click({ force: true });
  await expect(page).toHaveURL(/\/projects\/[^/?#]+\/change-orders\/new/, { timeout: 30_000 });
  await page.getByRole("link", { name: new RegExp(params.projectName) }).click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+\?tab=change-orders/, { timeout: 30_000 });

  await page.goto(`${page.url().split("?")[0]}/change-orders/new`);
  await page.getByPlaceholder("e.g. Additional scope").fill(params.title);
  await page.getByPlaceholder("Describe the change and reason.").fill("Navigation e2e scope.");
  await page.locator('input[name="amount"]').fill("750");
  await page.getByRole("button", { name: "Create change order" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+\/change-orders\/(?!new(?:[/?#]|$))[^/?#]+/, {
    timeout: 30_000,
  });
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const label = (await heading.textContent())?.trim() || params.title;
  return { url: page.url(), label };
}

test.afterEach(async () => {
  await cleanupProjectsModuleData();
  customerNames.clear();
  projectNames.clear();
  estimateClients.clear();
  estimateProjects.clear();
  changeOrderTitles.clear();
});

test("sidebar navigation loads the projects module surfaces", async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await expectHealthy(page);

  const surfaces = [
    { href: "/projects", heading: "Projects" },
    { href: "/estimates", heading: "Estimates" },
    { href: "/change-orders", heading: "Change Orders" },
    { href: "/customers", heading: "Customers" },
  ];

  for (const surface of surfaces) {
    await page.locator(`nav a[href="${surface.href}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${surface.href}(?:[/?#]|$)`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expectHealthy(page);
  }
});

test("links customer, project, estimate, and change order flows together", async ({ page }) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const customerName = `PW Customer Nav ${suffix}`;
  const projectName = `PW Project Nav ${suffix}`;
  const address = `400 PW Navigation Ave ${suffix}`;
  const estimateLineTitle = `PW nav estimate line ${suffix}`;
  const changeOrderTitle = `PW nav change order ${suffix}`;

  const customerUrl = await createCustomer(page, {
    name: customerName,
    email: `pw-nav-${suffix}@example.com`,
    address,
  });
  const customerPath = new URL(customerUrl).pathname;

  const projectUrl = await createLinkedProject(page, { customerName, projectName, address });
  const projectPath = new URL(projectUrl).pathname;
  await expect(
    page.locator(`a[href="${customerPath}"]`, { hasText: customerName }).first()
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.locator(`a[href="${customerPath}"]`, { hasText: customerName }).first().click();
  await expect(page).toHaveURL(new RegExp(`${customerPath}(?:[/?#]|$)`), { timeout: 30_000 });
  await expect(page.getByText("Related work")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator(`a[href="${projectPath}"]`, { hasText: projectName }).first()
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/customers(?:[/?#]|$)/, { timeout: 30_000 });

  const estimateUrl = await createEstimateForProject(page, {
    customerName,
    projectName,
    lineTitle: estimateLineTitle,
  });
  const estimatePath = new URL(estimateUrl).pathname;

  await page.goto(projectUrl);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(`a[href="${estimatePath}"]`).first()).toBeVisible({ timeout: 30_000 });
  await page.locator(`a[href="${estimatePath}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${estimatePath}(?:[/?#]|$)`), { timeout: 30_000 });
  await expect(page.getByText(customerName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  const changeOrder = await createChangeOrderFromList(page, {
    projectName,
    title: changeOrderTitle,
  });
  const changeOrderUrl = changeOrder.url;
  const changeOrderPath = new URL(changeOrderUrl).pathname;

  await page.goto("/change-orders");
  await page.waitForLoadState("domcontentloaded");
  await expectHealthy(page);
  await page
    .locator('input[placeholder="Search change orders…"]:visible')
    .first()
    .fill(projectName);
  await expect(page.locator(`a[href="${changeOrderPath}"]`).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`${projectUrl}?tab=change-orders`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(`a[href="${changeOrderPath}"]`).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(customerUrl);
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.locator(`a[href="${projectPath}"]`, { hasText: projectName }).first()
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(`a[href="${estimatePath}"]`).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(`a[href="${changeOrderPath}"]`).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("keeps projects module primary actions reachable on mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  const mobileSurfaces = [
    { url: "/projects", heading: "Projects", action: "New project" },
    { url: "/estimates", heading: "Estimates", action: "New estimate" },
    { url: "/change-orders", heading: "Change Orders", action: "New change order" },
    { url: "/customers", heading: "Customers", action: "New customer" },
  ];

  for (const surface of mobileSurfaces) {
    await page.goto(surface.url);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(surface.action)).toBeVisible({ timeout: 30_000 });
    await expectHealthy(page);
  }
});
