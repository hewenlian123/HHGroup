import { test, expect } from "./fixture";
import { E2E_PRESERVED_PROJECT_ID as projectId } from "../e2e-cleanup-db";

test("receive payment blocks submission when invoice context is unavailable and retries", async ({
  page,
}) => {
  await page.goto("/financial/payments");
  await expect(
    page.getByRole("heading", { name: "Payments Received", exact: true }).filter({ visible: true })
  ).toBeVisible();
  await page.route("**/rest/v1/invoices?**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "permission denied" }),
    })
  );
  await page
    .getByRole("button", { name: "Receive Payment", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Unable to load payment context");
  await expect(dialog.getByRole("button", { name: "Receive Payment", exact: true })).toBeDisabled();
  await page.unroute("**/rest/v1/invoices?**");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("alert")).not.toBeVisible();
  await expect(dialog.getByRole("status")).not.toBeVisible();
});

test("project task keeps the form and reports a failed save", async ({ page }) => {
  await page.goto(`/projects/${projectId}?tab=tasks`);
  await page.getByRole("button", { name: "+ New Task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("[E2E] blocked network - never persisted");
  // The readonly fixture blocks the server action before it reaches the app.
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
    "[E2E] blocked network - never persisted"
  );
});

test("receipt review exposes unavailable accounts instead of successful empty state", async ({
  page,
}) => {
  await page.route("**/rest/v1/payment_accounts?**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "permission denied" }),
    })
  );
  await page.goto("/receipt-queue");
  await expect(page.getByTestId("receipt-queue-error")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add all/ })).toBeDisabled();
  await expect(page.locator("[data-receipt-queue-empty]")).not.toBeVisible();
  await page.unroute("**/rest/v1/payment_accounts?**");
  await page.reload();
  await expect(page.getByTestId("receipt-queue-error")).not.toBeVisible();
});
