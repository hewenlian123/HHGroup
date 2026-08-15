import { randomUUID } from "crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  clickVisibleQuickExpenseButton,
  expenseListRowById,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function chooseSearchResult(
  page: Page,
  trigger: Locator,
  query: string,
  optionName: string | RegExp
): Promise<void> {
  await expect(trigger).toBeEnabled({ timeout: 60_000 });
  await trigger.click();
  const content = page.locator('[data-expense-combobox-content="true"]').last();
  await expect(content).toBeVisible({ timeout: 15_000 });
  const search = content.getByRole("searchbox", { name: /search options/i });
  await search.fill(query);
  const option = content.getByRole("option", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await search.press("Enter");
  await expect(content).toBeHidden({ timeout: 10_000 });
}

async function cleanupFixture(admin: SupabaseClient, marker: string): Promise<void> {
  const { data: expenses } = await admin
    .from("expenses")
    .select("id")
    .or(`vendor_name.ilike.${marker}%,vendor.ilike.${marker}%`);
  const expenseIds = (expenses ?? []).map((row) => String((row as { id: string }).id));
  if (expenseIds.length > 0) {
    await admin.from("subcontract_deductions").delete().in("expense_id", expenseIds);
    await admin.from("expense_lines").delete().in("expense_id", expenseIds);
    await admin.from("expenses").delete().in("id", expenseIds);
  }
  const { data: projects } = await admin.from("projects").select("id").ilike("name", `${marker}%`);
  const projectIds = (projects ?? []).map((row) => String((row as { id: string }).id));
  const { data: subcontracts } = await admin
    .from("subcontracts")
    .select("id")
    .in(
      "project_id",
      projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"]
    );
  const subcontractIds = (subcontracts ?? []).map((row) => String((row as { id: string }).id));
  if (subcontractIds.length > 0) {
    await admin.from("subcontract_deductions").delete().in("subcontract_id", subcontractIds);
    await admin.from("subcontract_payments").delete().in("subcontract_id", subcontractIds);
    await admin.from("subcontract_bills").delete().in("subcontract_id", subcontractIds);
    await admin.from("subcontracts").delete().in("id", subcontractIds);
  }
  await admin.from("subcontractors").delete().ilike("name", `${marker}%`);
  if (projectIds.length > 0) await admin.from("projects").delete().in("id", projectIds);
}

async function seedFixture(admin: SupabaseClient, marker: string) {
  await cleanupFixture(admin, marker);
  const ids = {
    projectId: randomUUID(),
    subcontractorId: randomUUID(),
    subcontractId: randomUUID(),
    billId: randomUUID(),
  };
  const projectName = `${marker} Project`;
  const subcontractorName = `${marker} Subcontractor`;

  const project = await admin.from("projects").insert({
    id: ids.projectId,
    name: projectName,
    status: "active",
    budget: 20000,
    contract_amount: 20000,
  });
  expect(project.error?.message ?? "").toBe("");

  const subcontractor = await admin.from("subcontractors").insert({
    id: ids.subcontractorId,
    name: subcontractorName,
    active: true,
  });
  expect(subcontractor.error?.message ?? "").toBe("");

  const subcontract = await admin.from("subcontracts").insert({
    id: ids.subcontractId,
    project_id: ids.projectId,
    subcontractor_id: ids.subcontractorId,
    cost_code: "SUBDED",
    contract_amount: 10000,
    status: "Active",
    description: `${marker} material deduction contract`,
  });
  expect(subcontract.error?.message ?? "").toBe("");

  const bill = await admin.from("subcontract_bills").insert({
    id: ids.billId,
    subcontract_id: ids.subcontractId,
    project_id: ids.projectId,
    bill_date: "2026-06-13",
    due_date: "2026-06-20",
    amount: 10000,
    description: `${marker} approved bill`,
    status: "Approved",
  });
  expect(bill.error?.message ?? "").toBe("");

  return { ...ids, projectName, subcontractorName };
}

async function snapshotActualCost(page: Page, projectId: string): Promise<number> {
  const response = await page.request.get(`/api/projects/${projectId}/financial-snapshot`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    ok?: boolean;
    comparison?: { newSnapshot?: { actualCost?: number; expenseCost?: number } };
  };
  expect(body.ok).toBe(true);
  return Number(body.comparison?.newSnapshot?.actualCost ?? 0);
}

test.describe("Expense subcontract material deductions", () => {
  test.describe.configure({ timeout: 180_000 });

  test("keeps expense as project cost while reducing subcontractor net payable", async ({
    page,
  }) => {
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required for local subcontract deduction E2E.");

    const marker = `ZZ-E2E-SUBDED-${Date.now()}`;
    const fixture = await seedFixture(admin!, marker);
    const vendor = `${marker} Materials`;

    try {
      await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page);

      const baselineActualCost = await snapshotActualCost(page, fixture.projectId);
      expect(baselineActualCost).toBeGreaterThanOrEqual(10000);

      await clickVisibleQuickExpenseButton(page);
      const dialog = page.getByRole("dialog", { name: /New expense/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await dialog.locator("input[type='number']").first().fill("1000");
      await dialog.locator("#quick-expense-vendor").fill(vendor);
      await chooseSearchResult(
        page,
        dialog.locator("#quick-expense-cost-allocation-select"),
        "project",
        "Project Cost"
      );
      await chooseSearchResult(
        page,
        dialog.locator("#quick-expense-project-select"),
        fixture.projectName.slice(0, 12),
        fixture.projectName
      );
      await dialog.getByRole("button", { name: /More Details/i }).click();
      await dialog.getByTestId("quick-expense-subcontract-deduction-checkbox").check();
      await chooseSearchResult(
        page,
        dialog.locator("#quick-expense-subcontract-deduction-subcontractor-select"),
        "subded",
        new RegExp(fixture.subcontractorName)
      );
      await dialog.getByTestId("quick-expense-subcontract-deduction-amount").fill("1000");
      await dialog
        .getByTestId("quick-expense-subcontract-deduction-note")
        .fill("Company paid material");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();

      await expect
        .poll(
          async () => {
            const { data } = await admin!
              .from("expenses")
              .select("id")
              .eq("vendor_name", vendor)
              .maybeSingle();
            return (data as { id?: string } | null)?.id ?? "";
          },
          { timeout: 45_000, intervals: [500, 1000, 2000] }
        )
        .not.toBe("");
      const { data: savedExpense } = await admin!
        .from("expenses")
        .select("id")
        .eq("vendor_name", vendor)
        .maybeSingle();
      const expenseId = String((savedExpense as { id?: string } | null)?.id ?? "");
      expect(expenseId).not.toBe("");
      const { data: deduction } = await admin!
        .from("subcontract_deductions")
        .select("amount, subcontract_id")
        .eq("expense_id", expenseId)
        .maybeSingle();
      expect(Number((deduction as { amount?: number } | null)?.amount)).toBe(1000);
      expect((deduction as { subcontract_id?: string } | null)?.subcontract_id).toBe(
        fixture.subcontractId
      );

      const afterExpenseActualCost = await snapshotActualCost(page, fixture.projectId);
      expect(afterExpenseActualCost).toBeCloseTo(baselineActualCost + 1000, 2);

      await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, { waitUntil: "domcontentloaded" });
      await waitForExpensesQuerySuccess(page);
      await expensesVendorSearch(page).fill(vendor);
      const row = expenseListRowById(page, expenseId);
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole("button", { name: /row actions/i }).click();
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
      const editDialog = page.getByRole("dialog", { name: /Edit expense/i });
      await expect(editDialog).toBeVisible({ timeout: 15_000 });
      await editDialog.getByTestId("inbox-preview-subcontract-deduction-checkbox").uncheck();
      await editDialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(
          async () => {
            const { count } = await admin!
              .from("subcontract_deductions")
              .select("id", { count: "exact", head: true })
              .eq("expense_id", expenseId);
            return count ?? 0;
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] }
        )
        .toBe(0);

      const previewDialog = page.getByRole("dialog", { name: /^Expense$/i });
      await expect(previewDialog).toBeVisible({ timeout: 15_000 });
      await previewDialog.getByRole("button", { name: "Edit", exact: true }).click();
      const editDialogAgain = page.getByRole("dialog", { name: /Edit expense/i });
      await expect(editDialogAgain).toBeVisible({ timeout: 15_000 });
      await editDialogAgain.getByTestId("inbox-preview-subcontract-deduction-checkbox").check();
      await chooseSearchResult(
        page,
        editDialogAgain.locator("#inbox-preview-subcontract-deduction-subcontractor-select"),
        "subded",
        new RegExp(fixture.subcontractorName)
      );
      await editDialogAgain.getByTestId("inbox-preview-subcontract-deduction-amount").fill("1000");
      await editDialogAgain.getByRole("button", { name: "Save", exact: true }).click();
      await expect
        .poll(
          async () => {
            const { data } = await admin!
              .from("subcontract_deductions")
              .select("amount, subcontract_id")
              .eq("expense_id", expenseId)
              .maybeSingle();
            if (!data) return "";
            const row = data as { amount?: number; subcontract_id?: string | null };
            return `${row.subcontract_id ?? ""}:${Number(row.amount ?? 0)}`;
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] }
        )
        .toBe(`${fixture.subcontractId}:1000`);

      await page.goto(`/subcontractors/${fixture.subcontractorId}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByText("Material Deductions")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("$1,000.00").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Net Payable").first()).toBeVisible();
      await expect(page.getByText("$9,000.00").first()).toBeVisible();

      await page.goto(
        `/projects/${fixture.projectId}/subcontracts/${fixture.subcontractId}/bills`,
        {
          waitUntil: "domcontentloaded",
        }
      );
      await page.getByRole("button", { name: "Record payment", exact: true }).click();
      const payDialog = page.getByRole("dialog", { name: /Record payment/i });
      await expect(payDialog).toBeVisible({ timeout: 15_000 });
      await expect(payDialog.getByText("Material deductions")).toBeVisible();
      await expect(payDialog.getByText("Net payable")).toBeVisible();
      await expect(payDialog.getByText("$9,000.00").first()).toBeVisible();
      await payDialog.getByLabel("Payment amount").fill("10000");
      await payDialog.getByRole("button", { name: "Record", exact: true }).click();
      await expect(payDialog.getByText(/Payment exceeds net payable/i)).toBeVisible({
        timeout: 10_000,
      });
      await payDialog.getByLabel("Payment amount").fill("9000");
      await payDialog.getByRole("button", { name: "Record", exact: true }).click();
      await expect(payDialog).not.toBeVisible({ timeout: 30_000 });

      await expect
        .poll(
          async () => {
            const { data } = await admin!
              .from("subcontract_payments")
              .select("amount")
              .eq("subcontract_id", fixture.subcontractId);
            return (data ?? []).reduce(
              (sum, row) => sum + Number((row as { amount: number }).amount),
              0
            );
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] }
        )
        .toBe(9000);
    } finally {
      await cleanupFixture(admin!, marker);
    }
  });
});
