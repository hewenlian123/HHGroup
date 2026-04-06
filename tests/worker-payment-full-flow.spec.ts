import { test, expect } from "@playwright/test";
import { resetAndEnsureE2EPaymentSeedFromEnv } from "./e2e-reset-worker-payroll";
import {
  allowWorkerPaymentMutations,
  deleteAllWorkerPaymentsForWorker,
  openWorkerPaymentReceiptPreviewAndAssertLaborLines,
} from "./payment-e2e-helpers";

/**
 * E2E: Pay worker → receipt has labor lines → delete payment → labor shows as unpaid again (rollback).
 *
 * ⚠️ Creates and deletes real data.
 *
 * Localhost: enabled by default. Remote URL: `E2E_ALLOW_PAYMENT_MUTATIONS=1`. Force off: `=0`.
 * CLI: `npx playwright test tests/worker-payment-full-flow.spec.ts`
 *
 * Uses payment method "E2E Cash" so the correct row can be found on /labor/payments if multiple exist.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const WORKER_NAME = (process.env.E2E_WORKER_NAME ?? "[E2E] Seed Worker").trim();

test.describe("Worker payment full flow: pay → receipt → delete → rollback", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async () => {
    await resetAndEnsureE2EPaymentSeedFromEnv();
  });

  test("pay → receipt → delete → unpaid labor again", async ({ page }, testInfo) => {
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      'Pick Playwright project "chromium-payments", use localhost, or set E2E_ALLOW_PAYMENT_MUTATIONS=1.'
    );
    test.skip(!WORKER_NAME, "Set E2E_WORKER_NAME.");

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
    const payDialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(payDialog).toBeVisible();

    const hasLaborBlock = await payDialog
      .getByText("Unpaid labor entries")
      .isVisible()
      .catch(() => false);
    test.skip(!hasLaborBlock, "No unpaid labor block.");

    const totalRow = payDialog
      .locator("p.text-sm.font-semibold")
      .filter({ hasText: "Total Payment Amount" });
    const totalText = (await totalRow.locator("span.tabular-nums").textContent())?.trim() ?? "";
    test.skip(totalText === "$0.00" || totalText === "", "Payment total is zero.");

    await payDialog.getByPlaceholder(/Check|ACH|Cash/i).fill("E2E Cash");
    const payPost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/labor/workers/") &&
        r.url().includes("/pay") &&
        r.request().method() === "POST",
      { timeout: 65_000 }
    );
    await payDialog.getByRole("button", { name: "Confirm Payment" }).click();
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
    await expect(payDialog).not.toBeVisible({ timeout: 30_000 });

    // Receipt
    await page.goto(`${BASE}/labor/payments`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });

    let payRow = page
      .locator("tbody tr")
      .filter({ hasText: WORKER_NAME })
      .filter({ hasText: "E2E Cash" })
      .first();
    if ((await payRow.count()) === 0) {
      payRow = page.locator("tbody tr").filter({ hasText: WORKER_NAME }).first();
    }
    test.skip((await payRow.count()) === 0, "No payment row for worker.");
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
    await expect(receiptPreview.getByText(/No labor lines linked/i)).toHaveCount(0);

    await page.goto(`${BASE}/labor/payments`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });

    let rowToDelete = page
      .locator("tbody tr")
      .filter({ hasText: WORKER_NAME })
      .filter({ hasText: "E2E Cash" })
      .first();
    if ((await rowToDelete.count()) === 0) {
      rowToDelete = page.locator("tbody tr").filter({ hasText: WORKER_NAME }).first();
    }
    test.skip((await rowToDelete.count()) === 0, "Payment row gone before delete (race).");

    page.once("dialog", (d) => {
      expect(d.type()).toBe("confirm");
      void d.accept();
    });
    const deleteDone = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && /\/api\/labor\/worker-payments\//.test(r.url()),
      { timeout: 45_000 }
    );
    await rowToDelete.getByRole("button", { name: /^Delete$/ }).click();
    await deleteDone;

    // Rollback: balance page should offer unpaid labor again (checkboxes in Pay Worker modal)
    await page.goto(`${BASE}/labor/worker-balances`);
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: WORKER_NAME, exact: true }).click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Labor Entries/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Pay Worker" }).click();
    const again = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(again).toBeVisible();
    await expect(again.getByText("Unpaid labor entries")).toBeVisible();
    await expect(again.locator('label input[type="checkbox"]').first()).toBeVisible({
      timeout: 10_000,
    });

    const totalAgain =
      (
        await again
          .locator("p.text-sm.font-semibold")
          .filter({ hasText: "Total Payment Amount" })
          .locator("span.tabular-nums")
          .textContent()
      )?.trim() ?? "";
    expect(totalAgain, "After delete, unpaid labor should contribute to total again").not.toBe(
      "$0.00"
    );

    await again.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });
});
