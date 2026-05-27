import { test, expect, type Page } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_ID, E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";

const PROJECT_ID = E2E_PRESERVED_PROJECT_ID;

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function parseMoney(value: string | null | undefined) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

async function readMoneyByTestId(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible({ timeout: 20_000 });
  return parseMoney(await locator.textContent());
}

async function expectMoneyByTestId(page: Page, testId: string, value: number) {
  await expect(page.getByTestId(testId)).toHaveText(money(value), { timeout: 20_000 });
}

function financialCommissionRow(page: Page, person: string) {
  return page
    .locator("[data-testid^='financial-commission-row-']:visible")
    .filter({ hasText: person })
    .first();
}

async function assertNoAuthRedirect(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/i);
}

async function runCommissionRowAction(
  page: Page,
  row: ReturnType<typeof financialCommissionRow>,
  name: string
) {
  await row.getByRole("button", { name: /actions for/i }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test.describe("Commission full E2E flow", () => {
  test.describe.configure({ timeout: 180_000 });

  test("financial page add commission creates a project-linked unpaid commission", async ({
    page,
  }) => {
    const stamp = Date.now();
    const person = `PW Financial Commission ${stamp}`;
    const note = `[E2E] financial-commission-add ${stamp}`;
    const amount = 175.25;
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
      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);

      await page.getByTestId("financial-commission-add").click();
      await expect(page.getByRole("dialog", { name: /add commission/i })).toBeVisible();

      await page
        .getByTestId("financial-commission-create-project")
        .selectOption({ label: E2E_PRESERVED_PROJECT_LABEL });
      await page.getByTestId("financial-commission-create-person").fill(person);
      await page.getByTestId("financial-commission-create-role").selectOption("Sales");
      await page.getByTestId("financial-commission-create-amount").fill(String(amount));
      await page.getByTestId("financial-commission-create-notes").fill(note);
      await page.getByTestId("financial-commission-create-save").click();

      const financialRow = financialCommissionRow(page, person);
      await expect(financialRow).toBeVisible({ timeout: 20_000 });
      await expect(financialRow).toContainText(E2E_PRESERVED_PROJECT_LABEL);
      await expect(financialRow).toContainText("Sales");
      await expect(financialRow).toContainText(money(amount));
      await expect(financialRow).toContainText(/Outstanding|Unpaid/i);

      const financialRowTestId = await financialRow.getAttribute("data-testid");
      commissionId = financialRowTestId?.replace("financial-commission-row-", "") ?? null;
      if (!commissionId) throw new Error("Could not determine created commission id.");

      await expect(page.getByTestId("financial-commission-summary-total")).toHaveText(
        money(amount),
        { timeout: 20_000 }
      );
      await expect(page.getByTestId("financial-commission-summary-outstanding")).toHaveText(
        money(amount),
        { timeout: 20_000 }
      );

      const searchBox = page.locator("input[aria-label='Search commissions']:visible").first();
      await searchBox.fill(E2E_PRESERVED_PROJECT_LABEL);
      await expect(financialRow).toBeVisible();

      await searchBox.fill(`no-project-match-${stamp}`);
      await expect(financialRow).toHaveCount(0);
      await expect(page.getByText("No commissions match your filters")).toBeVisible();

      await searchBox.fill(person);
      await expect(financialRow).toBeVisible();

      await page.request.delete(`/api/projects/${PROJECT_ID}/commissions/${commissionId}`);
      commissionId = null;
      await page.reload({ waitUntil: "domcontentloaded" });
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

  test("financial add -> partial payment -> project summary -> delete payment", async ({
    page,
  }) => {
    const stamp = Date.now();
    const person = `PW Payment Audit ${stamp}`;
    const commissionNote = `[E2E] commission-full-flow ${stamp}`;
    const paymentNote = `[E2E] commission-payment ${stamp}`;
    const editedPaymentNote = `[E2E] commission-payment-edited ${stamp}`;
    const commissionAmount = 150;
    const paymentAmount = 50;
    const editedPaymentAmount = 75;
    const paymentDate = new Date().toISOString().slice(0, 10);
    const paymentMethod = "Check";
    const apiErrors: string[] = [];
    let commissionId: string | null = null;
    let paymentId: string | null = null;

    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/api/projects/")) return;
      if (!url.includes("/commissions")) return;
      if (response.status() < 400) return;
      const body = await response.text().catch(() => "");
      apiErrors.push(`${response.status()} ${url}\n${body}`);
    });

    try {
      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);

      await page.getByTestId("financial-commission-add").click();
      await expect(page.getByRole("dialog", { name: /add commission/i })).toBeVisible();
      await page
        .getByTestId("financial-commission-create-project")
        .selectOption({ label: E2E_PRESERVED_PROJECT_LABEL });
      await page.getByTestId("financial-commission-create-person").fill(person);
      await page.getByTestId("financial-commission-create-role").selectOption("Sales");
      await page.getByTestId("financial-commission-create-amount").fill(String(commissionAmount));
      await page.getByTestId("financial-commission-create-notes").fill(commissionNote);
      await page.getByTestId("financial-commission-create-save").click();
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

      const financialRow = financialCommissionRow(page, person);
      await expect(financialRow).toBeVisible({ timeout: 20_000 });
      await expect(financialRow).toContainText(money(commissionAmount));
      await expect(financialRow).toContainText(money(0));
      await expect(financialRow).toContainText(/Outstanding|Unpaid/i);

      const financialRowTestId = await financialRow.getAttribute("data-testid");
      commissionId = financialRowTestId?.replace("financial-commission-row-", "") ?? null;
      if (!commissionId) throw new Error("Could not determine created commission id.");
      const postCreateTotal = await readMoneyByTestId(page, "financial-commission-summary-total");
      const postCreatePaid = await readMoneyByTestId(page, "financial-commission-summary-paid");
      const postCreateOutstanding = await readMoneyByTestId(
        page,
        "financial-commission-summary-outstanding"
      );
      const postCreateThisMonth = await readMoneyByTestId(
        page,
        "financial-commission-summary-this-month"
      );

      await runCommissionRowAction(page, financialRow, "Pay");
      await page.getByTestId("financial-record-payment-amount").fill(String(paymentAmount));
      await page.getByTestId("financial-record-payment-date").fill(paymentDate);
      await page.getByTestId("financial-record-payment-method").selectOption(paymentMethod);
      await page.getByTestId("financial-record-payment-note").fill(paymentNote);
      await page.getByTestId("financial-record-payment-save").click();

      await expect(financialRow).toContainText(money(paymentAmount), { timeout: 20_000 });
      await expect(financialRow).toContainText(money(commissionAmount - paymentAmount));
      await expect(financialRow).toContainText(/Partial/i);
      await expectMoneyByTestId(page, "financial-commission-summary-total", postCreateTotal);
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-paid",
        postCreatePaid + paymentAmount
      );
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-outstanding",
        postCreateOutstanding - paymentAmount
      );
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-this-month",
        postCreateThisMonth + paymentAmount
      );

      await financialRow.getByTestId(`financial-commission-expand-${commissionId}`).click();
      const paymentRow = page
        .locator("[data-testid^='financial-payment-row-']:visible")
        .filter({ hasText: paymentNote })
        .first();
      await expect(paymentRow).toBeVisible({ timeout: 15_000 });
      await expect(paymentRow).toContainText(money(paymentAmount));
      await expect(paymentRow).toContainText(displayDate(paymentDate));
      await expect(paymentRow).toContainText(paymentMethod);

      const paymentRowTestId = await paymentRow.getAttribute("data-testid");
      paymentId = paymentRowTestId?.replace("financial-payment-row-", "") ?? null;
      if (!paymentId) throw new Error("Could not determine created payment id.");

      await paymentRow.getByTestId(`financial-payment-edit-${paymentId}`).click();
      await page.getByTestId("financial-payment-edit-amount").fill(String(editedPaymentAmount));
      await page.getByTestId("financial-payment-edit-note").fill(editedPaymentNote);
      await page.getByTestId("financial-payment-edit-save").click();

      await expect(financialRow).toContainText(money(editedPaymentAmount), { timeout: 20_000 });
      await expect(financialRow).toContainText(money(commissionAmount - editedPaymentAmount));
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-paid",
        postCreatePaid + editedPaymentAmount
      );
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-outstanding",
        postCreateOutstanding - editedPaymentAmount
      );
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-this-month",
        postCreateThisMonth + editedPaymentAmount
      );

      await page.goto(`/projects/${PROJECT_ID}?tab=cost`, { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);

      const projectCostRow = page.getByTestId(`project-cost-commission-row-${commissionId}`);
      await expect(projectCostRow).toBeVisible({ timeout: 20_000 });
      await expect(projectCostRow).toContainText(person);
      await expect(projectCostRow).toContainText(money(commissionAmount));
      await expect(projectCostRow).toContainText(money(editedPaymentAmount));
      await expect(projectCostRow).toContainText(/Partial/i);
      await expect(page.getByTestId("project-cost-commission-paid")).toContainText(
        money(editedPaymentAmount),
        { timeout: 20_000 }
      );
      await expect(page.getByTestId("project-cost-commission-outstanding")).toContainText(
        money(commissionAmount - editedPaymentAmount),
        { timeout: 20_000 }
      );

      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);
      await page.locator("input[aria-label='Search commissions']:visible").first().fill(person);
      const filteredFinancialRow = financialCommissionRow(page, person);
      await expect(filteredFinancialRow).toBeVisible({ timeout: 20_000 });
      await filteredFinancialRow.getByTestId(`financial-commission-expand-${commissionId}`).click();
      const filteredPaymentRow = page
        .locator("[data-testid^='financial-payment-row-']:visible")
        .filter({ hasText: editedPaymentNote })
        .first();
      await expect(filteredPaymentRow).toBeVisible({ timeout: 15_000 });
      await filteredPaymentRow.getByTestId(`financial-payment-delete-${paymentId}`).click();
      const deletePaymentDialog = page.getByRole("dialog", { name: /delete payment/i });
      await expect(deletePaymentDialog).toBeVisible();
      await deletePaymentDialog.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByTestId(`financial-payment-row-${paymentId}`)).toHaveCount(0, {
        timeout: 20_000,
      });
      paymentId = null;
      await expect(filteredFinancialRow).toContainText(money(0), { timeout: 20_000 });
      await expect(filteredFinancialRow).toContainText(money(commissionAmount));
      await expectMoneyByTestId(page, "financial-commission-summary-paid", postCreatePaid);
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-outstanding",
        postCreateOutstanding
      );
      await expectMoneyByTestId(
        page,
        "financial-commission-summary-this-month",
        postCreateThisMonth
      );

      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await assertNoAuthRedirect(page);
      await page.request.delete(`/api/projects/${PROJECT_ID}/commissions/${commissionId}`);
      commissionId = null;
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(financialCommissionRow(page, person)).toHaveCount(0, { timeout: 20_000 });

      expect(apiErrors).toEqual([]);
    } finally {
      if (paymentId && commissionId) {
        await page.request
          .delete(`/api/projects/${PROJECT_ID}/commissions/${commissionId}/payments/${paymentId}`)
          .catch(() => null);
      }
      if (commissionId) {
        await page.request
          .delete(`/api/projects/${PROJECT_ID}/commissions/${commissionId}`)
          .catch(() => null);
      }
    }
  });
});
