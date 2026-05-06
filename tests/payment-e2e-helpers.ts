import { expect, type Locator, type Page } from "@playwright/test";

export { allowWorkerPaymentMutations } from "./e2e-env-helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Deletes all worker payment rows visible for this worker on /labor/payments so Pay Worker can
 * run again after a timed-out or partial payment E2E (payment created, delete step never ran).
 */
export async function deleteAllWorkerPaymentsForWorker(
  page: Page,
  workerName: string
): Promise<void> {
  await page.goto(`${BASE}/labor/payments`);
  await page.waitForLoadState("domcontentloaded");
  await page.getByText("Loading…").first().waitFor({ state: "hidden", timeout: 30_000 });

  for (let i = 0; i < 40; i++) {
    const row = page.locator("tbody tr").filter({ hasText: workerName }).first();
    if ((await row.count()) === 0) break;
    const actions = row.getByRole("button", { name: /Actions for payment/i });
    if ((await actions.count()) === 0) break;
    page.once("dialog", (d) => {
      void d.accept();
    });
    const delDone = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && /\/api\/labor\/worker-payments\//.test(r.url()),
      { timeout: 45_000 }
    );
    await actions.click();
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await delDone;
    await page.getByText("Loading…").first().waitFor({ state: "hidden", timeout: 15_000 });
  }
}

/** Opens row ⋯ menu → View receipt; waits for preview API; asserts server returned labor lines. */
export async function openWorkerPaymentReceiptPreviewAndAssertLaborLines(
  page: Page,
  payRow: Locator
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      const dlg = page.getByRole("dialog", { name: /Receipt preview/i });
      const closer = dlg.getByRole("button", { name: "Close" });
      if (await closer.isVisible().catch(() => false)) {
        await closer.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await dlg.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    const previewDone = page.waitForResponse(
      (r) =>
        r.url().includes("/api/labor/worker-payments/") &&
        r.url().includes("/receipt-preview") &&
        r.request().method() === "GET",
      { timeout: 90_000 }
    );
    await payRow.getByRole("button", { name: /Actions for payment/i }).click();
    await payRow
      .page()
      .getByRole("menuitem", { name: /^View receipt$/i })
      .click();
    const res = await previewDone;
    const bodyText = await res.text();
    expect(res.ok(), `receipt-preview HTTP ${res.status()}: ${bodyText.slice(0, 400)}`).toBe(true);
    const dto = JSON.parse(bodyText) as { receipt?: { laborLines?: unknown[] } | null };
    const n = dto.receipt?.laborLines?.length ?? 0;
    if (n > 0) return;
  }
  expect(false, "receipt-preview JSON has no laborLines after retries (server still empty).").toBe(
    true
  );
}
