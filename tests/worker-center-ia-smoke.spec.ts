import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

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

test.describe("Worker Center IA smoke", () => {
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
});
