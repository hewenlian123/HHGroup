import { randomUUID } from "crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expenseListRowById,
  expensesVendorSearch,
  waitForVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";

test.use({ storageState: "tests/.auth/ui-readonly-owner.json" });

const E2E_PRESERVED_PROJECT_ID = "11111111-1111-1111-1111-111111111111";

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cleanupExpense(admin: SupabaseClient, expenseId: string) {
  await admin.from("attachments").delete().eq("entity_type", "expense").eq("entity_id", expenseId);
  await admin.from("expense_attachments").delete().eq("expense_id", expenseId);
  await admin.from("expense_lines").delete().eq("expense_id", expenseId);
  await admin.from("expenses").delete().eq("id", expenseId);
}

async function relatedCounts(admin: SupabaseClient, expenseId: string) {
  const [expenses, lines, attachments, expenseAttachments] = await Promise.all([
    admin.from("expenses").select("id", { count: "exact", head: true }).eq("id", expenseId),
    admin
      .from("expense_lines")
      .select("id", { count: "exact", head: true })
      .eq("expense_id", expenseId),
    admin
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "expense")
      .eq("entity_id", expenseId),
    admin
      .from("expense_attachments")
      .select("id", { count: "exact", head: true })
      .eq("expense_id", expenseId),
  ]);
  for (const res of [expenses, lines, attachments, expenseAttachments]) {
    expect(res.error, res.error ? JSON.stringify(res.error) : "").toBeNull();
  }
  return {
    expenses: expenses.count ?? 0,
    lines: lines.count ?? 0,
    attachments: attachments.count ?? 0,
    expenseAttachments: expenseAttachments.count ?? 0,
  };
}

