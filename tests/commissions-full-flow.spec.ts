import { test, expect, type Page } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";

const PROJECT_ID = E2E_PRESERVED_PROJECT_ID;

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function projectCommissionRow(page: Page, person: string) {
  return page
    .locator("[data-testid^='project-commission-row-']")
    .filter({ hasText: person })
    .first();
}

function financialCommissionRow(page: Page, person: string) {
  return page
    .locator("[data-testid^='financial-commission-row-']")
    .filter({ hasText: person })
    .first();
}

async function assertNoAuthRedirect(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/i);
}

test.describe("Commission full E2E flow", () => {
  test.describe.configure({ timeout: 180_000 });

  test("project add -> record payment -> edit -> delete", async ({ page }) => {
    const stamp = Date.now();
    const person = `PW Commission ${stamp}`;
    const commissionNote = `[E2E] commission-full-flow ${stamp}`;
    const paymentNote = `[E2E] commission-payment ${stamp}`;
    const initialAmount = 150;
    const paymentAmount = 50;
    const updatedAmount = 200;
    const paymentDate = new Date().toISOString().slice(0, 10);
    const paymentMethod = "Check";
    const apiErrors: string[] = [];
    let commissionId: string | null = null;

    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/api/projects/")) return;
      if (!url.includes("/commissions")) return;
      if (response.status() < 400) return;
      const body = await response.text().catch(() => "");
      apiErrors.push(`${response.status()} ${url}\n${body}`);
    });

    try {
      await page.goto(`/projects/${PROJECT_ID}?tab=commission`, { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);

      await expect(page.getByTestId("project-commission-add")).toBeVisible();
      await page.getByTestId("project-commission-add").click();
      await page.getByTestId("project-commission-person").fill(person);
      await page.getByTestId("project-commission-role").selectOption("Sales");
      await page.getByTestId("project-commission-calculation-mode").selectOption("Manual");
      await page.getByTestId("project-commission-amount").fill(String(initialAmount));
      await page.getByTestId("project-commission-notes").fill(commissionNote);
      await page.getByTestId("project-commission-save").click();

      const addDialog = page.getByRole("dialog", { name: /add commission/i });
      const addError = addDialog.getByText(
        /Database connection failed|fetch failed|Failed to create commission/i
      );
      if (
        await addError
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        throw new Error(`Add Commission failed: ${(await addError.first().innerText()).trim()}`);
      }

      const projectRow = projectCommissionRow(page, person);
      await expect(projectRow).toBeVisible({ timeout: 20_000 });
      await expect(projectRow).toContainText("Sales");
      await expect(projectRow).toContainText("Manual");
      await expect(projectRow).toContainText(money(initialAmount));

      const projectRowTestId = await projectRow.getAttribute("data-testid");
      commissionId = projectRowTestId?.replace("project-commission-row-", "") ?? null;

      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);

      const financialRow = financialCommissionRow(page, person);
      await expect(financialRow).toBeVisible({ timeout: 20_000 });
      await expect(financialRow).toContainText(money(initialAmount));
      await expect(financialRow).toContainText(money(0));
      await expect(financialRow).toContainText(/Unpaid/i);

      if (!commissionId) {
        const financialRowTestId = await financialRow.getAttribute("data-testid");
        commissionId = financialRowTestId?.replace("financial-commission-row-", "") ?? null;
      }
      if (!commissionId) throw new Error("Could not determine created commission id.");

      await page.getByTestId(`financial-commission-record-payment-${commissionId}`).click();
      await page.getByTestId("financial-record-payment-amount").fill(String(paymentAmount));
      await page.getByTestId("financial-record-payment-date").fill(paymentDate);
      await page.getByTestId("financial-record-payment-method").selectOption(paymentMethod);
      await page.getByTestId("financial-record-payment-note").fill(paymentNote);
      await page.getByTestId("financial-record-payment-save").click();

      await expect(financialRow).toContainText(money(paymentAmount), { timeout: 20_000 });
      await expect(financialRow).toContainText(/Partial|Paid/i);

      await page.getByTestId(`financial-commission-expand-${commissionId}`).click();
      const paymentRow = page
        .locator("[data-testid^='financial-payment-row-']")
        .filter({ hasText: paymentNote })
        .first();
      await expect(paymentRow).toBeVisible({ timeout: 15_000 });
      await expect(paymentRow).toContainText(money(paymentAmount));
      await expect(paymentRow).toContainText(paymentDate);
      await expect(paymentRow).toContainText(paymentMethod);

      await page.getByTestId(`financial-commission-edit-${commissionId}`).click();
      await page.getByTestId("financial-commission-edit-amount").fill(String(updatedAmount));
      await page.getByTestId("financial-commission-edit-save").click();

      await expect(financialRow).toContainText(money(updatedAmount), { timeout: 20_000 });
      await expect(financialRow).toContainText(money(paymentAmount));

      await page.goto(`/projects/${PROJECT_ID}?tab=commission`, { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);

      const projectRowAfterEdit = projectCommissionRow(page, person);
      await expect(projectRowAfterEdit).toBeVisible({ timeout: 20_000 });
      await expect(projectRowAfterEdit).toContainText(money(updatedAmount));

      await page.getByTestId(`project-commission-delete-${commissionId}`).click();
      await page.getByTestId("project-commission-delete-confirm").click();
      await expect(projectCommissionRow(page, person)).toHaveCount(0, { timeout: 20_000 });
      commissionId = null;

      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);
      await expect(financialCommissionRow(page, person)).toHaveCount(0, { timeout: 20_000 });

      expect(apiErrors).toEqual([]);
    } finally {
      if (commissionId) {
        await page.request
          .delete(`/api/projects/${PROJECT_ID}/commissions/${commissionId}`)
          .catch(() => null);
      }
    }
  });
});
