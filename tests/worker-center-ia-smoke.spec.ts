import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LOCAL_APP_BASE = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const ADD_WORKER_PREFIX = "LOCAL-ADD-WORKER-QA-DELETE-ME";

async function expectNoVisibleAppError(page: Page) {
  await expect(page.getByRole("heading", { name: /^(404|500|Not found)$/i })).not.toBeVisible();
  await expect(
    page
      .locator("body")
      .getByText(
        /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Something went wrong/i
      )
      .first()
  ).not.toBeVisible();
}

async function expectPageLoad(page: Page, path: string, heading: RegExp) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoVisibleAppError(page);
}

async function firstWorkerId(page: Page): Promise<string | null> {
  const response = await page.request.get(`${BASE}/api/labor/workers`);
  if (!response.ok()) return null;
  const json = (await response.json().catch(() => null)) as Array<{ id?: string }> | null;
  return json?.find((row) => typeof row.id === "string" && row.id)?.id ?? null;
}

async function findWorkerIdByName(page: Page, name: string): Promise<string | null> {
  const response = await page.request.get(`${BASE}/api/labor/workers`, { timeout: 10_000 });
  if (!response.ok()) return null;
  const json = (await response.json().catch(() => null)) as Array<{
    id?: string;
    name?: string;
  }> | null;
  return json?.find((row) => row.name === name && typeof row.id === "string")?.id ?? null;
}

async function cleanupWorkerByName(page: Page, name: string, fallbackId?: string | null) {
  const workerId = fallbackId ?? (await findWorkerIdByName(page, name));
  if (!workerId) return;
  await page.request.delete(`${BASE}/api/labor/workers/${encodeURIComponent(workerId)}`, {
    timeout: 10_000,
  });
}

test.describe("Worker Center IA smoke", () => {
  test("sidebar People section keeps Worker Center IA primary entries", async ({ page }) => {
    await expectPageLoad(page, "/workers", /^Worker Center$/i);

    const sidebar = page.locator("[data-app-sidebar]").first();
    for (const label of [
      "Customers",
      "Worker Center",
      "Payroll Summary",
      "Vendors",
      "Subcontractors",
    ]) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible({ timeout: 10_000 });
    }

    for (const legacyLabel of [
      "Workers",
      "Worker Summary",
      "Worker Balances",
      "Worker Payments",
      "Worker Advances",
      "Worker Invoices",
      "All Contacts",
    ]) {
      await expect(sidebar.getByText(legacyLabel, { exact: true })).toHaveCount(0);
    }
  });

  test("desktop routes load", async ({ page }) => {
    await expectPageLoad(page, "/labor", /^(Daily Labor|Labor)$/i);
    await expectPageLoad(page, "/workers", /^Worker Center$/i);

    const workerId = await firstWorkerId(page);
    test.skip(!workerId, "No worker id available for detail smoke.");

    await expectPageLoad(page, `/workers/${encodeURIComponent(workerId!)}`, /.+/i);
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Payments" })).toBeVisible();

    await expectPageLoad(page, `/workers/${encodeURIComponent(workerId!)}/edit`, /Edit Worker/i);
    await expectPageLoad(page, `/labor/workers/${encodeURIComponent(workerId!)}/balance`, /.+/i);
    await expect(page.getByRole("heading", { name: /Labor Entries/i })).toBeVisible({
      timeout: 30_000,
    });
    await expectPageLoad(page, "/labor/payroll", /^Payroll Summary$/i);
  });

  test("mobile worker detail has no horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectPageLoad(page, "/workers", /^Worker Center$/i);

    const workerId = await firstWorkerId(page);
    test.skip(!workerId, "No worker id available for mobile detail smoke.");

    await expectPageLoad(page, `/workers/${encodeURIComponent(workerId!)}`, /.+/i);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("mobile Add Worker opens the new worker detail", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!LOCAL_APP_BASE.test(BASE), "Add Worker mutation smoke only runs locally.");

    const workerName = `${ADD_WORKER_PREFIX} Worker ${Date.now()}`;
    let createdWorkerId: string | null = null;

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectPageLoad(page, "/workers", /^Worker Center$/i);

      await page.getByRole("button", { name: /^Add worker$/i }).click();
      const dialog = page.getByRole("dialog", { name: /^Add Worker$/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await dialog.getByPlaceholder("Worker name").fill(workerName);
      await dialog.getByLabel(/^Trade$/i).fill("QA");
      await dialog.getByLabel(/^Daily Rate$/i).fill("200");
      await dialog.getByRole("button", { name: /^Add Worker$/i }).click();

      await expect(dialog).not.toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/workers\/[0-9a-f-]{36}$/i, { timeout: 30_000 });

      createdWorkerId = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
      await expect(page.getByRole("heading", { name: workerName })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Current Daily Rate").first()).toBeVisible();
      await expect(page.getByText(/\$200(?:\.00)?/).first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      await cleanupWorkerByName(page, workerName, createdWorkerId);
    }
  });
});
