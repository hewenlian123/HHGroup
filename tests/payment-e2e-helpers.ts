import type { Page } from "@playwright/test";

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
    const del = row.getByRole("button", { name: /^Delete$/ });
    if ((await del.count()) === 0) break;
    page.once("dialog", (d) => {
      void d.accept();
    });
    const delDone = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && /\/api\/labor\/worker-payments\//.test(r.url()),
      { timeout: 45_000 }
    );
    await del.click();
    await delDone;
    await page.getByText("Loading…").first().waitFor({ state: "hidden", timeout: 15_000 });
  }
}
