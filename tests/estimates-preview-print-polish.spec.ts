import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "./estimate-playwright-test";
import { createClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates");
});

function ensureScreenshotDir(): void {
  mkdirSync("test-results", { recursive: true });
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
  await supabase.from("estimate_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_categories").delete().in("estimate_id", ids);
  await supabase.from("estimate_meta").delete().in("estimate_id", ids);
  await deleteLocalEstimateFixtureGraphs(ids);
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
  await dialog.getByPlaceholder("Site or client address").fill("123 Proposal Polish Lane");
  await dialog.getByRole("radio", { name: "Proposal" }).check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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

async function addPaymentMilestone(page: Page, title: string, description: string): Promise<void> {
  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Payment Name").fill(title);
  await dialog.getByLabel("Description").fill(description);
  await dialog.getByLabel("% of estimate").fill("25");
  await expect
    .poll(async () => dialog.getByLabel("Amount").inputValue(), { timeout: 10_000 })
    .not.toBe("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function prepareCustomerDocumentScreenshot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page
    .getByText("System issue detected")
    .waitFor({ state: "hidden", timeout: 12_000 })
    .catch(() => undefined);
  await page.getByTestId("estimate-document").scrollIntoViewIfNeeded();
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("customer estimate preview and print use polished proposal output", async ({ page }) => {
  test.setTimeout(180_000);
  ensureScreenshotDir();

  const suffix = Date.now();
  const clientName = `PW Estimate Polish ${suffix}`;
  const projectName = `PW Estimate Polish Project ${suffix}`;
  const lineTitle = `PW hidden proposal line ${suffix}`;
  const noteText = `Owner to confirm finish selections before procurement ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoWithE2EAuth(page, "/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  await addBlankEstimateSection(page);
  await page.getByLabel("Line item 1 title").locator("visible=true").fill(lineTitle);
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("5000");

  await page.getByRole("button", { name: "More actions" }).locator("visible=true").first().click();
  const setStatusItem = page.getByRole("menuitem", { name: "Set status" });
  await setStatusItem.focus();
  await page.keyboard.press("ArrowRight");
  const optionalStatusItem = page.getByRole("menuitem", { name: "Optional" });
  await expect(optionalStatusItem).toBeVisible();
  await optionalStatusItem.focus();
  await optionalStatusItem.press("Enter");
  await expect(
    page.locator(".eb-line-item-status-pill:visible", { hasText: "Optional" }).first()
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("menuitem", { name: "Assumptions" }).click();
  await page.getByLabel("Assumptions body").fill(noteText);

  await addPaymentMilestone(page, "Deposit", "Due before work starts");

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();

  await gotoWithE2EAuth(page, `/estimates/${estimateId}/preview`);
  const downloadPdfLink = page.getByRole("link", { name: "Download PDF" });
  await expect(downloadPdfLink).toHaveAttribute("href", `/api/estimates/${estimateId}/pdf`);
  await expect(downloadPdfLink).toHaveAttribute("download", "");

  const pdfResponse = await page.request.get(`/api/estimates/${estimateId}/pdf`);
  expect(pdfResponse.ok()).toBe(true);
  expect(pdfResponse.headers()["content-type"] ?? "").toContain("application/pdf");
  expect(pdfResponse.headers()["content-disposition"] ?? "").toMatch(
    /attachment;\s*filename="Estimate-/
  );
  const pdfBytes = await pdfResponse.body();
  expect(pdfBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  expect(pdfBytes.length).toBeGreaterThan(2_000);
  const previewMain = page.locator("main");
  await expect(previewMain).toContainText("Project Proposal");
  await expect(previewMain).toContainText("Luxury Design-Build Proposal");
  await expect(previewMain).toContainText("Prepared for");
  await expect(previewMain).toContainText("Location");
  await expect(previewMain).toContainText(clientName);
  await expect(previewMain).toContainText(projectName);
  await expect(previewMain).toContainText("Optional");
  await expect(previewMain).toContainText("Notes & Clarifications");
  await expect(previewMain).toContainText(noteText);
  await expect(previewMain).toContainText("Payment Schedule");
  await expect(previewMain).toContainText("Deposit");
  const previewPages = page.getByTestId("estimate-preview-page");
  await expect(previewPages.first()).toContainText("Page 1");
  await expect(previewPages.nth(1)).toContainText("Page 2");
  await expect
    .poll(async () => previewPages.count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  const previewPageCount = await previewPages.count();
  await expect
    .poll(async () =>
      previewPages.evaluateAll((pages) =>
        pages.every((page) => page.scrollHeight <= page.clientHeight + 3)
      )
    )
    .toBe(true);
  await expect(previewPages.nth(previewPageCount - 2)).toContainText("Contract Price");
  await expect(previewPages.nth(previewPageCount - 1)).not.toContainText("Contract Price");
  await expect
    .poll(async () =>
      previewPages.first().evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height),
        };
      })
    )
    .toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
  const previewPageSize = await previewPages.first().evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    };
  });
  expect(previewPageSize.width).toBeGreaterThan(700);
  expect(previewPageSize.height).toBeGreaterThan(1050);
  const previewPacket = page.locator(".estimate-final-packet").first();
  await expect(previewPacket).toContainText("Payment Schedule");
  await expect(previewPacket).toContainText("Total scheduled");
  await expect(previewPacket).toContainText("Remaining balance");
  await expect(previewPacket).toContainText("Notes & Clarifications");
  await expect(previewPacket).toContainText("Client Acceptance");
  await expect(previewPacket).toContainText("Client Name");
  await expect(previewPacket).toContainText("Company Representative");
  await expect
    .poll(async () =>
      previewPacket.evaluate((node) => {
        const text = node.textContent ?? "";
        return {
          paymentBeforeNotes:
            text.indexOf("Payment Schedule") < text.indexOf("Notes & Clarifications"),
          notesBeforeSignature:
            text.indexOf("Notes & Clarifications") < text.indexOf("Client Acceptance"),
          breakBefore: window.getComputedStyle(node).breakBefore,
          pageBreakBefore: window.getComputedStyle(node).pageBreakBefore,
        };
      })
    )
    .toMatchObject({
      paymentBeforeNotes: true,
      notesBeforeSignature: true,
      breakBefore: "page",
      pageBreakBefore: "always",
    });
  await expect(previewMain).toContainText("Contract Price");
  const previewSummary = page.getByTestId("estimate-preview-summary");
  await expect(previewSummary).toContainText("Contract Price");
  await expect(previewSummary).not.toContainText("Discount");
  await expect(previewSummary).not.toContainText(/Tax \(/);
  await expect(previewMain).not.toContainText(/undefined|null/i);
  await expect(previewMain).not.toContainText(/markup|overhead|profit/i);

  const previewRow = page.getByTestId("estimate-line-item-output").filter({ hasText: lineTitle });
  await expect(previewRow).toBeVisible({ timeout: 30_000 });
  await expect(previewRow.getByTestId("estimate-line-item-unit-price")).toHaveCount(0);
  await expect(previewRow.getByTestId("estimate-line-item-total")).toHaveCount(0);
  await prepareCustomerDocumentScreenshot(page);
  await page.getByTestId("estimate-document").screenshot({
    path: "test-results/estimate-preview-polished.png",
  });
  await page.getByTestId("estimate-pdf-export").screenshot({
    path: "test-results/estimate-pdf-polished.png",
  });

  await gotoWithE2EAuth(page, `/estimates/${estimateId}/print`);
  const printDocument = page.getByRole("document", { name: "Estimate print view" });
  const printPages = page.getByTestId("estimate-preview-page");
  await expect.poll(async () => printPages.count(), { timeout: 10_000 }).toBe(previewPageCount);
  await expect
    .poll(async () =>
      printPages.evaluateAll((pages) =>
        pages.every((page) => page.scrollHeight <= page.clientHeight + 3)
      )
    )
    .toBe(true);
  await expect(printPages.first()).toContainText("Page 1");
  await expect(printPages.nth(1)).toContainText("Page 2");
  const printPageSize = await printPages.first().evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    };
  });
  expect(printPageSize.width).toBeGreaterThan(700);
  expect(printPageSize.height).toBeGreaterThan(1050);
  await expect(printPages.nth(previewPageCount - 2)).toContainText("Contract Price");
  await expect(printPages.nth(previewPageCount - 1)).not.toContainText("Contract Price");
  await expect(printDocument).toContainText("Project Proposal");
  await expect(printDocument).toContainText("Luxury Design-Build Proposal");
  await expect(printDocument).toContainText("Prepared for");
  await expect(printDocument).toContainText("Location");
  await expect(printDocument).toContainText("Optional");
  await expect(printDocument).toContainText("Notes & Clarifications");
  await expect(printDocument).toContainText(noteText);
  await expect(printDocument).toContainText("Payment Schedule");
  const printPacket = page.locator(".estimate-final-packet").first();
  await expect(printPacket).toContainText("Payment Schedule");
  await expect(printPacket).toContainText("Total scheduled");
  await expect(printPacket).toContainText("Remaining balance");
  await expect(printPacket).toContainText("Notes & Clarifications");
  await expect(printPacket).toContainText("Client Acceptance");
  await expect(printPacket).toContainText("Client Name");
  await expect(printPacket).toContainText("Company Representative");
  await expect
    .poll(async () =>
      printPacket.evaluate((node) => {
        const text = node.textContent ?? "";
        return {
          paymentBeforeNotes:
            text.indexOf("Payment Schedule") < text.indexOf("Notes & Clarifications"),
          notesBeforeSignature:
            text.indexOf("Notes & Clarifications") < text.indexOf("Client Acceptance"),
          breakBefore: window.getComputedStyle(node).breakBefore,
          pageBreakBefore: window.getComputedStyle(node).pageBreakBefore,
        };
      })
    )
    .toMatchObject({
      paymentBeforeNotes: true,
      notesBeforeSignature: true,
      breakBefore: "page",
      pageBreakBefore: "always",
    });
  await expect(printDocument).toContainText("Contract Price");
  await expect(printDocument).not.toContainText(/undefined|null/i);
  await expect(printDocument).not.toContainText(/markup|overhead|profit/i);
  const printRow = page.getByTestId("estimate-line-item-output").filter({ hasText: lineTitle });
  await expect(printRow).toBeVisible({ timeout: 30_000 });
  await expect(printRow.getByTestId("estimate-line-item-unit-price")).toHaveCount(0);
  await expect(printRow.getByTestId("estimate-line-item-total")).toHaveCount(0);
  await prepareCustomerDocumentScreenshot(page);
  await page.getByTestId("estimate-document").screenshot({
    path: "test-results/estimate-print-polished.png",
  });
});
