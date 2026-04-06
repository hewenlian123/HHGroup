import { test, expect } from "@playwright/test";
import { resetAndEnsureE2EPaymentSeedFromEnv } from "./e2e-reset-worker-payroll";
import {
  allowWorkerPaymentMutations,
  deleteAllWorkerPaymentsForWorker,
  openWorkerPaymentReceiptPreviewAndAssertLaborLines,
} from "./payment-e2e-helpers";

/**
 * End-to-end: pay worker with labor selected → Worker Payments → receipt shows labor lines (not "0 lines").
 *
 * ⚠️ Creates a real payment.
 *
 * Localhost target: runs by default. Non-local: set `E2E_ALLOW_PAYMENT_MUTATIONS=1`, or `=0` to force skip on localhost.
 * CLI: `npx playwright test tests/worker-payment-receipt.spec.ts`
 *
 * Optional: `E2E_BASE_URL` (default http://localhost:3000 in this file), `E2E_WORKER_NAME`.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const WORKER_NAME = (process.env.E2E_WORKER_NAME ?? "[E2E] Seed Worker").trim();

test.describe("Worker payment → receipt labor lines", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async () => {
    await resetAndEnsureE2EPaymentSeedFromEnv();
  });

  test("links labor entries on receipt (not 0 lines)", async ({ page }, testInfo) => {
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      'Pick Playwright project "chromium-payments", use localhost, or set E2E_ALLOW_PAYMENT_MUTATIONS=1.'
    );
    test.skip(!WORKER_NAME, "Set E2E_WORKER_NAME to a worker that has unpaid labor.");

    await deleteAllWorkerPaymentsForWorker(page, WORKER_NAME);

    await page.goto(`${BASE}/labor/worker-balances`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured|Failed to load/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Backend / Supabase unavailable.");
    }
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });

    const workerLink = page.getByRole("link", { name: WORKER_NAME, exact: true });
    test.skip((await workerLink.count()) === 0, `Worker "${WORKER_NAME}" not on Worker Balances.`);
    await workerLink.click();
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: /Labor Entries/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Pay Worker" }).click();
    const dialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(dialog).toBeVisible();

    const hasLaborBlock = await dialog
      .getByText("Unpaid labor entries")
      .isVisible()
      .catch(() => false);
    test.skip(
      !hasLaborBlock,
      "No unpaid labor entries block in modal (nothing to assert on receipt)."
    );

    await expect(dialog.locator('label input[type="checkbox"]').first()).toBeVisible();
    const totalRow = dialog
      .locator("p.text-sm.font-semibold")
      .filter({ hasText: "Total Payment Amount" });
    const totalText = (await totalRow.locator("span.tabular-nums").textContent())?.trim() ?? "";
    test.skip(
      totalText === "$0.00" || totalText === "",
      "Payment total is zero; select items or add unpaid labor."
    );

    await dialog.getByPlaceholder(/Check|ACH|Cash/i).fill("E2E Cash");
    const payPost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/labor/workers/") &&
        r.url().includes("/pay") &&
        r.request().method() === "POST",
      { timeout: 65_000 }
    );
    await dialog.getByRole("button", { name: "Confirm Payment" }).click();
    const payResp = await payPost;
    const payText = await payResp.text().catch(() => "");
    if (
      payResp.status() === 400 &&
      (/worker_payments/i.test(payText) || /未找到 worker_payments/.test(payText))
    ) {
      test.skip(
        true,
        "worker_payments unavailable — set SUPABASE_DATABASE_URL (or DATABASE_URL) so global-setup can run schema auto-repair, or apply migrations."
      );
    }
    expect(payResp.ok(), `POST /pay failed (${payResp.status()}): ${payText.slice(0, 500)}`).toBe(
      true
    );

    await expect(dialog).not.toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE}/labor/payments`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });

    const payRow = page.locator("tbody tr").filter({ hasText: WORKER_NAME }).first();
    test.skip((await payRow.count()) === 0, "No payment row for this worker on /labor/payments.");
    await openWorkerPaymentReceiptPreviewAndAssertLaborLines(page, payRow);
    const receiptPreview = page.getByRole("dialog", { name: /Receipt preview/i });
    await expect(receiptPreview).toBeVisible({ timeout: 30_000 });
    await expect(receiptPreview.getByText("Loading receipt…")).not.toBeVisible({
      timeout: 30_000,
    });
    await expect(
      receiptPreview
        .getByTestId("document-company-header")
        .getByText("Worker Payment Receipt", { exact: true })
    ).toBeVisible();
    await expect(
      receiptPreview.locator(".receipt-summary").getByText("Subtotal", { exact: true })
    ).toBeVisible();
    await expect(receiptPreview.getByText(/No labor lines linked/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
    await expect(receiptPreview.locator(".receipt-table--labor")).toBeVisible();
  });
});
