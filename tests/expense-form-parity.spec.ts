import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  clickVisibleQuickExpenseButton,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

const TEST_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  "utf8"
);

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
) {
  await trigger.click();
  const content = page.locator('[data-expense-combobox-content="true"]').last();
  await expect(content).toBeVisible({ timeout: 15_000 });
  const search = content.getByRole("searchbox", { name: /search options/i });
  await search.fill(query);
  await content.getByRole("option", { name: optionName }).first().click();
}

async function seedParityFixture(admin: SupabaseClient, marker: string) {
  const ids = {
    projectId: randomUUID(),
  };
  const projectName = `${marker} Project`;

  const project = await admin.from("projects").insert({
    id: ids.projectId,
    name: projectName,
    status: "active",
    budget: 20000,
    contract_amount: 20000,
  });
  expect(project.error?.message ?? "").toBe("");
  const { data: account, error: accountError } = await admin
    .from("payment_accounts")
    .select("id,name")
    .eq("name", "Amex")
    .maybeSingle();
  expect(accountError, accountError?.message).toBeNull();
  expect(account?.id).toBeTruthy();

  return {
    ...ids,
    projectName,
    paymentAccountId: String(account!.id),
    paymentAccountName: String(account!.name),
  };
}

async function cleanupParityFixture(
  admin: SupabaseClient,
  marker: string,
  fixture: Awaited<ReturnType<typeof seedParityFixture>>
) {
  const { data: expenses } = await admin
    .from("expenses")
    .select("id")
    .or(`vendor_name.ilike.${marker}%,vendor.ilike.${marker}%`);
  const expenseIds = (expenses ?? []).map((row) => String(row.id));
  if (expenseIds.length > 0) {
    const { data: attachments } = await admin
      .from("attachments")
      .select("file_path")
      .eq("entity_type", "expense")
      .in("entity_id", expenseIds);
    const storagePaths = (attachments ?? [])
      .map((row) => String(row.file_path ?? ""))
      .filter(Boolean);
    if (storagePaths.length > 0) {
      await admin.storage.from("expense-attachments").remove(storagePaths);
    }
    await admin
      .from("attachments")
      .delete()
      .eq("entity_type", "expense")
      .in("entity_id", expenseIds);
    await admin.from("expense_lines").delete().in("expense_id", expenseIds);
    await admin.from("expenses").delete().in("id", expenseIds);
  }
  await admin.from("projects").delete().eq("id", fixture.projectId);
}

