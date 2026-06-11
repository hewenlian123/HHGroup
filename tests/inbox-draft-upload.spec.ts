/**
 * Inbox draft upload (financial): receipt → draft on Inbox, modal edit, Approve → Expenses archive.
 * Does not cover worker /upload-receipt, reimbursement, or commission flows.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function receiptOcrPngBytes(page: Page, runId: string): Promise<Buffer> {
  const receipt = await page.context().newPage();
  try {
    await receipt.setViewportSize({ width: 640, height: 900 });
    await receipt.setContent(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html, body { margin: 0; background: #f3f4f6; }
            body { font-family: Menlo, Monaco, Consolas, "Courier New", monospace; }
            .wrap { width: 640px; padding: 34px 0; }
            .receipt {
              width: 430px;
              margin: 0 auto;
              background: #fff;
              color: #111;
              padding: 38px 34px;
              box-shadow: 0 8px 30px rgba(0,0,0,.18);
            }
            .center { text-align: center; }
            .brand { font-size: 34px; font-weight: 900; letter-spacing: .08em; }
            .small { font-size: 18px; line-height: 1.35; }
            .line { border-top: 2px dashed #222; margin: 20px 0; }
            .row { display: flex; justify-content: space-between; gap: 18px; font-size: 20px; line-height: 1.55; }
            .total { font-size: 30px; font-weight: 900; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="receipt">
              <div class="center brand">LOWE'S</div>
              <div class="center small">HOME IMPROVEMENT RECEIPT</div>
              <div class="center small">Store 2345 Honolulu HI</div>
              <div class="line"></div>
              <div class="small">Date: 06/10/2026</div>
              <div class="small">Receipt: OCR-E2E-${runId}</div>
              <div class="line"></div>
              <div class="row"><span>Electrical Wire</span><span>$28.99</span></div>
              <div class="row"><span>Outlet Box</span><span>$9.00</span></div>
              <div class="row"><span>Sales Tax</span><span>$4.38</span></div>
              <div class="line"></div>
              <div class="row total"><span>TOTAL</span><span>$42.37</span></div>
              <div class="small">Paid with AMEX card</div>
              <div class="small">Thank you for shopping Lowe's</div>
            </div>
          </div>
        </body>
      </html>`,
      { waitUntil: "load" }
    );
    return (await receipt.screenshot({ fullPage: true })) as Buffer;
  } finally {
    await receipt.close();
  }
}

type InboxOcrDraftSnapshot = {
  id: string;
  vendor: string;
  status: string;
  sourceType: string;
  date: string;
  lineAmount: string;
  category: string;
};

async function loadInboxOcrDraft(
  admin: SupabaseClient,
  referenceNo: string
): Promise<InboxOcrDraftSnapshot | null> {
  const { data: expense, error } = await admin
    .from("expenses")
    .select("id,vendor_name,vendor,status,source_type,expense_date")
    .eq("reference_no", referenceNo)
    .maybeSingle();
  if (error) throw new Error(`load OCR draft expense failed: ${error.message}`);
  if (!expense) return null;
  const id = String((expense as { id: string }).id);
  const { data: line, error: lineError } = await admin
    .from("expense_lines")
    .select("amount,category")
    .eq("expense_id", id)
    .limit(1)
    .maybeSingle();
  if (lineError) throw new Error(`load OCR draft line failed: ${lineError.message}`);
  return {
    id,
    vendor: String(
      (expense as { vendor_name?: string | null; vendor?: string | null }).vendor_name ??
        (expense as { vendor?: string | null }).vendor ??
        ""
    ),
    status: String((expense as { status?: string | null }).status ?? ""),
    sourceType: String((expense as { source_type?: string | null }).source_type ?? ""),
    date: String((expense as { expense_date?: string | null }).expense_date ?? "").slice(0, 10),
    lineAmount: Number((line as { amount?: number | string | null } | null)?.amount ?? 0).toFixed(
      2
    ),
    category: String((line as { category?: string | null } | null)?.category ?? ""),
  };
}

async function cleanupInboxOcrDraft(admin: SupabaseClient, referenceNo: string): Promise<void> {
  const { data: expenses } = await admin
    .from("expenses")
    .select("id")
    .eq("reference_no", referenceNo);
  const ids = (expenses ?? []).map((row) => String((row as { id: string }).id));
  for (const id of ids) {
    const { data: attachments } = await admin
      .from("attachments")
      .select("file_path")
      .eq("entity_type", "expense")
      .eq("entity_id", id);
    const storagePaths = (attachments ?? [])
      .map((row) => String((row as { file_path?: string | null }).file_path ?? ""))
      .filter((p) => p.startsWith("quick-expense/"));
    if (storagePaths.length > 0) {
      await admin.storage.from("expense-attachments").remove(storagePaths);
    }
    await admin.from("attachments").delete().eq("entity_type", "expense").eq("entity_id", id);
    await admin.from("expense_attachments").delete().eq("expense_id", id);
    await admin.from("expense_lines").delete().eq("expense_id", id);
    await admin.from("expenses").delete().eq("id", id);
  }
}

const TECHNICAL_RECEIPT_REF_RE = /\b(?:INBOX-UP-[a-f0-9]{12,}|sha256|[a-f0-9]{14,})\b/i;

async function expectCleanExpenseRow(row: import("@playwright/test").Locator): Promise<void> {
  const rowText = await row.innerText();
  expect(rowText).toContain("Lowe's");
  expect(rowText).not.toMatch(TECHNICAL_RECEIPT_REF_RE);
  expect(rowText).not.toMatch(/INBOX-UP-/i);

  const secondaryLine = ((await row.locator("p").nth(1).textContent()) ?? "").trim();
  expect(secondaryLine).toMatch(/^(?:ACH|Amex|Bank|Card|Cash|Check|Credit Card|Debit Card|Other)$/);
  expect(secondaryLine).not.toMatch(/receipt upload/i);
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

  test("image receipt OCR writes back extracted fields to Inbox draft via server API", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    await page.setViewportSize({ width: 1400, height: 900 });
    const blockedWritebackResponses: string[] = [];
    const approveStatuses: number[] = [];
    const writebackStatuses: number[] = [];
    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (url.includes("/api/financial/expenses/") && url.includes("/ocr-writeback")) {
        writebackStatuses.push(status);
      }
      if (url.includes("/api/financial/expenses/") && url.includes("/approve-inbox")) {
        approveStatuses.push(status);
      }
      if (
        status === 401 &&
        /\/rest\/v1\/(?:expenses|expense_lines)\b/.test(url) &&
        ["PATCH", "POST"].includes(response.request().method())
      ) {
        blockedWritebackResponses.push(`${response.request().method()} ${url}`);
      }
    });

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page, 90_000);
    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured.");
    }

    const runId = `${Date.now()}`;
    const filePayload = {
      name: `ocr-e2e-${runId}.png`,
      mimeType: "image/png",
      buffer: await receiptOcrPngBytes(page, runId),
    };

    let uploadedInboxRef: string | null = null;
    try {
      await page.getByRole("button", { name: /upload receipt/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: /upload receipt/i })).toBeVisible({
        timeout: 15_000,
      });
      await dialog.locator('input[type="file"][multiple]').setInputFiles(filePayload);
      await expect(dialog.getByText(/Selected receipts/i)).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole("button", { name: /Confirm Upload \(1\)/ }).click();

      await expect(page).toHaveURL(/[?&]highlight=INBOX-UP-[a-f0-9]+/i, { timeout: 45_000 });
      uploadedInboxRef = new URL(page.url()).searchParams.get("highlight")?.split(",")[0] ?? null;
      expect(uploadedInboxRef).toMatch(/^INBOX-UP-[a-f0-9]{64}$/);

      let draftId = "";
      await expect
        .poll(
          async () => {
            const snap = await loadInboxOcrDraft(admin, uploadedInboxRef!);
            if (!snap) return "missing";
            draftId = snap.id;
            return `${snap.vendor}|${snap.lineAmount}|${snap.category}|${snap.date}|${snap.status}|${snap.sourceType}`;
          },
          { timeout: 150_000, intervals: [1000, 1500, 2500] }
        )
        .toBe("Lowe's|42.37|Materials|2026-06-10|draft|receipt_upload");

      expect(writebackStatuses).toContain(200);
      expect(blockedWritebackResponses).toEqual([]);

      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page, 90_000);
      const inboxDraftRow = page.locator(`.exp-row[data-expense-id="${draftId}"]`).first();
      await expect(inboxDraftRow).toBeVisible({ timeout: 60_000 });
      await expect(inboxDraftRow).toContainText("Lowe's", { timeout: 60_000 });
      await expect(inboxDraftRow).toContainText("Materials");
      await expect(inboxDraftRow).toContainText(/42\.37/);
      await expect(inboxDraftRow).toContainText(/Jun 10/);

      await inboxDraftRow.click();
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
      await pickOrCreatePaymentInSelect(page, dialogPaymentAccountSelect(expenseDialog, page));

      await expenseDialog.getByRole("button", { name: /^Save$/ }).click();
      await expect(expenseDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
        timeout: 60_000,
      });
      await expect(expenseDialog.getByText(/HH Unified/)).toBeVisible({ timeout: 15_000 });

      await expenseDialog.getByRole("button", { name: /^Approve$/ }).click();
      await expect
        .poll(() => approveStatuses, { timeout: 60_000, intervals: [500, 1000] })
        .toContain(200);
      expect(blockedWritebackResponses).toEqual([]);

      await expect
        .poll(
          async () => {
            const snap = await loadInboxOcrDraft(admin, uploadedInboxRef!);
            return snap?.status ?? "missing";
          },
          { timeout: 60_000, intervals: [500, 1000] }
        )
        .toBe("approved");

      await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await waitForExpensesQuerySuccess(page, 90_000);
      const archiveRow = page.locator(`.exp-row[data-expense-id="${draftId}"]`).first();
      await expect(archiveRow).toBeVisible({ timeout: 60_000 });
      await expect(archiveRow).toContainText("Lowe's");
      await expect(archiveRow).toContainText("Materials");

      await archiveRow.click();
      const archiveDialog = page.getByRole("dialog");
      await expect(archiveDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
        timeout: 15_000,
      });
      await archiveDialog.getByRole("button", { name: /^Edit$/ }).click();
      const attachmentsGroup = archiveDialog.getByRole("group", { name: "Attachments" });
      await expect(
        attachmentsGroup.getByTestId("edit-expense-existing-attachment").first()
      ).toBeVisible({
        timeout: 15_000,
      });
      await attachmentsGroup
        .getByRole("button", { name: /^Open / })
        .first()
        .click();
      const preview = attachmentPreviewModal(page);
      await expect(preview).toBeVisible({ timeout: 15_000 });
      await expect(preview.locator("#attachment-preview-title")).toBeVisible({ timeout: 10_000 });
      await preview.getByRole("button", { name: /^Close$/ }).click();
      await expect(preview).toBeHidden({ timeout: 15_000 });
    } finally {
      if (uploadedInboxRef) await cleanupInboxOcrDraft(admin, uploadedInboxRef);
    }
  });

  test("upload → draft on Inbox → modal edit → approve on archive; duplicate blocked; draft excluded from canonical cost until approve", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const blockedReviewResponses: string[] = [];
    const approveStatuses: number[] = [];
    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (url.includes("/api/financial/expenses/") && url.includes("/approve-inbox")) {
        approveStatuses.push(status);
      }
      if (
        status === 401 &&
        /\/rest\/v1\/expenses\b/.test(url) &&
        ["PATCH", "POST"].includes(response.request().method())
      ) {
        blockedReviewResponses.push(`${response.request().method()} ${url}`);
      }
    });

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
    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    let uploadedExpenseId: string | null = null;
    let uploadedInboxRef: string | undefined;

    try {
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
      uploadedInboxRef = new URL(page.url()).searchParams.get("highlight")?.split(",")[0];
      expect(uploadedInboxRef).toMatch(/^INBOX-UP-[a-f0-9]{64}$/);
      await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });

      await waitForExpensesQuerySuccess(page, 90_000);

      if (adminUrl && adminKey) {
        const admin = createClient(adminUrl, adminKey);
        const { data: hit } = await admin
          .from("expenses")
          .select("id,status,reference_no,created_at")
          .eq("reference_no", uploadedInboxRef!)
          .maybeSingle();
        expect(hit, "expected INBOX-UP- draft expense row").toBeTruthy();
        uploadedExpenseId = String((hit as { id?: string }).id ?? "") || null;
        const st = String((hit as { status?: string }).status ?? "").toLowerCase();
        expect(["draft", "needs_review"].includes(st)).toBeTruthy();
        const ref = String((hit as { reference_no?: string }).reference_no ?? "");
        expect(ref).toBe(uploadedInboxRef);
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
      const amexOption = page.getByRole("option", { name: "Amex", exact: true });
      if ((await amexOption.count()) > 0) {
        await amexOption.click();
      } else {
        await page.getByRole("option", { name: "ACH", exact: true }).click();
      }

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
        .poll(() => approveStatuses, { timeout: 60_000, intervals: [500, 1000] })
        .toContain(200);
      expect(blockedReviewResponses).toEqual([]);

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
          .select("id,status,reference_no")
          .eq("reference_no", uploadedInboxRef!)
          .maybeSingle();
        expect(persisted, "approved expense keeps inbox dedupe reference").toBeTruthy();
        expect(String((persisted as { status?: string | null }).status ?? "")).toBe("approved");
        expect(String((persisted as { reference_no?: string | null }).reference_no ?? "")).toBe(
          uploadedInboxRef
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
    } finally {
      if (uploadedInboxRef && adminUrl && adminKey) {
        await cleanupInboxOcrDraft(createClient(adminUrl, adminKey), uploadedInboxRef);
      }
    }
  });

  test("receipt queue page still loads (legacy table)", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
  });
});