test.describe("Expense delete", () => {
  test("deletes an expense through the UI server route and clears related metadata", async ({
    page,
  }) => {
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required to seed expense delete test data.");

    const vendor = `ZZ-E2E-EXP-DELETE-${Date.now()}`;
    const today = hawaiiTodayYmd();
    await page.goto("/financial/expenses", { waitUntil: "networkidle", timeout: 60_000 });
    await waitForVisibleQuickExpenseButton(page, 90_000);

    const created = await page.evaluate(
      async (data) => {
        const response = await fetch("/api/financial/expenses/quick-expense", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        date: today,
        vendorName: vendor,
        totalAmount: 4.56,
        sourceType: "company",
        category: "Materials",
        initialStatus: "reviewed",
        projectId: E2E_PRESERVED_PROJECT_ID,
        idempotencyKey: randomUUID(),
      }
    );
    expect(created.status).toBe(200);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    const attachmentInsert = await admin!.from("attachments").insert({
      entity_type: "expense",
      entity_id: expenseId,
      file_name: `${vendor}.jpg`,
      file_path: `e2e/${vendor}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 12,
    });
    expect(
      attachmentInsert.error,
      attachmentInsert.error ? JSON.stringify(attachmentInsert.error) : ""
    ).toBeNull();

    const expenseAttachmentInsert = await admin!.from("expense_attachments").insert({
      expense_id: expenseId,
      file_url: `e2e/${vendor}.jpg`,
      file_type: "image",
    });
    expect(
      expenseAttachmentInsert.error,
      expenseAttachmentInsert.error ? JSON.stringify(expenseAttachmentInsert.error) : ""
    ).toBeNull();

    try {
      await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
      await waitForVisibleQuickExpenseButton(page, 90_000);
      const row = expenseListRowById(page, expenseId);
      await expect(row).toBeVisible({ timeout: 60_000 });

      let nativeDialogs = 0;
      page.on("dialog", async (dialog) => {
        nativeDialogs += 1;
        await dialog.dismiss();
      });
      await row.hover().catch(() => undefined);
      const actions = row.getByRole("button", { name: /Row actions/i }).first();
      await actions.focus();
      await actions.click();
      await page.getByRole("menuitem", { name: /Delete/i }).click();
      let confirm = page.getByRole("dialog", { name: "Delete expense?" });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      expect(nativeDialogs).toBe(0);
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await expect(confirm).toBeHidden();
      await expect(actions).toBeFocused();

      await actions.click();
      const deleteMenuItem = page.getByRole("menuitem", { name: /Delete/i });
      await expect(deleteMenuItem).toBeVisible();
      await deleteMenuItem.click();
      confirm = page.getByRole("dialog", { name: "Delete expense?" });
      await expect(confirm).toBeVisible();
      const deleteResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url().includes(`/api/expenses/${expenseId}`),
        { timeout: 30_000 }
      );
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();

      const response = await deleteResponse;
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { ok?: boolean };
      expect(body.ok).toBe(true);
      await expect(page.getByText("Expense deleted").first()).toBeVisible({ timeout: 30_000 });

      await expect
        .poll(() => relatedCounts(admin!, expenseId), {
          timeout: 15_000,
          intervals: [500, 1000, 2000],
        })
        .toEqual({ expenses: 0, lines: 0, attachments: 0, expenseAttachments: 0 });
    } finally {
      await cleanupExpense(admin!, expenseId);
    }
  });

  test("shows a precise reason when a reviewed business expense is protected", async ({ page }) => {
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required to seed expense delete test data.");

    const vendor = `HH-DELETE-BLOCK-${Date.now()}`;
    const today = hawaiiTodayYmd();
    await page.goto("/financial/expenses", { waitUntil: "networkidle", timeout: 60_000 });
    await waitForVisibleQuickExpenseButton(page, 90_000);

    const created = await page.evaluate(
      async (data) => {
        const response = await fetch("/api/financial/expenses/quick-expense", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        date: today,
        vendorName: vendor,
        totalAmount: 7.89,
        sourceType: "company",
        category: "Materials",
        initialStatus: "reviewed",
        projectId: E2E_PRESERVED_PROJECT_ID,
        idempotencyKey: randomUUID(),
      }
    );
    expect(created.status).toBe(200);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    try {
      await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
      await waitForVisibleQuickExpenseButton(page, 90_000);
      const row = expenseListRowById(page, expenseId);
      await expect(row).toBeVisible({ timeout: 60_000 });

      const deleteResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url().includes(`/api/expenses/${expenseId}`),
        { timeout: 30_000 }
      );
      let nativeDialogs = 0;
      page.on("dialog", async (dialog) => {
        nativeDialogs += 1;
        await dialog.dismiss();
      });
      await row.hover().catch(() => undefined);
      await row
        .getByRole("button", { name: /Row actions/i })
        .first()
        .click();
      await page.getByRole("menuitem", { name: /Delete/i }).click();
      const confirm = page.getByRole("dialog", { name: "Delete expense?" });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      expect(nativeDialogs).toBe(0);
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();

      const response = await deleteResponse;
      expect(response.status()).toBe(409);
      await expect(confirm.getByRole("alert")).toContainText(
        /Reviewed or approved expenses cannot be hard-deleted/i
      );
      await expect(row).toBeVisible();

      await expect
        .poll(() => relatedCounts(admin!, expenseId), {
          timeout: 15_000,
          intervals: [500, 1000, 2000],
        })
        .toMatchObject({ expenses: 1, lines: 1 });
    } finally {
      await cleanupExpense(admin!, expenseId);
    }
  });

  test("opens one canonical confirmation for the Inbox D shortcut", async ({ page }) => {
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required to seed expense delete test data.");

    const expenseId = randomUUID();
    const vendor = `ZZ-E2E-EXP-D-SHORTCUT-${Date.now()}`;
    const today = hawaiiTodayYmd();
    await cleanupExpense(admin!, expenseId);
    const inserted = await admin!.from("expenses").insert({
      id: expenseId,
      vendor_name: vendor,
      vendor,
      payment_method: "Amex",
      status: "pending",
      expense_date: today,
      source_type: "company",
      amount: 4.56,
      total: 4.56,
      line_count: 1,
    });
    expect(inserted.error, inserted.error ? JSON.stringify(inserted.error) : "").toBeNull();
    const line = await admin!.from("expense_lines").insert({
      expense_id: expenseId,
      category: "Other",
      amount: 4.56,
      total: 4.56,
    });
    expect(line.error, line.error ? JSON.stringify(line.error) : "").toBeNull();

    try {
      let nativeDialogs = 0;
      page.on("dialog", async (dialog) => {
        nativeDialogs += 1;
        await dialog.dismiss();
      });
      await page.goto("/financial/inbox", { waitUntil: "networkidle", timeout: 60_000 });
      await waitForVisibleQuickExpenseButton(page, 90_000);
      await expensesVendorSearch(page).fill(vendor);
      const row = expenseListRowById(page, expenseId);
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.focus();
      await page.keyboard.press("d");

      const confirm = page.getByRole("dialog", { name: "Delete expense?" });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      expect(nativeDialogs).toBe(0);
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await expect(row).toBeFocused();
      await expect(row).toBeVisible();
    } finally {
      await cleanupExpense(admin!, expenseId);
    }
  });
});
