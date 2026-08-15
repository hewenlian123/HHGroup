import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  expenseListRowById,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";

type SeededSystemHealthExpense = {
  expenseId: string;
  projectId: string;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cleanupSystemHealthExpense(
  admin: SupabaseClient,
  seeded: SeededSystemHealthExpense | null
): Promise<void> {
  if (!seeded) return;
  await admin.from("expense_lines").delete().eq("expense_id", seeded.expenseId);
  await admin.from("expenses").delete().eq("id", seeded.expenseId);
  await admin.from("projects").delete().eq("id", seeded.projectId);
}

async function seedSystemHealthExpense(admin: SupabaseClient): Promise<SeededSystemHealthExpense> {
  const expenseId = randomUUID();
  const projectId = randomUUID();
  const prefix = `E2E-SH-FOCUS-${Date.now().toString(36).toUpperCase()}`;
  const expenseDate = hawaiiTodayYmd();

  const projectInsert = await admin.from("projects").insert({
    id: projectId,
    name: `${prefix} Project`,
    status: "active",
  });
  expect(projectInsert.error, projectInsert.error?.message).toBeNull();

  const expenseInsert = await admin.from("expenses").insert({
    id: expenseId,
    expense_date: expenseDate,
    vendor_name: `${prefix} Home Depot`,
    vendor: `${prefix} Home Depot`,
    payment_method: "Visa",
    reference_no: `${prefix}-home-depot`,
    notes: "system health focused mismatch row",
    total: 925.54,
    amount: 925.54,
    line_count: 1,
    status: "reviewed",
    source_type: "receipt_upload",
    project_id: projectId,
    receipt_url: "https://receipt-preview.test/system-health-focus.png",
  });
  expect(expenseInsert.error, expenseInsert.error?.message).toBeNull();

  const lineInsert = await admin.from("expense_lines").insert({
    id: randomUUID(),
    expense_id: expenseId,
    project_id: projectId,
    category: "Materials",
    amount: 323.54,
    total: 323.54,
  });
  expect(lineInsert.error, lineInsert.error?.message).toBeNull();

  return { expenseId, projectId };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(hasHorizontalOverflow).toBe(false);
}

test.describe("Expenses System Health issue focus", () => {
  test.describe.configure({ timeout: 150_000 });

  test("focuses, expands, highlights, and reviews a header/line mismatch expense", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    let seeded: SeededSystemHealthExpense | null = null;
    try {
      seeded = await seedSystemHealthExpense(admin);

      await page.setViewportSize({ width: 1440, height: 900 });
      await loginAsE2EOwner(page);
      await page.goto(
        `${E2E_FINANCIAL_EXPENSES_ARCHIVE_URL}?focusExpenseId=${seeded.expenseId}&issue=expense_header_line_total_mismatch`,
        { waitUntil: "domcontentloaded", timeout: 90_000 }
      );
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page, 90_000);

      const row = expenseListRowById(page, seeded.expenseId);
      await expect(row).toBeVisible({ timeout: 60_000 });
      await expect(row).toHaveAttribute("data-system-health-focus", "true");
      await expect(row.getByTestId("expense-header-line-mismatch-issue")).toContainText(
        "Header: $925.54"
      );
      await expect(row.getByTestId("expense-header-line-mismatch-issue")).toContainText(
        "Lines: $323.54"
      );
      await expect(row.getByTestId("expense-header-line-mismatch-issue")).toContainText(
        "Diff: $602.00"
      );

      await row.getByRole("button", { name: "Review issue" }).click();
      const detailPanel = page.getByRole("complementary", { name: "Expense detail" });
      await expect(detailPanel).toBeVisible({ timeout: 15_000 });
      const mismatchPanel = detailPanel.getByTestId("expense-header-line-mismatch-panel");
      await expect(mismatchPanel).toContainText(
        "System Health found a header/line total mismatch."
      );
      await expect(mismatchPanel).toContainText("Header total");
      await expect(mismatchPanel).toContainText("$925.54");
      await expect(mismatchPanel).toContainText("Split lines total");
      await expect(mismatchPanel).toContainText("$323.54");
      await expect(mismatchPanel).toContainText("Difference");
      await expect(mismatchPanel).toContainText("$602.00");
      await expect(mismatchPanel).toContainText(
        "Review receipt. If receipt total matches lines, update header. If receipt total matches header, adjust split lines."
      );
      await expect(mismatchPanel.getByRole("button", { name: "View receipt" })).toBeVisible();

      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    } finally {
      await cleanupSystemHealthExpense(admin, seeded);
    }
  });
});