test.describe("Unified Expense form parity", () => {
  test.describe.configure({ timeout: 240_000 });

  test("creates with every locally available New field and preserves values through Edit + reopen", async ({
    page,
  }) => {
    const admin = adminClient();
    test.skip(!admin, "Local Supabase service role is required for deterministic parity QA.");
    const marker = `ZZ-E2E-FORM-PARITY-${Date.now()}`;
    const fixture = await seedParityFixture(admin!, marker);
    const vendor = `${marker} Vendor`;
    const editedVendor = `${marker} Vendor Edited`;
    const description = "Deterministic all-field creation";
    const editedDescription = "Deterministic values after edit";
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500 && response.url().startsWith("http://127.0.0.1:3002/")) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    try {
      await loginAsE2EOwner(page, "/financial/expenses");
      await waitForExpensesQuerySuccess(page);
      await clickVisibleQuickExpenseButton(page);
      const dialog = page.getByRole("dialog", { name: /New expense/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      await dialog.locator("[data-new-expense-amount]").fill("432.10");
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
        marker.slice(0, 18),
        fixture.projectName
      );
      await chooseSearchResult(
        page,
        dialog.locator("#quick-expense-category-select"),
        "materials",
        "Materials"
      );
      await dialog.locator("#quick-expense-date").click();
      await page
        .locator('[data-finance-date-picker-content="true"]')
        .last()
        .getByRole("button", { name: "Saturday, August 15th, 2026" })
        .click();

      await dialog.getByRole("button", { name: /More Details/i }).click();
      const more = dialog.locator("[data-quick-expense-more-content]");
      await expect(more).toBeVisible();
      await chooseSearchResult(
        page,
        more.locator("#quick-expense-payment-select"),
        "amex",
        fixture.paymentAccountName
      );
      await more.getByPlaceholder("Add item").fill("Lumber");
      await more.getByRole("button", { name: "Add", exact: true }).click();
      await more.locator("textarea").fill(description);
      await dialog.getByTestId("quick-expense-receipt-input").setInputFiles({
        name: `${marker}.pdf`,
        mimeType: "application/pdf",
        buffer: TEST_PDF,
      });
      await expect(dialog.getByText("Uploaded", { exact: true }).first()).toBeVisible({
        timeout: 90_000,
      });

      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).not.toBeVisible({ timeout: 90_000 });

      const { data: createdRows, error: createdError } = await admin!
        .from("expenses")
        .select("id,expense_date,vendor_name,total,notes,source_type,payment_account_id")
        .eq("vendor_name", vendor)
        .limit(1);
      expect(createdError, createdError?.message).toBeNull();
      expect(createdRows).toHaveLength(1);
      const expenseId = String(createdRows![0]!.id);
      expect(createdRows![0]).toMatchObject({
        expense_date: "2026-08-15",
        vendor_name: vendor,
        notes: `${description}\nItems: Lumber`,
        source_type: "receipt_upload",
        payment_account_id: fixture.paymentAccountId,
      });
      expect(Number(createdRows![0]!.total)).toBeCloseTo(432.1, 2);

      const [{ data: lines }, { data: attachments }] = await Promise.all([
        admin!
          .from("expense_lines")
          .select("project_id,category,amount")
          .eq("expense_id", expenseId),
        admin!
          .from("attachments")
          .select("id,file_path")
          .eq("entity_type", "expense")
          .eq("entity_id", expenseId),
      ]);
      expect(lines?.[0]).toMatchObject({
        project_id: fixture.projectId,
        category: "Materials",
      });
      expect(Number(lines?.[0]?.amount)).toBeCloseTo(432.1, 2);
      expect(attachments?.length).toBe(1);

      await page.goto(`/financial/expenses?date_kind=all&ops_record=${expenseId}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForExpensesQuerySuccess(page);
      const panel = page.locator("[data-expense-detail-panel]");
      await expect(panel).toBeVisible({ timeout: 60_000 });
      await panel.getByRole("button", { name: "Edit Expense" }).click();
      await panel.locator("summary").filter({ hasText: "More Details" }).click();
      await expect(panel.getByPlaceholder("Add item")).toBeVisible();
      await expect(panel.getByRole("button", { name: "Remove Lumber" })).toBeVisible();
      await expect(panel.locator("textarea")).toHaveValue(description);
      await expect(panel.locator("#edit-expense-payment-select")).toContainText(
        fixture.paymentAccountName
      );
      const receiptButton = panel.getByRole("button", { name: `Open ${marker}.pdf` });
      await expect(receiptButton).toBeVisible();
      await receiptButton.click();
      const receiptPreview = page.locator("[data-attachment-preview-modal]");
      await expect(receiptPreview).toBeVisible({ timeout: 30_000 });
      await receiptPreview.getByRole("button", { name: "Close" }).click();
      await expect(receiptPreview).toBeHidden({ timeout: 15_000 });

      await panel.getByTestId("edit-expense-vendor-input").fill(editedVendor);
      await panel.locator('input[type="number"]').first().fill("443.20");
      await panel.getByPlaceholder("Add item").fill("Fasteners");
      await panel.getByRole("button", { name: "Add", exact: true }).click();
      await panel.locator("textarea").fill(editedDescription);
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      await expect(panel).toHaveAttribute("data-expense-detail-mode", "preview", {
        timeout: 30_000,
      });

      await page.goto(`/financial/expenses?date_kind=all&ops_record=${expenseId}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForExpensesQuerySuccess(page);
      const reopenedPanel = page.locator("[data-expense-detail-panel]");
      await expect(reopenedPanel).toBeVisible({ timeout: 60_000 });
      await reopenedPanel.getByRole("button", { name: "Edit Expense" }).click();
      await reopenedPanel.locator("summary").filter({ hasText: "More Details" }).click();
      await expect(reopenedPanel.getByTestId("edit-expense-vendor-input")).toHaveValue(
        editedVendor
      );
      await expect(reopenedPanel.locator('input[type="number"]').first()).toHaveValue("443.2");
      await expect(reopenedPanel.locator("textarea")).toHaveValue(editedDescription);
      await expect(reopenedPanel.getByRole("button", { name: "Remove Lumber" })).toBeVisible();
      await expect(reopenedPanel.getByRole("button", { name: "Remove Fasteners" })).toBeVisible();

      const { data: reopened, error: reopenedError } = await admin!
        .from("expenses")
        .select("vendor_name,total,notes,payment_account_id")
        .eq("id", expenseId)
        .maybeSingle();
      expect(reopenedError, reopenedError?.message).toBeNull();
      expect(reopened).toMatchObject({
        vendor_name: editedVendor,
        notes: `${editedDescription}\nItems: Lumber, Fasteners`,
        payment_account_id: fixture.paymentAccountId,
      });
      expect(Number(reopened?.total)).toBeCloseTo(443.2, 2);

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1280, height: 800 },
        { width: 1024, height: 768 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/financial/expenses?date_kind=all&ops_record=${expenseId}`, {
          waitUntil: "domcontentloaded",
        });
        await waitForExpensesQuerySuccess(page);
        const responsivePanel = page.locator("[data-expense-detail-panel]");
        await expect(responsivePanel).toBeVisible({ timeout: 60_000 });
        await responsivePanel.getByRole("button", { name: "Edit Expense" }).click();
        await responsivePanel.locator("summary").filter({ hasText: "More Details" }).click();
        await expect(responsivePanel.getByPlaceholder("Add item")).toBeVisible();

        const overflow = await page.evaluate(() => {
          const tolerance = 2;
          const root = document.documentElement;
          const panel = document.querySelector("[data-expense-detail-panel]");
          return {
            page: root.scrollWidth > root.clientWidth + tolerance,
            panel: Boolean(panel && panel.scrollWidth > panel.clientWidth + tolerance),
          };
        });
        expect(overflow).toEqual({ page: false, panel: false });

        if (viewport.width <= 768) {
          for (const actionName of ["Cancel", "Save"]) {
            const action = responsivePanel.getByRole("button", {
              name: actionName,
              exact: true,
            });
            const height = await action.evaluate(
              (element) => element.getBoundingClientRect().height
            );
            expect(height).toBeGreaterThanOrEqual(44);
          }
        }
      }

      await page.evaluate(() => document.documentElement.classList.add("dark"));
      const darkPanel = page.locator("[data-expense-detail-panel]");
      await expect(darkPanel).toBeVisible();
      await expect(darkPanel).toHaveCSS("background-color", "rgb(24, 24, 24)");
      const darkSurface = await darkPanel.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      expect(darkSurface).not.toBe("rgb(255, 255, 255)");
      await page.evaluate(() => document.documentElement.classList.remove("dark"));

      const saveAndNewVendor = `${marker} Save And New`;
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/financial/expenses?date_kind=all", { waitUntil: "domcontentloaded" });
      await waitForExpensesQuerySuccess(page);
      await clickVisibleQuickExpenseButton(page);
      const saveAndNewDialog = page.getByRole("dialog", { name: /New expense/i });
      await expect(saveAndNewDialog).toBeVisible({ timeout: 30_000 });
      await saveAndNewDialog.locator("[data-new-expense-amount]").fill("18.75");
      await saveAndNewDialog.locator("#quick-expense-vendor").fill(saveAndNewVendor);
      await chooseSearchResult(
        page,
        saveAndNewDialog.locator("#quick-expense-cost-allocation-select"),
        "overhead",
        "Overhead"
      );
      await chooseSearchResult(
        page,
        saveAndNewDialog.locator("#quick-expense-category-select"),
        "other",
        "Other"
      );
      await saveAndNewDialog.getByRole("button", { name: "Save & New", exact: true }).click();
      await expect(saveAndNewDialog).toBeVisible({ timeout: 90_000 });
      await expect(saveAndNewDialog.locator("[data-new-expense-amount]")).toHaveValue("");
      await expect(saveAndNewDialog.locator("#quick-expense-vendor")).toHaveValue("");
      const { data: saveAndNewRows, error: saveAndNewError } = await admin!
        .from("expenses")
        .select("id,vendor_name,total")
        .eq("vendor_name", saveAndNewVendor);
      expect(saveAndNewError, saveAndNewError?.message).toBeNull();
      expect(saveAndNewRows).toHaveLength(1);
      expect(Number(saveAndNewRows![0]!.total)).toBeCloseTo(18.75, 2);
      await saveAndNewDialog.getByRole("button", { name: "Close" }).click();

      expect(pageErrors).toEqual([]);
      expect(serverErrors).toEqual([]);
    } finally {
      await cleanupParityFixture(admin!, marker, fixture);
    }
  });
});
