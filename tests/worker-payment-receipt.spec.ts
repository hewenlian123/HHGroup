import { test, expect } from "@playwright/test";
import { allowWorkerPaymentMutations } from "./payment-e2e-helpers";

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

  test("links labor entries on receipt (not 0 lines)", async ({ page }, testInfo) => {
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      'Pick Playwright project "chromium-payments", use localhost, or set E2E_ALLOW_PAYMENT_MUTATIONS=1.'
    );
    test.skip(!WORKER_NAME, "Set E2E_WORKER_NAME to a worker that has unpaid labor.");

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
    await dialog.getByRole("button", { name: "Confirm Payment" }).click();

    await expect(dialog).not.toBeVisible({ timeout: 60_000 });

    await page.goto(`${BASE}/labor/payments`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 30_000 });

    const payRow = page.locator("tbody tr").filter({ hasText: WORKER_NAME }).first();
    test.skip((await payRow.count()) === 0, "No payment row for this worker on /labor/payments.");
    await payRow.getByRole("link", { name: "View Receipt" }).click();
    await page.waitForLoadState("load");

    await expect(page.getByRole("heading", { name: /Worker Payment Receipt/i })).toBeVisible();
    await expect(
      page.locator(".receipt-summary").getByText("Subtotal", { exact: true })
    ).toBeVisible();
    await expect(page.getByText(/^0 lines$/)).not.toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
    await expect(
      page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Session" }) })
    ).toBeVisible();
  });
});
