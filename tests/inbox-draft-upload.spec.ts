/**
 * Inbox draft upload (financial): receipt → draft on Inbox, modal edit, Approve → Expenses archive.
 * Does not cover worker /upload-receipt, reimbursement, or commission flows.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID, E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  attachmentPreviewModal,
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
  dialogPaymentAccountSelect,
  expenseListRow,
  expensesVendorSearch,
  pickOrCreatePaymentInSelect,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

/**
 * Dedupe is SHA-256 of the uploaded file after prep. PNG images compress to a deterministic JPEG,
 * so repeated 1×1 PNGs collide across runs. PDF is not recompressed; embed a unique payload.
 */
function uniqueReceiptPdfBytes(runId: number): Buffer {
  const noise = `E2E-INBOX-UP-${runId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.from(noise, "utf8"),
    Buffer.from("\n%%EOF\n"),
  ]);
}

const TECHNICAL_RECEIPT_REF_RE = /\b(?:INBOX-UP-[a-f0-9]{12,}|sha256|[a-f0-9]{14,})\b/i;

async function expectCleanExpenseRow(row: import("@playwright/test").Locator): Promise<void> {
  const rowText = await row.innerText();
  expect(rowText).toContain("Lowe's");
  expect(rowText).not.toMatch(TECHNICAL_RECEIPT_REF_RE);
  expect(rowText).not.toMatch(/INBOX-UP-/i);

  const secondaryLine = ((await row.locator("p").nth(1).textContent()) ?? "").trim();
  expect(secondaryLine).toMatch(/^[A-Z][a-z]{2} \d{1,2}(?:, \d{4})? · Amex · Receipt$/);
}

async function fetchCanonicalExpenseCost(
  page: import("@playwright/test").Page,
  projectId: string
): Promise<number> {
  const base = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const res = await page.request.get(`${base}/api/projects/${projectId}/tab?key=financial`);
  if (!res.ok()) {
    return NaN;
  }
  const j = (await res.json()) as { canonical?: { expenseCost?: number } };
  return Number(j.canonical?.expenseCost ?? NaN);
}

test.describe("Inbox draft upload receipt", () => {
  test.describe.configure({ timeout: 300_000, retries: 0, mode: "serial" });

  test("upload → draft on Inbox → modal edit → approve on archive; duplicate blocked; draft excluded from canonical cost until approve", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured.");
    }

    const baselineCost = await fetchCanonicalExpenseCost(page, E2E_PRESERVED_PROJECT_ID);
    if (Number.isNaN(baselineCost)) {
      test.skip(true, "GET /api/projects/.../tab?key=financial not available (auth or server).");
    }

    const ts = Date.now();
    const vendorName = `Lowe's Flow Z${ts.toString(36).toUpperCase()}`;
    const filePayload = {
      name: `inbox-draft-${ts}.pdf`,
      mimeType: "application/pdf",
      buffer: uniqueReceiptPdfBytes(ts),
    };

    await page.getByRole("button", { name: /upload receipt/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /upload receipt/i })).toBeVisible({
      timeout: 15_000,
    });
    await dialog.locator('input[type="file"][multiple]').setInputFiles(filePayload);
    await expect(dialog.getByText(/Selected receipts/i)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(new RegExp(`inbox-draft-${ts}\\.pdf`))).toBeVisible({
      timeout: 15_000,
    });
    await dialog.getByRole("button", { name: /Confirm Upload \(1\)/ }).click();

    await expect(
      page
        .locator('[role="status"]')
        .filter({ hasText: /Added \d+ draft(?:s)? to Inbox|Already uploaded/i })
    ).toBeVisible({ timeout: 120_000 });
    await expect(page).toHaveURL(/[?&]highlight=INBOX-UP-[a-f0-9]+/i, { timeout: 30_000 });
    const uploadedInboxRef = new URL(page.url()).searchParams.get("highlight")?.split(",")[0];
    expect(uploadedInboxRef).toMatch(/^INBOX-UP-[a-f0-9]{64}$/);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });

    await waitForExpensesQuerySuccess(page, 90_000);

    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    let uploadedExpenseId: string | null = null;
    if (adminUrl && adminKey) {
      const admin = createClient(adminUrl, adminKey);
      const { data: hit } = await admin
        .from("expenses")
        .select("id,status,reference_no,receipt_url,created_at")
        .eq("reference_no", uploadedInboxRef!)
        .maybeSingle();
      expect(hit, "expected INBOX-UP- draft expense row").toBeTruthy();
      uploadedExpenseId = String((hit as { id?: string }).id ?? "") || null;
      const st = String((hit as { status?: string }).status ?? "").toLowerCase();
      expect(["draft", "needs_review"].includes(st)).toBeTruthy();
      const ref = String((hit as { reference_no?: string }).reference_no ?? "");
      expect(ref).toBe(uploadedInboxRef);
      expect(String((hit as { receipt_url?: string | null }).receipt_url ?? "")).toContain(
        "/receipts/"
      );
    }

    /** Inbox upload drafts: `data-inbox-upload-draft` on the row (read-only badges; edit in modal). */
    const inboxDraftRow = uploadedExpenseId
      ? page.locator(`.exp-row[data-expense-id="${uploadedExpenseId}"]`)
      : page.locator(".exp-row[data-inbox-upload-draft]");
    await expect(inboxDraftRow.first()).toBeVisible({ timeout: 60_000 });
    const costWhileDraft = await fetchCanonicalExpenseCost(page, E2E_PRESERVED_PROJECT_ID);
    expect(Math.abs(costWhileDraft - baselineCost)).toBeLessThan(0.02);

    await inboxDraftRow.first().click();
    const expenseDialog = page.getByRole("dialog");
    await expect(expenseDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
      timeout: 15_000,
    });
    await expenseDialog.getByRole("button", { name: /^Edit$/ }).click();
    await expect(expenseDialog.getByRole("heading", { name: /Edit expense/i })).toBeVisible({
      timeout: 15_000,
    });
    await expenseDialog.getByTestId("edit-expense-vendor-input").fill(vendorName);
    await expenseDialog.locator('input[type="number"]').first().fill("12.34");

    const classificationGrid = expenseDialog
      .getByRole("heading", { name: "Classification" })
      .locator("xpath=following::div[contains(@class,'grid')][1]");
    await classificationGrid.locator('button[role="combobox"]').first().click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();

    await classificationGrid.locator('button[role="combobox"]').nth(1).click();
    await page.getByRole("option", { name: "Materials", exact: true }).click();

    await expenseDialog.locator("#edit-expense-payment-method-select").click();
    await page.getByRole("option", { name: "Amex", exact: true }).click();

    await pickOrCreatePaymentInSelect(page, dialogPaymentAccountSelect(expenseDialog, page));

    await expenseDialog.getByRole("button", { name: /^Save$/ }).click();
    await expect(expenseDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(expenseDialog.getByText(vendorName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(expenseDialog.getByText(/HH Unified/)).toBeVisible({ timeout: 15_000 });

    await expenseDialog.getByRole("button", { name: /^Approve$/ }).click();

    await expect
      .poll(async () => fetchCanonicalExpenseCost(page, E2E_PRESERVED_PROJECT_ID), {
        timeout: 120_000,
      })
      .toBeGreaterThanOrEqual(baselineCost + 0.005);

    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await waitForExpensesQuerySuccess(page, 90_000);
    await expensesVendorSearch(page).fill(vendorName);
    const archiveRow = expenseListRow(page, vendorName);
    await expect(archiveRow).toBeVisible({ timeout: 120_000 });
    await expectCleanExpenseRow(archiveRow);

    await archiveRow.click();
    const archiveDialog = page.getByRole("dialog");
    await expect(archiveDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
      timeout: 15_000,
    });
    await archiveDialog.getByRole("button", { name: /^Edit$/ }).click();
    await expect(archiveDialog.getByRole("heading", { name: /Edit expense/i })).toBeVisible({
      timeout: 15_000,
    });

    const attachmentsGroup = archiveDialog.getByRole("group", { name: "Attachments" });
    await expect(
      attachmentsGroup.getByTestId("edit-expense-existing-attachment").first()
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(attachmentsGroup.getByText(/^Add receipt$/)).toHaveCount(0);

    await attachmentsGroup
      .getByRole("button", { name: /^Open / })
      .first()
      .click();
    const preview = attachmentPreviewModal(page);
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("#attachment-preview-title")).toBeVisible({ timeout: 10_000 });
    await preview.getByRole("button", { name: /^Close$/ }).click();
    await expect(preview).toBeHidden({ timeout: 15_000 });

    await archiveDialog.getByRole("button", { name: /^Save$/ }).click();
    await expect(archiveDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
      timeout: 60_000,
    });
    await archiveDialog
      .getByRole("button", { name: /^Close$/ })
      .last()
      .click();
    await expect(archiveDialog).toBeHidden({ timeout: 15_000 });
    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await waitForExpensesQuerySuccess(page, 90_000);
    await expensesVendorSearch(page).fill(vendorName);
    const archiveRowAfterClose = expenseListRow(page, vendorName);
    await expect(archiveRowAfterClose).toBeVisible({ timeout: 120_000 });
    await expectCleanExpenseRow(archiveRowAfterClose);

    if (adminUrl && adminKey) {
      const admin = createClient(adminUrl, adminKey);
      const { data: persisted } = await admin
        .from("expenses")
        .select("id,status,reference_no,receipt_url")
        .eq("reference_no", uploadedInboxRef!)
        .maybeSingle();
      expect(persisted, "approved expense keeps inbox dedupe reference").toBeTruthy();
      expect(String((persisted as { reference_no?: string | null }).reference_no ?? "")).toBe(
        uploadedInboxRef
      );
      expect(String((persisted as { receipt_url?: string | null }).receipt_url ?? "")).toContain(
        "/receipts/"
      );
    }

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page, 90_000);
    await page.getByRole("button", { name: /upload receipt/i }).click();
    const dialog2 = page.getByRole("dialog");
    await dialog2.locator('input[type="file"][multiple]').setInputFiles(filePayload);
    await expect(dialog2.getByText(/Selected receipts/i)).toBeVisible({ timeout: 15_000 });
    await dialog2.getByRole("button", { name: /Confirm Upload \(1\)/ }).click();
    await expect(page.getByText(/already uploaded/i)).toBeVisible({ timeout: 90_000 });
  });

  test("receipt queue page still loads (legacy table)", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
  });
});
