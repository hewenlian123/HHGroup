import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdProjectNames = new Set<string>();

async function cleanupProjectNames(projectNames: Iterable<string>): Promise<void> {
  const names = Array.from(projectNames);
  if (names.length === 0) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const { data } = await supabase.from("projects").select("id").in("name", names);
  const ids = (data ?? []).map((row: { id: string }) => row.id).filter(Boolean);
  if (ids.length === 0) return;

  await supabase.from("projects").delete().in("id", ids);
}

async function fillNewProject(
  page: Page,
  params: { name: string; client: string; address: string; budget?: string }
): Promise<void> {
  await page.getByPlaceholder("Luxury Villa E").fill(params.name);
  await page.getByPlaceholder("Client or company name").fill(params.client);
  await page.getByPlaceholder("Project address").fill(params.address);
  await page.locator('input[name="budget"]').fill(params.budget ?? "250000");
}

async function createProject(
  page: Page,
  params: { name: string; client: string; address: string; budget?: string }
): Promise<void> {
  createdProjectNames.add(params.name);
  await page.goto("/projects/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: 30_000,
  });
  await fillNewProject(page, params);
  const createButton = page.getByRole("button", { name: "Create Project" });
  await expect(createButton).toBeEnabled({ timeout: 10_000 });
  await createButton.click();
  await expect(page).toHaveURL(/\/projects(?:[/?#]|$)/, { timeout: 30_000 });
  const search = page.getByTestId("projects-list-search-desktop");
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(params.name);
  await expect(page.getByRole("link", { name: `Open project ${params.name}` }).first()).toBeVisible(
    {
      timeout: 30_000,
    }
  );
}

async function openProjectDetail(page: Page, name: string): Promise<void> {
  const search = page.getByTestId("projects-list-search-desktop");
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(name);
  const row = page.getByRole("link", { name: `Open project ${name}` }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+/, { timeout: 30_000 });
  await expectProjectHeading(page, name, 30_000);
}

async function openProjectActions(page: Page): Promise<void> {
  const archiveItem = page.getByRole("menuitem", { name: "Archive project" });
  if (await archiveItem.isVisible().catch(() => false)) return;
  const actions = page.getByTestId("project-detail-actions");
  await expect(actions).toBeVisible({ timeout: 10_000 });
  await actions.click();
  try {
    await expect(archiveItem).toBeVisible({ timeout: 1_000 });
    return;
  } catch {
    // The trigger can remain expanded after a confirm dialog closes; click once more to reopen.
  }
  await actions.click();
  await expect(archiveItem).toBeVisible({ timeout: 10_000 });
}

async function expectProjectHeading(page: Page, name: string, timeout = 10_000): Promise<void> {
  await expect(page.locator("h1", { hasText: name }).first()).toBeVisible({ timeout });
}

test.afterEach(async () => {
  await cleanupProjectNames(createdProjectNames);
  createdProjectNames.clear();
});

test("creates, edits, archives, and deletes projects", async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = Date.now();
  const projectName = `PW Project E2E ${suffix}`;
  const clientName = `PW Client ${suffix}`;
  const address = `100 PW Test Ave ${suffix}`;
  const canceledName = `${projectName} CANCELLED`;
  const savedName = `${projectName} SAVED`;
  const savedClient = `${clientName} SAVED`;
  const savedAddress = `200 PW Saved Ave ${suffix}`;
  const deleteName = `PW Project Delete ${suffix}`;
  const deleteClient = `PW Delete Client ${suffix}`;
  const deleteAddress = `300 PW Delete Ave ${suffix}`;
  createdProjectNames.add(projectName);
  createdProjectNames.add(canceledName);
  createdProjectNames.add(savedName);
  createdProjectNames.add(deleteName);

  await page.goto("/projects");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText("Something went wrong");

  await page.locator('main a[href="/projects/new"]:visible').first().click();
  await expect(page).toHaveURL(/\/projects\/new(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByText("Project name is required.", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByPlaceholder("Luxury Villa E").fill(projectName);
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByText("Client name is required.", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Client or company name").fill(clientName);
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByText("Project address is required.", { exact: true })).toBeVisible();

  await fillNewProject(page, { name: projectName, client: clientName, address });
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects(?:[/?#]|$)/, { timeout: 30_000 });
  await openProjectDetail(page, projectName);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit project" });
  await expect(editDialog).toBeVisible({ timeout: 10_000 });
  await editDialog.getByLabel("Project name").fill(canceledName);
  await editDialog.getByRole("button", { name: "Cancel" }).click();
  await expectProjectHeading(page, projectName);
  await expect(page.getByText(canceledName, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editDialog).toBeVisible({ timeout: 10_000 });
  await editDialog.getByLabel("Project name").fill(savedName);
  await editDialog.getByLabel("Client").fill(savedClient);
  await editDialog.getByLabel("Address").fill(savedAddress);
  const saveButton = editDialog.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled({ timeout: 10_000 });
  await saveButton.click();
  await expectProjectHeading(page, savedName, 30_000);
  await expect(
    page.locator("p", { hasText: savedClient }).filter({ hasText: savedAddress }).first()
  ).toBeVisible({
    timeout: 30_000,
  });

  await openProjectActions(page);
  await page.getByRole("menuitem", { name: "Archive project" }).click({ force: true });
  let archiveDialog = page.getByRole("dialog", { name: "Archive project?" });
  await expect(archiveDialog).toBeVisible({ timeout: 10_000 });
  await archiveDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(archiveDialog).toBeHidden({ timeout: 10_000 });
  await expectProjectHeading(page, savedName);

  await openProjectActions(page);
  await page.getByRole("menuitem", { name: "Archive project" }).click({ force: true });
  archiveDialog = page.getByRole("dialog", { name: "Archive project?" });
  await expect(archiveDialog).toBeVisible({ timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/projects\?status=active(?:[&#]|$)/, { timeout: 30_000 }),
    archiveDialog.getByRole("button", { name: "Archive" }).click({ force: true }),
  ]);
  const searchAfterArchive = page.getByTestId("projects-list-search-desktop");
  await expect(searchAfterArchive).toBeVisible({ timeout: 30_000 });
  await searchAfterArchive.fill(savedName);
  await expect(page.getByText(savedName, { exact: true })).toHaveCount(0, { timeout: 30_000 });

  await createProject(page, { name: deleteName, client: deleteClient, address: deleteAddress });
  await openProjectDetail(page, deleteName);
  await openProjectActions(page);
  await page.getByRole("menuitem", { name: "Delete project…" }).click({ force: true });
  let deleteDialog = page.getByRole("dialog", { name: "Delete project?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(deleteDialog).toBeHidden({ timeout: 10_000 });
  await expectProjectHeading(page, deleteName);

  await openProjectActions(page);
  await page.getByRole("menuitem", { name: "Delete project…" }).click({ force: true });
  deleteDialog = page.getByRole("dialog", { name: "Delete project?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/projects(?:[/?#]|$)/, { timeout: 30_000 }),
    deleteDialog.getByRole("button", { name: "Delete" }).click({ force: true }),
  ]);
  const searchAfterDelete = page.getByTestId("projects-list-search-desktop");
  await expect(searchAfterDelete).toBeVisible({ timeout: 30_000 });
  await searchAfterDelete.fill(deleteName);
  await expect(page.getByText(deleteName, { exact: true })).toHaveCount(0, { timeout: 30_000 });
});

test("keeps project actions usable on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/projects");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText("Something went wrong");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("New project")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("projects-list-search").fill(E2E_PRESERVED_PROJECT_LABEL);
  const seedProject = page
    .locator('main a[href^="/projects/"]:visible', { hasText: E2E_PRESERVED_PROJECT_LABEL })
    .first();
  await expect(seedProject).toBeVisible({ timeout: 30_000 });
  await seedProject.click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("project-detail-actions")).toBeVisible();

  await page.goto("/projects/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Project" })).toBeVisible();
});
