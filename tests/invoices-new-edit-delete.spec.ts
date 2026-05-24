import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();

function getInvoiceDetailUrl(currentUrl: string): string {
  const match = currentUrl.match(/\/financial\/invoices\/([^/?#]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not determine invoice id from URL: ${currentUrl}`);
  }
  return `/financial/invoices/${match[1]}`;
}

async function clickInvoiceDetailMenuItem(page: Page, name: string): Promise<void> {
  const openItem = page.getByRole("menuitem", { name });
  try {
    await openItem.click({ timeout: 2_000 });
    return;
  } catch {
    // The detail More menu can remain open after dialogs close.
  }
  await page.getByRole("button", { name: /More/i }).click();
  await page.getByRole("menuitem", { name }).click();
}

async function cleanupInvoiceClientNames(clientNames: Iterable<string>): Promise<void> {
  const names = Array.from(clientNames);
  if (names.length === 0) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const { data } = await supabase.from("invoices").select("id").in("client_name", names);
  const invoiceIds = (data ?? []).map((row: { id: string }) => row.id).filter(Boolean);
  if (invoiceIds.length === 0) return;

  await supabase.from("invoice_payments").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoice_items").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoices").delete().in("id", invoiceIds);
}

async function selectE2EProject(page: Page): Promise<void> {
  const projectSelect = page.getByTestId("invoice-new-project-select");
  await expect(projectSelect).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    const optionCount = await projectSelect.locator("option").count();
    expect(optionCount).toBeGreaterThan(1);
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });

  const optionLabels = await projectSelect.locator("option").allTextContents();
  if (optionLabels.some((label) => label.trim() === E2E_PRESERVED_PROJECT_LABEL)) {
    await projectSelect.selectOption({ label: E2E_PRESERVED_PROJECT_LABEL });
  } else {
    await projectSelect.selectOption({ index: 1 });
  }
}

test.afterEach(async () => {
  await cleanupInvoiceClientNames(createdClientNames);
  createdClientNames.clear();
});

test("creates, edits, cancels, saves, voids, and deletes an invoice", async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = Date.now();
  const clientName = `PW Invoice E2E ${suffix}`;
  const canceledClientName = `${clientName} CANCELLED`;
  const savedClientName = `${clientName} SAVED`;
  const lineDescription = `PW line ${suffix}`;
  const savedLineDescription = `${lineDescription} saved`;
  createdClientNames.add(clientName);
  createdClientNames.add(canceledClientName);
  createdClientNames.add(savedClientName);

  await page.goto("/finance");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText("Something went wrong");

  const invoicesLinks = page.locator('main a[href="/financial/invoices"]');
  await expect(invoicesLinks.first()).toBeVisible({ timeout: 30_000 });
  await invoicesLinks.first().click();
  await expect(page).toHaveURL(/\/financial\/invoices(?:[/?#]|$)/, { timeout: 30_000 });

  const newInvoiceLink = page.locator('main a[href="/financial/invoices/new"]').first();
  await expect(newInvoiceLink).toBeVisible({ timeout: 30_000 });
  await newInvoiceLink.click();
  await expect(page).toHaveURL(/\/financial\/invoices\/new(?:[/?#]|$)/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await expect(page.getByText("Project is required.").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Client name is required.").first()).toBeVisible();
  await expect(page.getByText("At least one line item is required.").first()).toBeVisible();

  await selectE2EProject(page);
  await page.getByPlaceholder("Client").fill(clientName);
  await page.getByLabel("Line item 1 description").fill(lineDescription);
  await page.getByLabel("Line item 1 quantity").fill("2");
  await page.getByLabel("Line item 1 rate").fill("125.5");

  await page.getByRole("button", { name: "Add another item" }).click();
  await expect(page.getByLabel("Line item 2 description")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Remove line item" }).last().click();
  await expect(page.getByLabel("Line item 2 description")).toHaveCount(0);

  const createButton = page.getByRole("button", { name: "Create draft invoice" });
  await expect(createButton).toBeEnabled({ timeout: 15_000 });
  await createButton.click();
  await expect(page).toHaveURL(/\/financial\/invoices\/(?!new(?:\/|$))[^/?#]+/, {
    timeout: 30_000,
  });
  await expect(page.getByText(clientName).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(lineDescription)).toBeVisible({ timeout: 30_000 });

  const detailUrl = getInvoiceDetailUrl(page.url());
  await page.goto("/financial/invoices");
  await page.waitForLoadState("domcontentloaded");
  const listSearch = page.locator('input[placeholder*="Invoice #"]:visible').first();
  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(clientName);
  await expect(page.getByText(clientName).first()).toBeVisible({ timeout: 30_000 });

  await page.goto(detailUrl);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("Client").fill(canceledClientName);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(clientName).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(canceledClientName)).toHaveCount(0);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("Client").fill(savedClientName);
  await page.getByLabel("Line item 1 description").fill(savedLineDescription);
  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled({ timeout: 10_000 });
  await saveButton.click();
  await expect(page.getByText(savedClientName).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(savedLineDescription)).toBeVisible({ timeout: 30_000 });
  const invoiceNumber = (await page.getByRole("heading", { level: 1 }).textContent())?.trim();
  expect(invoiceNumber).toBeTruthy();

  await clickInvoiceDetailMenuItem(page, "Delete Invoice");
  const blockedDeleteDialog = page.getByRole("dialog", { name: "Cannot delete invoice" });
  await expect(blockedDeleteDialog).toBeVisible({ timeout: 10_000 });
  await expect(blockedDeleteDialog).toContainText(
    "Only voided invoices can be permanently deleted"
  );
  await blockedDeleteDialog.getByRole("button", { name: "OK" }).click();
  await expect(blockedDeleteDialog).toBeHidden({ timeout: 10_000 });

  await clickInvoiceDetailMenuItem(page, "Void Invoice");
  const voidDialog = page.getByRole("dialog", { name: "Void invoice?" });
  await expect(voidDialog).toBeVisible({ timeout: 10_000 });
  await voidDialog.getByRole("button", { name: "Void" }).click();
  await expect(page.getByTestId("invoice-detail-status")).toContainText(/void/i, {
    timeout: 30_000,
  });

  const openDeleteItem = page.getByRole("menuitem", { name: "Delete Invoice" });
  if (await openDeleteItem.isVisible().catch(() => false)) {
    await openDeleteItem.click();
  } else {
    await clickInvoiceDetailMenuItem(page, "Delete Invoice");
  }
  let deleteDialog = page.getByRole("dialog", { name: "Delete voided invoice?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await expect(deleteDialog).toContainText("no active payment links");
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(deleteDialog).toBeHidden({ timeout: 10_000 });

  await clickInvoiceDetailMenuItem(page, "Delete Invoice");
  deleteDialog = page.getByRole("dialog", { name: "Delete voided invoice?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await deleteDialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices(?:[?#]|$)/, { timeout: 30_000 });

  await page.goto("/financial/invoices");
  await page.waitForLoadState("domcontentloaded");
  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(savedClientName);
  await expect(page.getByText(savedClientName)).toHaveCount(0, { timeout: 30_000 });
});

test("keeps invoice actions usable on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/financial/invoices");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText("Something went wrong");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('a[href="/financial/invoices/new"]:visible').first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/financial/invoices/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Add another item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create draft invoice" })).toBeVisible();

  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await expect(page.getByText("Project is required.").first()).toBeVisible();
  await expect(page.getByText("Client name is required.").first()).toBeVisible();
  await expect(page.getByText("At least one line item is required.").first()).toBeVisible();
});
