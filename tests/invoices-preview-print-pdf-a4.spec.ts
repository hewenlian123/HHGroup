import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdInvoiceNos = new Set<string>();

function invoiceIdFromUrl(url: string): string {
  const match = url.match(/\/financial\/invoices\/([^/?#]+)/);
  if (!match?.[1] || match[1] === "new") {
    throw new Error(`Could not determine invoice id from URL: ${url}`);
  }
  return match[1];
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

async function fillInvoice(page: Page, invoiceNo: string, clientName: string): Promise<string> {
  await page.goto("/financial/invoices/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible({
    timeout: 30_000,
  });
  const projectLabel = await selectE2EProject(page);

  await page.getByTestId("invoice-new-number-input").fill(invoiceNo);
  await page.getByTestId("invoice-new-client-input").fill(clientName);
  await page.getByTestId("invoice-new-due-date-input").fill("2026-06-30");

  const lines = [
    ["Start Work / Mobilization", "1", "500"],
    ["Demolition / Grading", "1", "1500"],
    ["Foundation Preparation", "1", "2000"],
  ] as const;

  for (const [index, [item, qty, rate]] of lines.entries()) {
    if (index > 0) await page.getByRole("button", { name: "Add another item" }).click();
    const lineNo = index + 1;
    await page.getByTestId(`invoice-new-line-${lineNo}-item-input`).fill(item);
    await page.getByTestId(`invoice-new-line-${lineNo}-qty-input`).fill(qty);
    await page.getByTestId(`invoice-new-line-${lineNo}-rate-input`).fill(rate);
  }

  return projectLabel;
}

async function expectInvoiceDocument(
  page: Page,
  expected: {
    invoiceNo: string;
    clientName: string;
    projectLabel: string;
    total: string;
  }
): Promise<void> {
  const document = page.getByTestId("invoice-preview-document");
  await expect(document).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invoice-preview-number")).toContainText(expected.invoiceNo);
  await expect(page.getByTestId("invoice-preview-client")).toContainText(expected.clientName);
  await expect(page.getByTestId("invoice-preview-project")).toContainText(expected.projectLabel);
  await expect(document).toContainText("Start Work / Mobilization");
  await expect(document).toContainText("Demolition / Grading");
  await expect(document).toContainText("Foundation Preparation");
  await expect(page.getByTestId("invoice-preview-total")).toContainText(expected.total);
  await expect(page.getByTestId("invoice-preview-balance")).toContainText(expected.total);
}

test.afterEach(async () => {
  await cleanupInvoices();
  createdClientNames.clear();
  createdInvoiceNos.clear();
});

test("invoice preview, print, and PDF use fresh A4 invoice document output", async ({ page }) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const staleInvoiceNo = `A4-OLD-${suffix}`;
  const staleClient = `TEST Invoice Preview A4 Old Customer - safe to delete ${suffix}`;
  const invoiceNo = `A4-INV-${suffix}`;
  const clientName = `TEST Invoice Preview A4 Customer - safe to delete ${suffix}`;
  createdInvoiceNos.add(staleInvoiceNo);
  createdInvoiceNos.add(invoiceNo);
  createdClientNames.add(staleClient);
  createdClientNames.add(clientName);

  const staleProjectLabel = await fillInvoice(page, staleInvoiceNo, staleClient);
  await page.getByRole("button", { name: "Create draft invoice", exact: true }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/(?!new(?:\/|$))[^/]+\/preview/, {
    timeout: 30_000,
  });
  await expectInvoiceDocument(page, {
    invoiceNo: staleInvoiceNo,
    clientName: staleClient,
    projectLabel: staleProjectLabel,
    total: "$4,000.00",
  });

  const projectLabel = await fillInvoice(page, invoiceNo, clientName);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("invoice-detail")).toBeVisible({ timeout: 30_000 });
  const invoiceId = invoiceIdFromUrl(page.url());

  await page.getByTestId("invoice-detail-preview-link").click({ noWaitAfter: true });
  const samples: Array<{ url: string; text: string }> = [];
  for (let i = 0; i < 24; i += 1) {
    await page.waitForTimeout(25);
    samples.push({ url: page.url(), text: await page.locator("body").innerText() });
  }
  await expect(page).toHaveURL(new RegExp(`/financial/invoices/${invoiceId}/preview`), {
    timeout: 30_000,
  });
  await expectInvoiceDocument(page, {
    invoiceNo,
    clientName,
    projectLabel,
    total: "$4,000.00",
  });
  expect(
    samples.some((sample) => sample.url.includes("/preview") && sample.text.includes(staleClient))
  ).toBe(false);

  const previewDocument = page.getByTestId("invoice-preview-document");
  const previewPaper = await previewDocument.evaluate((node) => {
    const styleText = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    const bodyStyles = window.getComputedStyle(document.body);
    return {
      width: rect.width,
      minHeight: Number.parseFloat(styles.minHeight),
      background: styles.backgroundColor,
      bodyBackground: bodyStyles.backgroundColor,
      styleText,
    };
  });
  expect(previewPaper.width).toBeGreaterThan(760);
  expect(previewPaper.width).toBeLessThan(820);
  expect(previewPaper.minHeight).toBeGreaterThan(1060);
  expect(previewPaper.background).toBe("rgb(255, 255, 255)");
  expect(previewPaper.bodyBackground).not.toBe("rgb(0, 0, 0)");
  expect(previewPaper.styleText).toContain("size: A4");
  expect(previewPaper.styleText).toContain("margin: 14mm");

  await page.goto(`/financial/invoices/${invoiceId}/print`, { waitUntil: "domcontentloaded" });
  await expectInvoiceDocument(page, {
    invoiceNo,
    clientName,
    projectLabel,
    total: "$4,000.00",
  });
  const printPaper = await page.getByTestId("invoice-preview-document").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      text: node.textContent ?? "",
    };
  });
  expect(printPaper.width).toBeGreaterThan(760);
  expect(printPaper.width).toBeLessThan(820);
  expect(printPaper.text).toContain("Balance due");

  await page.goto(`/financial/invoices/${invoiceId}/preview`, { waitUntil: "domcontentloaded" });
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Invoice-.*\.pdf$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/financial/invoices/${invoiceId}/preview`, { waitUntil: "domcontentloaded" });
  await expectInvoiceDocument(page, {
    invoiceNo,
    clientName,
    projectLabel,
    total: "$4,000.00",
  });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 4
  );
  expect(hasHorizontalOverflow).toBe(false);
});
