import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdInvoiceNos = new Set<string>();

function formatDateForAssertion(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function invoiceIdFromUrl(url: string): string {
  const match = url.match(/\/financial\/invoices\/([^/?#]+)/);
  if (!match?.[1] || match[1] === "new") {
    throw new Error(`Could not determine invoice id from URL: ${url}`);
  }
  return match[1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function cleanupInvoices(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const ids = new Set<string>();

  const names = Array.from(createdClientNames);
  if (names.length > 0) {
    const { data } = await supabase.from("invoices").select("id").in("client_name", names);
    for (const row of data ?? []) ids.add((row as { id: string }).id);
  }

  const invoiceNos = Array.from(createdInvoiceNos);
  if (invoiceNos.length > 0) {
    const { data } = await supabase.from("invoices").select("id").in("invoice_no", invoiceNos);
    for (const row of data ?? []) ids.add((row as { id: string }).id);
  }

  const invoiceIds = Array.from(ids).filter(Boolean);
  if (invoiceIds.length === 0) return;
  await supabase.from("invoice_payments").delete().in("invoice_id", invoiceIds);
  await supabase.from("payments_received").delete().in("invoice_id", invoiceIds);
  await supabase.from("deposits").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoice_items").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoices").delete().in("id", invoiceIds);
}

async function selectE2EProject(page: Page): Promise<string> {
  const projectSelect = page.getByTestId("invoice-new-project-select");
  await expect(projectSelect).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    const optionCount = await projectSelect.locator("option").count();
    expect(optionCount).toBeGreaterThan(1);
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });

  const labels = (await projectSelect.locator("option").allTextContents()).map((label) =>
    label.trim()
  );
  if (labels.includes(E2E_PRESERVED_PROJECT_LABEL)) {
    await projectSelect.selectOption({ label: E2E_PRESERVED_PROJECT_LABEL });
    return E2E_PRESERVED_PROJECT_LABEL;
  }
  const firstRealLabel = labels.find((label) => label && label !== "Select project");
  await projectSelect.selectOption({ index: 1 });
  return firstRealLabel ?? "";
}

async function fillInvoiceForm(
  page: Page,
  input: {
    invoiceNo: string;
    clientName: string;
    dueDate: string;
    itemName: string;
    description: string;
    qty: string;
    rate: string;
    taxPct?: string;
    notes?: string;
  }
): Promise<string> {
  await page.goto("/financial/invoices/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible({
    timeout: 30_000,
  });

  const projectLabel = await selectE2EProject(page);
  await page.getByTestId("invoice-new-number-input").fill(input.invoiceNo);
  await page.getByTestId("invoice-new-client-input").fill(input.clientName);
  await page.getByTestId("invoice-new-due-date-input").fill(input.dueDate);
  await page.getByTestId("invoice-new-line-1-item-input").fill(input.itemName);
  await page.getByTestId("invoice-new-line-1-description-input").fill(input.description);
  await page.getByTestId("invoice-new-line-1-qty-input").fill(input.qty);
  await page.getByTestId("invoice-new-line-1-rate-input").fill(input.rate);
  if (input.taxPct !== undefined)
    await page.getByTestId("invoice-new-tax-input").fill(input.taxPct);
  if (input.notes !== undefined)
    await page.getByTestId("invoice-new-notes-input").fill(input.notes);
  return projectLabel;
}

async function expectPreviewInvoice(
  page: Page,
  expected: {
    invoiceNo: string;
    clientName: string;
    projectLabel: string;
    dueDate: string;
    itemName: string;
    description: string;
    qty: string;
    rate: string;
    amount: string;
    subtotal: string;
    total: string;
    tax?: string;
  }
): Promise<void> {
  await expect(page.getByTestId("invoice-preview-document")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invoice-preview-document")).not.toContainText("Amount due");
  await expect(page.getByTestId("document-company-name")).toBeVisible();
  await expect(page.getByTestId("invoice-preview-number")).toContainText(expected.invoiceNo);
  await expect(page.getByTestId("invoice-preview-client")).toContainText(expected.clientName);
  await expect(page.getByTestId("invoice-preview-project")).toContainText(expected.projectLabel);
  await expect(page.getByTestId("invoice-preview-due-date")).toContainText(
    formatDateForAssertion(expected.dueDate)
  );
  await expect(page.getByTestId("invoice-preview-line-1-description")).toContainText(
    expected.itemName
  );
  await expect(page.getByTestId("invoice-preview-line-1-description")).toContainText(
    expected.description
  );
  await expect(page.getByTestId("invoice-preview-line-1-qty")).toContainText(expected.qty);
  await expect(page.getByTestId("invoice-preview-line-1-rate")).toContainText(expected.rate);
  await expect(page.getByTestId("invoice-preview-line-1-amount")).toContainText(expected.amount);
  await expect(page.getByTestId("invoice-preview-subtotal")).toContainText(expected.subtotal);
  if (expected.tax)
    await expect(page.getByTestId("invoice-preview-tax")).toContainText(expected.tax);
  await expect(page.getByTestId("invoice-preview-total")).toContainText(expected.total);
  await expect(page.getByTestId("invoice-preview-balance")).toContainText(expected.total);
}

async function openInvoiceFromList(
  page: Page,
  invoiceNo: string,
  clientName: string
): Promise<void> {
  await page.goto("/financial/invoices");
  await page.waitForLoadState("domcontentloaded");
  const search = page.locator('input[placeholder*="Invoice #"]:visible').first();
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(invoiceNo);
  const row = page.getByTestId(`invoice-row-${invoiceNo}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(clientName);
  await row
    .getByRole("button", { name: new RegExp(escapeRegExp(clientName)) })
    .click({ timeout: 10_000 });
  await expect(page.getByTestId("invoice-detail")).toBeVisible({ timeout: 30_000 });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflows = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 4;
  });
  expect(overflows).toBe(false);
}

test.afterEach(async () => {
  await cleanupInvoices();
  createdClientNames.clear();
  createdInvoiceNos.clear();
});

test("create invoice, preview, save, reopen, draft continue, final save, and edit preview", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const invoiceNo = `PW-INV-${suffix}`;
  const clientName = `[E2E] Invoice Client ${suffix}`;
  const itemName = `PW Rough carpentry ${suffix}`;
  const description = `Install blocking and trim ${suffix}`;
  const dueDate = "2026-06-30";
  createdInvoiceNos.add(invoiceNo);
  createdClientNames.add(clientName);

  const projectLabel = await fillInvoiceForm(page, {
    invoiceNo,
    clientName,
    dueDate,
    itemName,
    description,
    qty: "2",
    rate: "125.50",
    taxPct: "7.5",
    notes: "Net 15 after approval",
  });

  await page.getByRole("button", { name: "Create draft invoice", exact: true }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/(?!new(?:\/|$))[^/]+\/preview/, {
    timeout: 30_000,
  });
  await expectPreviewInvoice(page, {
    invoiceNo,
    clientName,
    projectLabel,
    dueDate,
    itemName,
    description,
    qty: "2",
    rate: "$125.50",
    amount: "$251.00",
    subtotal: "$251.00",
    tax: "$18.83",
    total: "$269.83",
  });
  await expect(page.locator("body")).not.toContainText("2026-06-30");

  const invoiceId = invoiceIdFromUrl(page.url());
  await page.getByTestId("invoice-preview-back-link").click();
  await expect(page).toHaveURL(new RegExp(`/financial/invoices/${invoiceId}(?:[?#].*)?$`), {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Draft");
  await expect(page.getByTestId("invoice-detail-line-1-description")).toContainText(itemName);
  await expect(page.getByTestId("invoice-detail-line-1-description")).toContainText(description);
  await expect(page.getByTestId("invoice-detail-total")).toContainText("$269.83");

  await openInvoiceFromList(page, invoiceNo, clientName);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(invoiceNo);
  await expect(page.getByTestId("invoice-detail-line-1-amount")).toContainText("$251.00");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/financial/invoices/new");
  await expect(page.getByTestId("invoice-new-project-select")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invoice-new-client-input")).toBeVisible();
  await expect(page.getByTestId("invoice-new-due-date-input")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto(`/financial/invoices/${invoiceId}/preview`);
  await expect(page.getByTestId("invoice-preview-back-link")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invoice-preview-document")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  const draftInvoiceNo = `PW-DRAFT-${suffix}`;
  const draftClient = `[E2E] Draft Invoice Client ${suffix}`;
  const draftItem = `PW Draft item ${suffix}`;
  const draftDescription = `Draft scope saved before final details ${suffix}`;
  const draftUpdatedDescription = `Updated final scope ${suffix}`;
  const draftUpdatedDueDate = "2026-07-15";
  createdInvoiceNos.add(draftInvoiceNo);
  createdClientNames.add(draftClient);

  const draftProjectLabel = await fillInvoiceForm(page, {
    invoiceNo: draftInvoiceNo,
    clientName: draftClient,
    dueDate: "2026-07-01",
    itemName: draftItem,
    description: draftDescription,
    qty: "1",
    rate: "50",
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("invoice-detail")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Draft");
  await expect(page.getByTestId("invoice-detail-line-1-description")).toContainText(draftItem);
  await expect(page.getByTestId("invoice-detail-line-1-description")).toContainText(
    draftDescription
  );
  await expect(page.getByTestId("invoice-detail-total")).toContainText("$50.00");
  const draftId = invoiceIdFromUrl(page.url());

  await openInvoiceFromList(page, draftInvoiceNo, draftClient);
  await page.getByRole("button", { name: "Edit Draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/financial/invoices/${draftId}/edit`), {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-edit-number-input")).toHaveValue(draftInvoiceNo);
  await expect(page.getByTestId("invoice-edit-client-input")).toHaveValue(draftClient);
  await expect(page.getByTestId("invoice-edit-line-1-item-input")).toHaveValue(draftItem);
  await expect(page.getByTestId("invoice-edit-line-1-description-input")).toHaveValue(
    draftDescription
  );
  await page.getByTestId("invoice-edit-due-date-input").fill(draftUpdatedDueDate);
  await page.getByTestId("invoice-edit-line-1-description-input").fill(draftUpdatedDescription);
  await page.getByTestId("invoice-edit-line-1-qty-input").fill("3");
  await page.getByTestId("invoice-edit-line-1-rate-input").fill("75");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/financial/invoices/${draftId}(?:[?#].*)?$`), {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-detail-line-1-description")).toContainText(draftItem);
  await expect(page.getByTestId("invoice-detail-line-1-description")).toContainText(
    draftUpdatedDescription
  );
  await expect(page.getByTestId("invoice-detail-line-1-qty")).toContainText("3");
  await expect(page.getByTestId("invoice-detail-line-1-rate")).toContainText("$75.00");
  await expect(page.getByTestId("invoice-detail-total")).toContainText("$225.00");

  await page.getByTestId("invoice-detail-preview-link").click();
  await expectPreviewInvoice(page, {
    invoiceNo: draftInvoiceNo,
    clientName: draftClient,
    projectLabel: draftProjectLabel,
    dueDate: draftUpdatedDueDate,
    itemName: draftItem,
    description: draftUpdatedDescription,
    qty: "3",
    rate: "$75.00",
    amount: "$225.00",
    subtotal: "$225.00",
    total: "$225.00",
  });

  await page.getByTestId("invoice-preview-back-link").click();
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Draft", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Mark as sent" }).click();
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Unpaid", {
    timeout: 30_000,
  });
});
