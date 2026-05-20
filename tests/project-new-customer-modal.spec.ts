import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const customerNames = new Set<string>();
const projectNames = new Set<string>();

async function cleanupNewCustomerModalData(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);

  const projects = Array.from(projectNames);
  const customers = Array.from(customerNames);

  if (projects.length > 0) {
    await supabase.from("projects").delete().in("name", projects);
  }
  if (customers.length > 0) {
    await supabase.from("customers").delete().in("name", customers);
  }
}

async function openNewCustomerModalFromProjectForm(page: Page): Promise<void> {
  await page.goto("/projects/new");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("button", { name: /^Select customer$/ }).click();
  const selectDialog = page.getByRole("dialog", { name: "Select customer" });
  await expect(selectDialog).toBeVisible({ timeout: 60_000 });
  await selectDialog.getByRole("button", { name: /\+ New Customer/i }).click();

  const dialog = page.getByRole("dialog", { name: "New customer" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
}

test.describe("Project new customer modal", () => {
  test.afterAll(async () => {
    await cleanupNewCustomerModalData();
  });

  test("creates customer with formatted phone and links to project", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const customerName = `PW Debbie Bergase ${stamp}`;
    const projectName = `PW Project NC ${stamp}`;
    const street = "123 Test St";
    customerNames.add(customerName);
    projectNames.add(projectName);

    await openNewCustomerModalFromProjectForm(page);
    const dialog = page.getByRole("dialog", { name: "New customer" });

    await dialog.getByTestId("new-customer-name").fill(customerName);
    await dialog.getByTestId("new-customer-phone").fill("8083323232");
    await expect(dialog.getByTestId("new-customer-phone")).toHaveValue("(808) 332-3232");
    await dialog.getByTestId("new-customer-email").fill("debbie@example.com");
    await dialog.getByTestId("new-customer-address").fill(street);
    await dialog.getByTestId("new-customer-city").fill("Honolulu");
    await dialog.getByTestId("new-customer-state").fill("HI");
    await dialog.getByTestId("new-customer-zip").fill("96813");
    await dialog.getByTestId("new-customer-contact-person").fill("Debbie");
    await dialog.getByTestId("new-customer-company-name").fill("Debbie Bergase LLC");
    await dialog.getByTestId("new-customer-notes").fill("Gate code and preferred contact time");

    await dialog.getByTestId("new-customer-save").click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect(page.getByRole("button", { name: new RegExp(customerName) })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByPlaceholder("Client or company name")).toHaveValue(customerName, {
      timeout: 60_000,
    });

    await page.getByPlaceholder("Luxury Villa E").fill(projectName);
    await page.locator("#project-address").click();
    const addressDialog = page.getByRole("dialog", { name: "Address details" });
    await expect(addressDialog).toBeVisible({ timeout: 60_000 });
    await addressDialog.getByLabel("Street address").fill(street);
    await addressDialog.getByRole("button", { name: "Save address" }).click();
    await expect(addressDialog).toBeHidden({ timeout: 60_000 });

    await page.locator('input[name="budget"]').fill("125000");
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page).toHaveURL(/\/projects(?:[/?#]|$)/, { timeout: 60_000 });

    const search = page.getByTestId("projects-list-search-desktop");
    await expect(search).toBeVisible({ timeout: 60_000 });
    await search.fill(projectName);
    await page
      .getByRole("link", { name: `Open project ${projectName}` })
      .first()
      .click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+/, { timeout: 60_000 });

    await expect(page.getByRole("link", { name: customerName }).first()).toBeVisible({
      timeout: 60_000,
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: customerName }).first()).toBeVisible({
      timeout: 60_000,
    });
  });
});
