/**
 * Worker Balance → Pay Worker → receipt preview opens; receipt content + PDF download.
 * Runs under default Playwright project `chromium` (not worker-payment*.spec.ts).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { E2E_PRESERVED_WORKER_ID } from "./e2e-cleanup-db";
import { resetAndEnsureE2EPaymentSeedFromEnv } from "./e2e-reset-worker-payroll";
import {
  allowWorkerPaymentMutations,
  deleteAllWorkerPaymentsForWorker,
} from "./payment-e2e-helpers";

const WORKER_NAME = (process.env.E2E_WORKER_NAME ?? "[E2E] Seed Worker").trim();

function totalAmount(dialog: Locator) {
  return dialog
    .locator("dt")
    .filter({ hasText: "Total Payment Amount" })
    .locator("xpath=following-sibling::dd[1]");
}

async function addPaymentSplit(page: Page, dialog: Locator, totalText: string) {
  const confirm = dialog.getByRole("button", { name: "Confirm Payment" });
  if (await confirm.isEnabled().catch(() => false)) return;
  const amount = totalText.replace(/[^0-9.-]/g, "");
  await dialog.getByRole("button", { name: /Add payment/i }).click();
  const splitDialog = page.getByRole("dialog", { name: /Add payment/i });
  await expect(splitDialog).toBeVisible({ timeout: 30_000 });
  const method = splitDialog.locator("select").first();
  if ((await method.locator("option", { hasText: "Cash" }).count()) > 0) {
    await method.selectOption("Cash");
  }
  await splitDialog.locator('input[type="number"]').fill(amount);
  const reference = splitDialog.getByPlaceholder(/Check #|Optional/i);
  if (await reference.isVisible().catch(() => false)) {
    await reference.fill("E2E Cash");
  }
  await splitDialog.getByRole("button", { name: /^Save$/i }).click();
  await expect(splitDialog).not.toBeVisible({ timeout: 30_000 });
  await expect(confirm).toBeEnabled({ timeout: 30_000 });
}

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
    const legacyPayWorker = page.getByRole("button", { name: "Pay Worker" });
    if (await legacyPayWorker.isVisible().catch(() => false)) {
      await expect(legacyPayWorker).toBeEnabled({ timeout: 60_000 });
      await legacyPayWorker.click();
    } else {
      const reimbursementItem = page
        .getByRole("checkbox", { name: /Select .* reimbursement/i })
        .first();
      const payableItem = (await reimbursementItem.isVisible().catch(() => false))
        ? reimbursementItem
        : page.getByRole("checkbox", { name: /Select .* (labor entry|reimbursement)/i }).first();
      if (!(await payableItem.isVisible({ timeout: 60_000 }).catch(() => false))) {
        test.skip(true, "No payable labor/reimbursement rows available in preserved E2E seed.");
      }
      await payableItem.check();
      const paySelected = page.getByRole("button", { name: "Pay Selected" }).last();
      await expect(paySelected).toBeEnabled({ timeout: 60_000 });
      await paySelected.click();
    }
    const dialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(dialog).toBeVisible();

    const totalText = (await totalAmount(dialog).textContent())?.trim() ?? "";
    test.skip(
      totalText === "$0.00" || totalText === "",
      "Payment total is zero; ensure E2E seed labor/reimb exist."
    );

    await addPaymentSplit(page, dialog, totalText);

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
    await receiptPreview.getByRole("link", { name: /Download PDF/i }).click({ force: true });
    const download = await dl;
    expect(download.suggestedFilename().toLowerCase().endsWith(".pdf")).toBe(true);
    expect(download.suggestedFilename()).toMatch(/^Receipt-/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const pdfBytes = await readFile(path!);
    expect(pdfBytes.subarray(0, 4).toString("latin1")).toBe("%PDF");

    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });
});
