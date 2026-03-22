import { test, expect } from "@playwright/test";
import { tryCreateDraftInvoiceNavigateToDetail } from "./e2e-helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function skipIfNoSupabase(page: import("@playwright/test").Page): Promise<boolean> {
  const banner = page.getByText(/Supabase is not configured/i);
  if (await banner.isVisible().catch(() => false)) {
    return true;
  }
  return false;
}

async function waitForCompanyProfileReady(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByTestId("company-save-button")).toBeEnabled({ timeout: 45_000 });
}

/**
 * Invoice / print pages load company block via fetchDocumentCompanyProfile() on each request.
 */
test.describe("Document header integration (Invoice print)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Invoice print shows unified header and company name from settings", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const marker = `E2E-Print-${Date.now()}`;
    await page.getByTestId("company-input-org_name").fill(marker);
    await page.getByTestId("company-save-button").click();
    await expect(page.locator('[role="status"]').filter({ hasText: /^Saved$/ }).first()).toBeVisible({
      timeout: 30_000,
    });

    const inv = await tryCreateDraftInvoiceNavigateToDetail(page, BASE);
    test.skip(!inv.ok, inv.ok ? "" : inv.skipReason);

    const url = page.url();
    const m = url.match(/\/financial\/invoices\/([^/]+)/);
    expect(m?.[1]).toBeTruthy();
    const invoiceId = m![1];

    await page.goto(`${BASE}/financial/invoices/${invoiceId}/print`);
    await page.waitForLoadState("domcontentloaded");

    const header = page.getByTestId("document-company-header");
    await expect(header).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("document-company-name")).toHaveText(marker);
    // Document title is a styled <p>, not a semantic heading.
    await expect(header.getByText("Invoice", { exact: true })).toBeVisible();
  });
});
