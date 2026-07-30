import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  expenseListRow,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";
import { loginAsE2EOwner } from "./e2e-auth-owner";

type SeededDateFilterRows = {
  prefix: string;
  projectId: string;
  currentMarker: string;
  previousMarker: string;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function toYmd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInCurrentMonth(): string {
  const now = new Date();
  return toYmd(new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 15)));
}

function dateInPreviousMonth(): string {
  const now = new Date();
  return toYmd(new Date(now.getFullYear(), now.getMonth() - 1, 15));
}

function dateGroupLabelFor(ymd: string): string {
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function cleanupDateFilterRows(admin: SupabaseClient, seeded: SeededDateFilterRows | null) {
  if (!seeded) return;
  const { data: rows, error } = await admin
    .from("expenses")
    .select("id")
    .like("reference_no", `${seeded.prefix}%`);
  if (error) throw new Error(`date filter cleanup select failed: ${error.message}`);

  const ids = (rows ?? []).map((row) => String((row as { id: string }).id)).filter(Boolean);
  if (ids.length > 0) {
    const lineDelete = await admin.from("expense_lines").delete().in("expense_id", ids);
    if (lineDelete.error) {
      throw new Error(`date filter cleanup expense_lines failed: ${lineDelete.error.message}`);
    }
    const expenseDelete = await admin.from("expenses").delete().in("id", ids);
    if (expenseDelete.error) {
      throw new Error(`date filter cleanup expenses failed: ${expenseDelete.error.message}`);
    }
  }

  const projectDelete = await admin.from("projects").delete().eq("id", seeded.projectId);
  if (projectDelete.error) {
    throw new Error(`date filter cleanup project failed: ${projectDelete.error.message}`);
  }
}

async function seedDateFilterRows(admin: SupabaseClient): Promise<SeededDateFilterRows> {
  const prefix = `E2E-DATE-SCOPE-${Date.now().toString(36).toUpperCase()}`;
  const projectId = randomUUID();
  const currentExpenseId = randomUUID();
  const previousExpenseId = randomUUID();
  const currentVendor = `${prefix} Current Month`;
  const previousVendor = `${prefix} Previous Month`;
  const currentMarker = `${prefix} current month marker`;
  const previousMarker = `${prefix} previous month marker`;

  const projectInsert = await admin.from("projects").insert({
    id: projectId,
    name: `${prefix} Project`,
    status: "active",
  });
  if (projectInsert.error) {
    throw new Error(`date filter project seed failed: ${projectInsert.error.message}`);
  }

  const expenseInsert = await admin.from("expenses").insert([
    {
      id: currentExpenseId,
      expense_date: dateInCurrentMonth(),
      vendor_name: currentVendor,
      vendor: currentVendor,
      payment_method: "Amex",
      reference_no: `${prefix}-current`,
      notes: currentMarker,
      total: 111,
      amount: 111,
      line_count: 1,
      status: "reviewed",
      source_type: "company",
      project_id: projectId,
      receipt_url: null,
    },
    {
      id: previousExpenseId,
      expense_date: dateInPreviousMonth(),
      vendor_name: previousVendor,
      vendor: previousVendor,
      payment_method: "Amex",
      reference_no: `${prefix}-previous`,
      notes: previousMarker,
      total: 222,
      amount: 222,
      line_count: 1,
      status: "reviewed",
      source_type: "company",
      project_id: projectId,
      receipt_url: null,
    },
  ]);
  if (expenseInsert.error) {
    throw new Error(`date filter expense seed failed: ${expenseInsert.error.message}`);
  }

  const lineInsert = await admin.from("expense_lines").insert([
    {
      id: randomUUID(),
      expense_id: currentExpenseId,
      project_id: projectId,
      category: "Materials",
      amount: 111,
      total: 111,
    },
    {
      id: randomUUID(),
      expense_id: previousExpenseId,
      project_id: projectId,
      category: "Materials",
      amount: 222,
      total: 222,
    },
  ]);
  if (lineInsert.error) {
    throw new Error(`date filter expense line seed failed: ${lineInsert.error.message}`);
  }

  return { prefix, projectId, currentMarker, previousMarker };
}

async function openDesktopFilters(page: Page) {
  await page.getByRole("button", { name: /Filters/i }).click();
  await expect(page.getByRole("button", { name: /^This month$/i })).toBeVisible({
    timeout: 15_000,
  });
}

function dateGroupToggleByLabel(page: Page, label: string) {
  return page.locator("button[aria-expanded]").filter({ hasText: label }).first();
}

test.describe("Expense list default date scope", () => {
  test.describe.configure({ timeout: 150_000, retries: 0 });

  test("defaults archive list to current month and can switch to all time", async ({ page }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    let seeded: SeededDateFilterRows | null = null;
    try {
      seeded = await seedDateFilterRows(admin);

      await page.setViewportSize({ width: 1440, height: 900 });
      await loginAsE2EOwner(page, E2E_FINANCIAL_EXPENSES_ARCHIVE_URL);
      await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await waitForExpensesQuerySuccess(page, 90_000);
      await expensesVendorSearch(page).fill(seeded.prefix);

      await expect(expenseListRow(page, seeded.currentMarker)).toBeVisible({ timeout: 60_000 });
      await expect(expenseListRow(page, seeded.previousMarker)).toBeHidden();

      await openDesktopFilters(page);
      await page.getByRole("button", { name: /^This month$/i }).click();
      await page.getByRole("button", { name: /^All time$/i }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
      const previousMonthGroupToggle = dateGroupToggleByLabel(
        page,
        dateGroupLabelFor(dateInPreviousMonth())
      );
      await expect(previousMonthGroupToggle).toBeVisible({ timeout: 60_000 });
      await expect(previousMonthGroupToggle).toHaveAttribute("aria-expanded", "false");
      await previousMonthGroupToggle.click();
      await expect(previousMonthGroupToggle).toHaveAttribute("aria-expanded", "true");
      await expect(expenseListRow(page, seeded.previousMarker)).toBeVisible({ timeout: 60_000 });

      await page.setViewportSize({ width: 390, height: 844 });
      const scrollWide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWide).toBeLessThanOrEqual(392);
    } finally {
      await cleanupDateFilterRows(admin, seeded);
    }
  });
});
