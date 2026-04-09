/**
 * Worker Balance → Pay Worker → receipt preview opens; receipt content + PDF download.
 * Runs under default Playwright project `chromium` (not worker-payment*.spec.ts).
 */
import { test, expect } from "@playwright/test";

import { E2E_PRESERVED_WORKER_ID } from "./e2e-cleanup-db";
import { resetAndEnsureE2EPaymentSeedFromEnv } from "./e2e-reset-worker-payroll";
import {
  allowWorkerPaymentMutations,
  deleteAllWorkerPaymentsForWorker,
} from "./payment-e2e-helpers";

const WORKER_NAME = (process.env.E2E_WORKER_NAME ?? "[E2E] Seed Worker").trim();

test.describe("Worker balance — pay worker → receipt auto", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async () => {
    await resetAndEnsureE2EPaymentSeedFromEnv();
  });

  test("POST /pay succeeds, receipt modal opens, PDF downloads", async ({ page }, testInfo) => {
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      "Payment mutations disallowed (set E2E_ALLOW_PAYMENT_MUTATIONS=1 or use localhost)."
    );

    await deleteAllWorkerPaymentsForWorker(page, WORKER_NAME);

    await page.goto(`/labor/workers/${encodeURIComponent(E2E_PRESERVED_WORKER_ID)}/balance`);
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured|Failed to load/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Backend / Supabase unavailable.");
    }
    await expect(page.getByRole("button", { name: "Pay Worker" })).toBeEnabled({ timeout: 60_000 });

    await page.getByRole("button", { name: "Pay Worker" }).click();
    const dialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(dialog).toBeVisible();

    const totalRow = dialog
      .locator("p.text-sm.font-semibold")
      .filter({ hasText: "Total Payment Amount" });
    const totalText = (await totalRow.locator("span.tabular-nums").textContent())?.trim() ?? "";
    test.skip(
      totalText === "$0.00" || totalText === "",
      "Payment total is zero; ensure E2E seed labor/reimb exist."
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
        "worker_payments unavailable — apply migrations / schema auto-repair for E2E DB."
      );
    }
    expect(payResp.ok(), `POST /pay failed (${payResp.status()}): ${payText.slice(0, 500)}`).toBe(
      true
    );

    await expect(dialog).not.toBeVisible({ timeout: 30_000 });

    const receiptPreview = page.getByRole("dialog", { name: /Receipt preview/i });
    await expect(receiptPreview).toBeVisible({ timeout: 30_000 });
    await expect(receiptPreview.getByText("Loading receipt…")).not.toBeVisible({
      timeout: 30_000,
    });

    await expect(receiptPreview.getByText(WORKER_NAME)).toBeVisible();
    await expect(receiptPreview.locator(".receipt-total-amount")).toHaveText(totalText);
    await expect(
      receiptPreview.getByTestId("document-company-header").getByText("Date")
    ).toBeVisible();

    const dl = page.waitForEvent("download", { timeout: 120_000 });
    await receiptPreview.getByRole("button", { name: /Download PDF/i }).click();
    const download = await dl;
    expect(download.suggestedFilename().toLowerCase().endsWith(".pdf")).toBe(true);
    expect(download.suggestedFilename()).toMatch(/^Receipt-/);

    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });
});
