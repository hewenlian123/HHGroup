import { expect, test } from "@playwright/test";

test("new invoice: customer dropdown loads and can select a customer", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/financial/invoices/new");
  await page.waitForLoadState("domcontentloaded");

  if (
    await page
      .getByText(/Supabase is not configured/i)
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "Supabase not configured.");
  }

  await expect(page.getByRole("heading", { name: /^New Invoice$/i })).toBeVisible({
    timeout: 60_000,
  });

  const customerSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Select customer" }) });
  await expect(customerSelect).toBeVisible({ timeout: 60_000 });

  await expect(async () => {
    const count = await customerSelect.locator("option").count();
    expect(count).toBeGreaterThan(1);
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });

  const labels = (await customerSelect.locator("option").allTextContents()).map((s) => s.trim());
  const firstCustomer = labels.find((label) => label && label !== "Select customer");
  if (!firstCustomer) {
    test.skip(true, "No customers available in dropdown.");
    return;
  }

  await customerSelect.selectOption({ label: firstCustomer });
  await expect(page.getByTestId("invoice-new-client-input")).toHaveValue(firstCustomer, {
    timeout: 10_000,
  });

  const body = page.locator("body");
  await expect(body).not.toContainText("Something went wrong");
  await expect(body).not.toContainText("Hydration failed");
});
