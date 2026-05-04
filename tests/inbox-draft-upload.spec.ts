/**
 * Inbox draft upload (financial): receipt → draft on Inbox, modal edit, Approve → Expenses archive.
 * Does not cover worker /upload-receipt, reimbursement, or commission flows.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID, E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
  dialogPaymentAccountSelect,
  expenseListRow,
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
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });

    await waitForExpensesQuerySuccess(page, 90_000);

    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (adminUrl && adminKey) {
      const admin = createClient(adminUrl, adminKey);
      const { data: rows } = await admin
        .from("expenses")
        .select("id,status,reference_no,created_at")
        .like("reference_no", "INBOX-UP%")
        .order("created_at", { ascending: false })
        .limit(5);
      const hit = (rows ?? []).find((r: { reference_no?: string }) =>
        String(r.reference_no ?? "").startsWith("INBOX-UP-")
      );
      expect(hit, "expected INBOX-UP- draft expense row").toBeTruthy();
      const st = String((hit as { status?: string }).status ?? "").toLowerCase();
      expect(["draft", "needs_review"].includes(st)).toBeTruthy();
      const ref = String((hit as { reference_no?: string }).reference_no ?? "");
      expect(ref).toMatch(/^INBOX-UP-[a-f0-9]{64}$/);
    }

    /** Inbox upload drafts: `data-inbox-upload-draft` on the row (read-only badges; edit in modal). */
    const inboxDraftRow = page.locator(".exp-row[data-inbox-upload-draft]");
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

    const classificationGrid = expenseDialog
      .getByRole("heading", { name: "Classification" })
      .locator("xpath=following::div[contains(@class,'grid')][1]");
    await classificationGrid.locator('button[role="combobox"]').first().click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();

    await classificationGrid.locator('button[role="combobox"]').nth(1).click();
    await page.getByRole("option", { name: "Materials", exact: true }).click();

    await pickOrCreatePaymentInSelect(page, dialogPaymentAccountSelect(expenseDialog, page));

    await expenseDialog.getByRole("button", { name: /^Save$/ }).click();
    await expect(expenseDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
      timeout: 60_000,
    });

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
    await expect(expenseListRow(page, E2E_PRESERVED_PROJECT_LABEL)).toBeVisible({
      timeout: 120_000,
    });

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
