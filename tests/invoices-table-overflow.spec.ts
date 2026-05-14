import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdProjectIds = new Set<string>();
const createdInvoiceIds = new Set<string>();

function getAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase credentials are required for the invoices overflow regression test.");
  }

  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
}

function isoDatePlusDays(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

async function createLongNameInvoiceFixture(): Promise<{
  clientName: string;
  invoiceNo: string;
}> {
  const supabase = getAdminSupabase();
  const suffix = Date.now();
  const projectName = `PW Project Overflow Regression ${suffix} Extremely Long Project Name To Force Desktop Table Truncation And Preserve Actions`;
  const clientName = `PW Client Overflow Regression ${suffix} Extremely Long Client Name To Force Desktop Table Truncation And Keep Due Date Visible`;
  const invoiceNo = `PW-OVF-${suffix}`;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: projectName,
      status: "active",
      budget: 0,
      spent: 0,
    })
    .select("id")
    .single();

  if (projectError || !project?.id) {
    throw new Error(projectError?.message ?? "Failed to create project fixture.");
  }
  createdProjectIds.add(project.id);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_no: invoiceNo,
      project_id: project.id,
      client_name: clientName,
      issue_date: isoDatePlusDays(-2),
      due_date: isoDatePlusDays(21),
      status: "Sent",
      subtotal: 250,
      tax_amount: 0,
      total: 250,
      paid_total: 0,
      balance_due: 250,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice?.id) {
    throw new Error(invoiceError?.message ?? "Failed to create invoice fixture.");
  }
  createdInvoiceIds.add(invoice.id);

  return { clientName, invoiceNo };
}

async function cleanupFixtures(): Promise<void> {
  const invoiceIds = Array.from(createdInvoiceIds);
  const projectIds = Array.from(createdProjectIds);
  if (invoiceIds.length === 0 && projectIds.length === 0) return;

  const supabase = getAdminSupabase();

  if (invoiceIds.length > 0) {
    await supabase.from("invoices").delete().in("id", invoiceIds);
  }

  if (projectIds.length > 0) {
    await supabase.from("projects").delete().in("id", projectIds);
  }
}

test.afterAll(async () => {
  await cleanupFixtures();
});

test("keeps premium invoice rows usable with long client and project names", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await createLongNameInvoiceFixture();

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/financial/invoices");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).not.toContainText("Something went wrong");

  const searchInput = page.locator('input[placeholder*="Invoice #"]:visible').first();
  await expect(searchInput).toBeVisible({ timeout: 30_000 });
  await searchInput.fill(fixture.clientName);

  const row = page.getByTestId(`invoice-row-${fixture.invoiceNo}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.hover();
  const actionButton = row.getByRole("button", { name: `Actions for ${fixture.invoiceNo}` });
  await expect(actionButton).toBeVisible({ timeout: 30_000 });

  const dueDateLabel = row.getByText(/^Due$/).first();
  await expect(dueDateLabel).toBeVisible({ timeout: 10_000 });

  const layoutMetrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(layoutMetrics.documentWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 1);

  const dueDateBox = await dueDateLabel.boundingBox();
  const actionBox = await actionButton.boundingBox();

  expect(dueDateBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(dueDateBox!.x).toBeGreaterThanOrEqual(0);
  expect(dueDateBox!.x + dueDateBox!.width).toBeLessThanOrEqual(1100);
  expect(actionBox!.x).toBeGreaterThanOrEqual(0);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(1100);

  await actionButton.click();
  await expect(page.getByRole("menuitem", { name: "View" })).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/financial/invoices");
  await page.waitForLoadState("networkidle");
  await expect(searchInput).toBeVisible({ timeout: 30_000 });
  await searchInput.fill(fixture.clientName);

  const mobileCard = page.getByTestId(`invoice-mobile-card-${fixture.invoiceNo}`);
  await expect(mobileCard).toBeVisible({ timeout: 30_000 });
  await expect(mobileCard.getByText(fixture.clientName)).toBeVisible();
  await expect(mobileCard.getByText(fixture.invoiceNo)).toBeVisible();
  await expect(mobileCard.getByRole("link", { name: "Open" })).toBeVisible();

  const mobileLayoutMetrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(mobileLayoutMetrics.documentWidth).toBeLessThanOrEqual(
    mobileLayoutMetrics.viewportWidth + 1
  );
});
