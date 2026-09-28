import { test, expect } from "./fixture";
import type { Page } from "@playwright/test";

async function expectHealthy(page: Page) {
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(
    page
      .getByText(
        /Unable to load data|Unable to load received payments|Application error|Internal Server Error/
      )
      .first()
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
    )
  ).toBeLessThanOrEqual(2);
  await expect(page.locator("[data-finance-section]")).toHaveCount(1);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Finance Billing and Payables ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto("/financial/ar");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Billing", exact: true }).filter({ visible: true })
    ).toBeVisible();
    await expect(page.getByTestId("ar-workspace-summary")).toContainText("Awaiting payment");
    await expect(page.getByText("Recent customer payments", { exact: true })).toBeVisible();
    await expectHealthy(page);
    await page.screenshot({
      path: testInfo.outputPath(`billing-${viewport.width}.png`),
      fullPage: true,
    });

    const billing = page.getByRole("navigation", { name: "Billing sections", exact: true });
    await expect(billing.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    const invoiceResponse = page.waitForResponse(
      (r) => r.url().includes("/api/invoices?") && r.request().method() === "GET"
    );
    await billing.getByRole("link", { name: "Invoices", exact: true }).click();
    expect((await invoiceResponse).status()).toBe(200);
    await expect(page).toHaveURL(/\/financial\/invoices$/);
    await expect(billing.getByRole("link", { name: "Invoices", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectHealthy(page);

    const receivedResponse = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/payments_received?") && r.request().method() === "GET"
    );
    await billing.getByRole("link", { name: "Payments", exact: true }).click();
    expect((await receivedResponse).status()).toBe(200);
    await expect(page).toHaveURL(/\/financial\/payments$/);
    await expect(
      page.getByRole("combobox", { name: "Customer history", exact: true })
    ).toBeVisible();
    await expect(billing.getByRole("link", { name: "Payments", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectHealthy(page);
    await page.screenshot({
      path: testInfo.outputPath(`received-payments-${viewport.width}.png`),
      fullPage: true,
    });

    // An exact unmatched customer must produce empty history, never a name-based match.
    await page.goto("/financial/ar?customerId=00000000-0000-4000-8000-000000000099");
    await expect(page).toHaveURL(/customerId=00000000-0000-4000-8000-000000000099/);
    await expect(page.getByText("No customer payments found.", { exact: true })).toBeVisible();
    await expect(billing.getByRole("link", { name: "Invoices", exact: true })).toHaveAttribute(
      "href",
      /customerId=/
    );
    await expect(billing.getByRole("link", { name: "Payments", exact: true })).toHaveAttribute(
      "href",
      /customerId=/
    );

    await page.goto("/financial/payables");
    await expect(page.getByRole("heading", { name: "Payables", exact: true })).toBeVisible();
    await expect(
      page.getByText("Vendor / subcontractor AP balances", { exact: true })
    ).toBeVisible();
    const payables = page.getByRole("navigation", { name: "Payables sections", exact: true });
    await expectHealthy(page);
    await page.screenshot({
      path: testInfo.outputPath(`payables-${viewport.width}.png`),
      fullPage: true,
    });
    await payables.getByRole("link", { name: "Bills", exact: true }).click();
    await expect(page).toHaveURL(/\/bills$/);
    await expect(
      page.getByRole("heading", { name: "Bills", exact: true }).filter({ visible: true })
    ).toBeVisible();
    await expect(payables.getByRole("link", { name: "Bills", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectHealthy(page);
    await payables.getByRole("link", { name: "Payments", exact: true }).click();
    await expect(page).toHaveURL(/\/financial\/payables\/payments$/);
    await expect(
      page.getByRole("heading", { name: "Outgoing Payments", exact: true })
    ).toBeVisible();
    await expect(payables.getByRole("link", { name: "Payments", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectHealthy(page);
    await page.screenshot({
      path: testInfo.outputPath(`outgoing-payments-${viewport.width}.png`),
      fullPage: true,
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/bills$/);
    await expect(payables.getByRole("link", { name: "Bills", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    if (viewport.width < 640)
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const sidebar = page.locator("[data-app-sidebar]:visible");
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar.getByRole("link", { name: "Finance", exact: true })).toHaveAttribute(
      "href",
      "/financial"
    );
    await expect(sidebar.getByRole("link", { name: "Finance", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(errors).toEqual([]);
  });
}

test("Received Payments fails closed and can retry", async ({ page }) => {
  await page.route("**/rest/v1/payments_received?**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "permission denied" }),
    })
  );
  await page.goto("/financial/payments");
  const failure = page.getByRole("alert").filter({ hasText: "Unable to load received payments" });
  await expect(failure).toBeVisible();
  await expect(page.getByText("Total received", { exact: true })).not.toBeVisible();
  await page.unroute("**/rest/v1/payments_received?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Customer history", exact: true })).toBeVisible();
  await expect(failure).not.toBeVisible();
});
