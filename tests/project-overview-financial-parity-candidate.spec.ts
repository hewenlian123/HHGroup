import { expect, test } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";

type Snapshot = {
  contractValue: number;
  actualCost: number;
  expenseCost: number;
  laborCost: number;
  reimbursementCost: number;
  subcontractCost: number;
  commissionCost: number;
  billedAmount: number;
  paidAmount: number;
  openAR: number;
};

function wholeDollar(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function exactDollar(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

test.describe("Project Overview authoritative financial snapshot", () => {
  test("renders Overview totals and reimbursement classification from the snapshot response", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const snapshotPath = `/api/projects/${E2E_PRESERVED_PROJECT_ID}/financial-snapshot`;
    const projectPath = `/projects/${E2E_PRESERVED_PROJECT_ID}`;
    const documentResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().resourceType() === "document" && url.pathname === projectPath;
    });
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes(snapshotPath) && response.request().method() === "GET"
    );
    await loginAsE2EOwner(page, `/projects/${E2E_PRESERVED_PROJECT_ID}?tab=overview`);
    const documentResponse = await documentResponsePromise;
    expect(documentResponse.status()).toBe(200);
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      comparison: { newSnapshot: Snapshot };
    };
    expect(payload.ok).toBe(true);
    const snapshot = payload.comparison.newSnapshot;

    await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute(
      "data-state",
      "active"
    );
    await expect(page.getByTestId("project-header-contract-value")).toHaveText(
      wholeDollar(snapshot.contractValue)
    );
    await expect(page.getByTestId("project-header-actual-cost")).toHaveText(
      wholeDollar(snapshot.actualCost)
    );

    const summary = page.locator("section").filter({ hasText: "Financial Summary" }).first();
    await expect(summary.getByText("Billed", { exact: true }).locator("..")).toContainText(
      exactDollar(snapshot.billedAmount)
    );
    await expect(summary.getByText("Paid", { exact: true }).locator("..")).toContainText(
      exactDollar(snapshot.paidAmount)
    );
    await expect(summary.getByText("Need collect", { exact: true }).locator("..")).toContainText(
      wholeDollar(snapshot.openAR)
    );

    const costs = page.locator("section").filter({ hasText: "Cost Breakdown" }).first();
    for (const [label, value] of [
      ["Actual cost", snapshot.actualCost],
      ["Expenses", snapshot.expenseCost],
      ["Labor", snapshot.laborCost],
      ["Reimbursements", snapshot.reimbursementCost],
      ["Subcontracts", snapshot.subcontractCost],
      ["Commission", snapshot.commissionCost],
    ] as const) {
      await expect(costs.getByText(label, { exact: true }).locator("..")).toContainText(
        wholeDollar(value)
      );
    }
  });

  test("fails closed when the authoritative snapshot is unavailable", async ({ page }) => {
    test.setTimeout(180_000);
    const snapshotPath = `/api/projects/${E2E_PRESERVED_PROJECT_ID}/financial-snapshot`;
    await page.route(`**${snapshotPath}**`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "unavailable" }),
      });
    });

    await loginAsE2EOwner(page, `/projects/${E2E_PRESERVED_PROJECT_ID}?tab=overview`);
    await expect(page.getByTestId("project-header-financial-warning")).toContainText(
      "Project financial data is unavailable"
    );
    await expect(page.getByTestId("project-header-actual-cost")).toHaveText("—");
    await expect(page.getByText("Using legacy financial summary.")).toHaveCount(0);
  });
});
