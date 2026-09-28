import { expect, test } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";

type Snapshot = {
  contractValue: number;
  revisedContractValue?: number;
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
      exactDollar(snapshot.revisedContractValue ?? snapshot.contractValue)
    );
    await expect(page.getByTestId("project-header-actual-cost")).toHaveText(
      exactDollar(snapshot.actualCost)
    );

    await expect(page.getByTestId("project-overview-billed")).toHaveText(
      exactDollar(snapshot.billedAmount)
    );
    await expect(page.getByTestId("project-overview-paid")).toHaveText(
      exactDollar(snapshot.paidAmount)
    );
    await expect(page.getByTestId("project-overview-open-ar")).toHaveText(
      exactDollar(snapshot.openAR)
    );

    for (const [testId, value] of [
      ["project-overview-cost-actual", snapshot.actualCost],
      ["project-overview-cost-expenses", snapshot.expenseCost],
      ["project-overview-cost-labor", snapshot.laborCost],
      ["project-overview-cost-reimbursements", snapshot.reimbursementCost],
      ["project-overview-cost-subcontracts", snapshot.subcontractCost],
      ["project-overview-cost-commission", snapshot.commissionCost],
    ] as const) {
      await expect(page.getByTestId(testId)).toHaveText(exactDollar(value));
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
