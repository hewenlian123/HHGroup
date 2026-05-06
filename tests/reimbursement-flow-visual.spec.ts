/**
 * Visual / headed Playwright flow: Worker Receipt Upload → Approve → Reimbursement → Expense → Pay.
 *
 * Run (headed, force Playwright-spawned Next so `.env.test` service role applies — stop other :3000 dev first):
 *   E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0 env -u CI npx playwright test tests/reimbursement-flow-visual.spec.ts --headed --project=chromium
 *
 * If `/api/upload-receipt/options` omits the E2E worker, the dev server likely reused a process without
 * `SUPABASE_SERVICE_ROLE_KEY` (anon + RLS). Use the command above or start `npm run dev` with the same vars as `.env.test`.
 *
 * Screenshots: test-results/reimbursement-visual/01-*.png … 06-*.png
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { test, expect } from "@playwright/test";

import { expensesVendorSearch, waitForExpensesQuerySuccess } from "./e2e-expenses-helpers";
import { logE2ESupabaseEnvDiagnostics } from "./e2e-supabase-env-diagnostic";
import {
  cleanupReimbursementVisualTestData,
  ensureReimbursementVisualWorker,
  fetchReimbursementExpenseSnapshot,
  logUploadReceiptOptionsSnapshot,
  ensureScreenshotDir,
  fetchReimbursementStatus,
  getReimbursementVisualAdmin,
  MIN_RECEIPT_PNG,
  REIMBURSEMENT_VISUAL_AMOUNT,
  REIMBURSEMENT_VISUAL_NOTES,
  REIMBURSEMENT_VISUAL_VENDOR,
  REIMBURSEMENT_VISUAL_WORKER_ID,
  REIMBURSEMENT_VISUAL_WORKER_NAME,
  screenshotPath,
  waitUntilWorkerAppearsInUploadOptions,
} from "./reimbursement-flow-visual-helpers";

test.describe("Reimbursement flow (visual steps)", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async ({ request }) => {
    logE2ESupabaseEnvDiagnostics("[reimbursement-flow-visual]");
    try {
      mkdirSync(dirname(screenshotPath("01-worker-receipt-upload")), { recursive: true });
    } catch {
      /* exists */
    }
    ensureScreenshotDir();
    const admin = getReimbursementVisualAdmin();
    if (!admin) return;
    await cleanupReimbursementVisualTestData(admin);
    await ensureReimbursementVisualWorker(admin);
    await logUploadReceiptOptionsSnapshot(
      request,
      "beforeAll after ensureReimbursementVisualWorker"
    );
  });

  test("Worker Receipt → Approve → Expense → Pay (screenshots)", async ({
    page,
    request,
  }, testInfo) => {
    const admin = getReimbursementVisualAdmin();
    if (!admin) {
      test.skip(
        true,
        "Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (see .env.test)."
      );
      return;
    }
    const db = admin;

    await page.setViewportSize({ width: 1400, height: 900 });

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[UploadReceipt]")) {
        console.log(`[reimbursement-visual][browser:${msg.type()}] ${text}`);
      }
    });
    page.on("pageerror", (err) => {
      console.error("[reimbursement-visual][pageerror]", err);
    });

    let reimbursementId = "";

    await test.step("01 — Worker receipt upload", async () => {
      await ensureReimbursementVisualWorker(db);
      await logUploadReceiptOptionsSnapshot(
        request,
        "step01 after ensureReimbursementVisualWorker"
      );
      try {
        await waitUntilWorkerAppearsInUploadOptions(request, 120_000, db);
      } catch (e) {
        test.skip(
          true,
          e instanceof Error
            ? e.message
            : "upload-receipt/options never listed E2E Reimbursement Worker (Next.js needs SUPABASE_SERVICE_ROLE_KEY + same DB URL as the test)."
        );
      }

      await page.goto("/upload-receipt", { waitUntil: "domcontentloaded", timeout: 90_000 });
      await expect(page.getByRole("heading", { name: /Worker Receipt Upload/i })).toBeVisible({
        timeout: 60_000,
      });

      await expect(
        page.locator(`select option[value="${REIMBURSEMENT_VISUAL_WORKER_ID}"]`)
      ).toBeAttached({
        timeout: 90_000,
      });
      await page.locator("form select").first().selectOption(REIMBURSEMENT_VISUAL_WORKER_ID);

      await page.locator('input[type="file"]').setInputFiles({
        name: "e2e-reimbursement.png",
        mimeType: "image/png",
        buffer: MIN_RECEIPT_PNG,
      });

      await expect(page.getByRole("button", { name: "e2e-reimbursement.png" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/Recognizing receipt/i)).not.toBeVisible({ timeout: 30_000 });

      await page.locator('input[type="date"]').fill("2026-05-04");
      await page.locator('input[placeholder="商家名称"]').fill(REIMBURSEMENT_VISUAL_VENDOR);
      await page.locator('input[placeholder="0.00"]').fill(REIMBURSEMENT_VISUAL_AMOUNT);
      await page.locator('input[placeholder="选填"]').fill(REIMBURSEMENT_VISUAL_NOTES);

      await expect(page.locator('input[placeholder="商家名称"]')).toHaveValue(
        REIMBURSEMENT_VISUAL_VENDOR
      );
      await expect(page.locator('input[placeholder="0.00"]')).toHaveValue(
        REIMBURSEMENT_VISUAL_AMOUNT
      );

      const submitResp = page.waitForResponse(
        (r) => r.url().includes("/api/upload-receipt/submit") && r.request().method() === "POST",
        { timeout: 90_000 }
      );
      await page.getByRole("button", { name: /Submit Receipt/i }).click();
      const submitResult = await submitResp;
      expect(submitResult.ok(), await submitResult.text()).toBeTruthy();

      await expect(page.getByText("提交成功")).toBeVisible({ timeout: 120_000 });
      await page.screenshot({ path: screenshotPath("01-worker-receipt-upload"), fullPage: true });
    });

    await test.step("02 — Receipt pending (Worker Receipt Uploads)", async () => {
      await page.goto("/labor/receipts", { waitUntil: "domcontentloaded", timeout: 90_000 });
      if (
        await page
          .getByText(/Supabase is not configured|Failed to load/i)
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        test.skip(true, "Backend / Supabase unavailable.");
      }
      const receiptRow = page
        .locator("tbody tr")
        .filter({ hasText: REIMBURSEMENT_VISUAL_VENDOR })
        .first();
      await expect(receiptRow).toBeVisible({ timeout: 60_000 });
      await expect(receiptRow.getByText("Pending")).toBeVisible();
      await page.screenshot({ path: screenshotPath("02-reimbursement-pending"), fullPage: true });
    });

    await test.step("03 — Approve receipt → reimbursement created", async () => {
      const approveResp = page.waitForResponse(
        (r) =>
          r.url().includes("/api/worker-receipts/") &&
          r.url().includes("/approve") &&
          r.request().method() === "POST",
        { timeout: 90_000 }
      );

      const row = page.locator("tbody tr").filter({ hasText: REIMBURSEMENT_VISUAL_VENDOR });
      await row.getByRole("button", { name: "Actions for receipt" }).click();
      await page.getByRole("menuitem", { name: "Approve", exact: true }).click();

      const resp = await approveResp;
      expect(resp.ok(), await resp.text()).toBeTruthy();
      const body = (await resp.json()) as {
        reimbursementCreated?: { id?: string } | null;
      };
      expect(body.reimbursementCreated?.id, "approve should create reimbursement").toBeTruthy();
      reimbursementId = body.reimbursementCreated!.id!;

      await expect(page.getByText(/Approved\. Added to Reimbursements/i)).toBeVisible({
        timeout: 30_000,
      });

      await page.goto("/labor/reimbursements", { waitUntil: "domcontentloaded", timeout: 90_000 });
      const reimbursementRow = page
        .locator("tbody tr")
        .filter({ hasText: REIMBURSEMENT_VISUAL_VENDOR })
        .first();
      await expect(reimbursementRow).toBeVisible({ timeout: 60_000 });
      await expect(reimbursementRow.getByText(/pending|ready to pay/i)).toBeVisible();
      await page.screenshot({ path: screenshotPath("03-approve-reimbursement"), fullPage: true });
    });

    const referenceNo = () => `REIM-${reimbursementId}`;

    await test.step("04 — Expenses list (created or linked after pay)", async () => {
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page, 120_000);

      await expensesVendorSearch(page).fill(referenceNo());
      await page.waitForTimeout(500);

      const beforePay = await fetchReimbursementExpenseSnapshot(db, reimbursementId);
      const nBeforePay = beforePay.expenses.length;
      expect(nBeforePay).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: screenshotPath("04-expense-created-or-linked"),
        fullPage: true,
      });
    });

    await test.step("05 — Pay worker (Mark reimbursement as paid)", async () => {
      await page.goto("/labor/reimbursements", { waitUntil: "domcontentloaded", timeout: 90_000 });
      const row = page.locator("tbody tr").filter({ hasText: REIMBURSEMENT_VISUAL_VENDOR }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });

      await row.getByRole("button", { name: "Actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Mark as Paid" }).click();

      const dialog = page.getByRole("dialog", { name: "Mark as Paid" });
      await expect(dialog).toBeVisible();
      await dialog.getByPlaceholder(/Check|ACH/i).fill("E2E Visual Check");

      const payPost = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/worker-reimbursements/${reimbursementId}/pay`) &&
          r.request().method() === "POST",
        { timeout: 90_000 }
      );
      await dialog.getByRole("button", { name: "Mark as Paid", exact: true }).click();
      const payRes = await payPost;
      expect(payRes.ok(), await payRes.text()).toBeTruthy();
      const payBody = (await payRes.json()) as {
        expenseId?: string | null;
        expenseWarning?: string | null;
        reimbursement?: { status?: string | null };
      };
      expect(
        payBody.expenseWarning,
        "Mark Paid must not hide expense creation failure"
      ).toBeFalsy();
      expect(payBody.expenseId, "Mark Paid should create or link the expense").toBeTruthy();
      expect(String(payBody.reimbursement?.status ?? "").toLowerCase()).toBe("paid");

      await expect(dialog).not.toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: screenshotPath("05-pay-worker"), fullPage: true });
    });

    await test.step("06 — Final state: paid reimbursement + single expense", async () => {
      const status = await fetchReimbursementStatus(db, reimbursementId);
      expect(String(status ?? "").toLowerCase()).toBe("paid");

      const expenseSnapshot = await fetchReimbursementExpenseSnapshot(db, reimbursementId);
      expect(
        expenseSnapshot.expenses.length,
        `Expected exactly one expense for ${referenceNo()}`
      ).toBe(1);
      const [expense] = expenseSnapshot.expenses;
      expect(expense.reference_no === referenceNo() || expense.source_id === reimbursementId).toBe(
        true
      );
      expect(String(expense.status ?? "").toLowerCase()).toBe("paid");
      expect(Number(expense.total ?? expense.amount ?? 0)).toBeCloseTo(
        Number(REIMBURSEMENT_VISUAL_AMOUNT),
        2
      );
      expect(expenseSnapshot.lineRows.length, "Expected at least one expense line").toBeGreaterThan(
        0
      );
      expect(expenseSnapshot.lineTotal).toBeCloseTo(Number(REIMBURSEMENT_VISUAL_AMOUNT), 2);

      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page, 120_000);
      await expensesVendorSearch(page).fill(REIMBURSEMENT_VISUAL_VENDOR);
      await page.waitForTimeout(600);
      // Expenses page rendering is visual coverage; the DB snapshot above is the authoritative funds assertion.
      const afterExpensesPage = await fetchReimbursementExpenseSnapshot(db, reimbursementId);
      expect(afterExpensesPage.expenses.length).toBe(1);

      await page.screenshot({ path: screenshotPath("06-final-state"), fullPage: true });

      await testInfo.attach("06-final-state", {
        path: screenshotPath("06-final-state"),
        contentType: "image/png",
      });
    });
  });
});
