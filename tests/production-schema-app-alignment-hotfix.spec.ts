import { expect, test } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

test("authenticated Change Orders, Workforce, and Bank flows match the Production schema", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const schemaFailures: Array<{ status: number; url: string }> = [];
  const schemaConsoleErrors: string[] = [];

  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\/rest\/v1\/(?:project_change_orders|workers|labor_workers|payment_methods)(?:\?|$)/.test(
        response.url()
      )
    ) {
      schemaFailures.push({ status: response.status(), url: response.url() });
    }
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /project_change_orders|workers|labor_workers|payment_methods/i.test(message.text())
    ) {
      schemaConsoleErrors.push(message.text());
    }
  });

  await loginAsE2EOwner(page, "/financial/bank");
  await expect(page.getByRole("heading", { name: "Bank Reconcile" })).toBeVisible();

  const bankResponse = await page
    .context()
    .request.get("/api/financial/bank-transactions?view=reconcile");
  expect(bankResponse.status()).toBe(200);
  const bankBody = (await bankResponse.json()) as { paymentMethods?: unknown };
  expect(Array.isArray(bankBody.paymentMethods)).toBe(true);

  await page.goto("/reports/workforce?tab=advances");
  await expect(page.getByRole("heading", { name: "Workforce Reports" })).toBeVisible();

  await page.goto("/change-orders");
  await expect(page.getByRole("heading", { name: "Change Orders" })).toBeVisible();

  expect(schemaFailures).toEqual([]);
  expect(schemaConsoleErrors).toEqual([]);
});
