import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
  expenseListRowById,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

type SeededCompactRows = {
  prefix: string;
  projectId: string;
  ids: {
    receipt: string;
    noReceipt: string;
    overhead: string;
    duplicateA: string;
    duplicateB: string;
    missingProject: string;
    archiveReceipt: string;
    archiveNoDescription: string;
    archiveNoReceipt: string;
    archiveDuplicateA: string;
    archiveDuplicateB: string;
    archiveInternalPayment: string;
  };
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function cleanupCompactRows(admin: SupabaseClient, seeded: SeededCompactRows | null) {
  if (!seeded) return;
  const { data: rows, error } = await admin
    .from("expenses")
    .select("id")
    .like("reference_no", `${seeded.prefix}%`);
  if (error) throw new Error(`compact cleanup select failed: ${error.message}`);

  const ids = (rows ?? []).map((row) => String((row as { id: string }).id)).filter(Boolean);
  if (ids.length > 0) {
    const lineDelete = await admin.from("expense_lines").delete().in("expense_id", ids);
    if (lineDelete.error) {
      throw new Error(`compact cleanup expense_lines failed: ${lineDelete.error.message}`);
    }
    const expenseDelete = await admin.from("expenses").delete().in("id", ids);
    if (expenseDelete.error) {
      throw new Error(`compact cleanup expenses failed: ${expenseDelete.error.message}`);
    }
  }

  const projectDelete = await admin.from("projects").delete().eq("id", seeded.projectId);
  if (projectDelete.error) {
    throw new Error(`compact cleanup project failed: ${projectDelete.error.message}`);
  }
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function seedCompactRows(admin: SupabaseClient): Promise<SeededCompactRows> {
  const prefix = `E2E-COMPACT-${Date.now().toString(36).toUpperCase()}`;
  const projectId = randomUUID();
  const ids: SeededCompactRows["ids"] = {
    receipt: randomUUID(),
    noReceipt: randomUUID(),
    overhead: randomUUID(),
    duplicateA: randomUUID(),
    duplicateB: randomUUID(),
    missingProject: randomUUID(),
    archiveReceipt: randomUUID(),
    archiveNoDescription: randomUUID(),
    archiveNoReceipt: randomUUID(),
    archiveDuplicateA: randomUUID(),
    archiveDuplicateB: randomUUID(),
    archiveInternalPayment: randomUUID(),
  };
  const today = localYmd(new Date());
  const yesterday = localYmd(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const longProjectName = "E2E Compact Long Project Name With A Very Specific Truncation Tail";

  const projectInsert = await admin.from("projects").insert({
    id: projectId,
    name: longProjectName,
    status: "active",
  });
  if (projectInsert.error)
    throw new Error(`compact project seed failed: ${projectInsert.error.message}`);

  const expenseInsert = await admin.from("expenses").insert([
    {
      id: ids.receipt,
      expense_date: today,
      vendor_name: `${prefix} Receipt Vendor`,
      vendor: `${prefix} Receipt Vendor`,
      payment_method: "Amex",
      reference_no: `${prefix}-receipt`,
      notes: "compact receipt row",
      total: 42.12,
      amount: 42.12,
      line_count: 1,
      status: "needs_review",
      source_type: "receipt_upload",
      project_id: projectId,
      receipt_url: "https://receipt-preview.test/compact-receipt.png",
    },
    {
      id: ids.noReceipt,
      expense_date: today,
      vendor_name: `${prefix} No Receipt Vendor`,
      vendor: `${prefix} No Receipt Vendor`,
      payment_method: "Cash",
      reference_no: `${prefix}-no-receipt`,
      notes: "compact no receipt row",
      total: 17.5,
      amount: 17.5,
      line_count: 1,
      status: "needs_review",
      source_type: "company",
      project_id: projectId,
      receipt_url: null,
    },
    {
      id: ids.overhead,
      expense_date: today,
      vendor_name: `${prefix} Overhead Vendor`,
      vendor: `${prefix} Overhead Vendor`,
      payment_method: "ACH",
      reference_no: `${prefix}-overhead`,
      notes: "compact overhead row",
      total: 21.25,
      amount: 21.25,
      line_count: 1,
      status: "needs_review",
      source_type: "company",
      project_id: null,
      receipt_url: null,
    },
    {
      id: ids.duplicateA,
      expense_date: today,
      vendor_name: `${prefix} Duplicate Vendor`,
      vendor: `${prefix} Duplicate Vendor`,
      payment_method: "Cash",
      reference_no: `${prefix}-duplicate-a`,
      notes: "duplicate compact issue",
      total: 66,
      amount: 66,
      line_count: 1,
      status: "needs_review",
      source_type: "company",
      project_id: null,
      receipt_url: null,
    },
    {
      id: ids.duplicateB,
      expense_date: today,
      vendor_name: `${prefix} Duplicate Vendor`,
      vendor: `${prefix} Duplicate Vendor`,
      payment_method: "Cash",
      reference_no: `${prefix}-duplicate-b`,
      notes: "duplicate compact issue",
      total: 66,
      amount: 66,
      line_count: 1,
      status: "needs_review",
      source_type: "company",
      project_id: null,
      receipt_url: null,
    },
    {
      id: ids.missingProject,
      expense_date: today,
      vendor_name: `${prefix} Missing Project Vendor`,
      vendor: `${prefix} Missing Project Vendor`,
      payment_method: "Other",
      reference_no: `${prefix}-missing-project`,
      notes: "compact missing project row",
      total: 77,
      amount: 77,
      line_count: 1,
      status: "needs_review",
      source_type: "receipt_upload",
      project_id: null,
      receipt_url: null,
    },
    {
      id: ids.archiveReceipt,
      expense_date: today,
      vendor_name: `HH ${prefix} Archive Receipt Vendor`,
      vendor: `HH ${prefix} Archive Receipt Vendor`,
      payment_method: "Amex",
      reference_no: `${prefix}-ZZ-PM-DEFAULT-SHOULD-NOT-SHOW`,
      notes: "compact archive description",
      total: 82.12,
      amount: 82.12,
      line_count: 1,
      status: "reviewed",
      source_type: "receipt_upload",
      project_id: projectId,
      receipt_url: "https://receipt-preview.test/archive-receipt.png",
    },
    {
      id: ids.archiveNoDescription,
      expense_date: yesterday,
      vendor_name: `HH ${prefix} Archive Metadata Vendor`,
      vendor: `HH ${prefix} Archive Metadata Vendor`,
      payment_method: "Cash",
      reference_no: `${prefix}-archive-metadata`,
      notes: null,
      total: 22.5,
      amount: 22.5,
      line_count: 1,
      status: "reviewed",
      source_type: "receipt_upload",
      project_id: projectId,
      receipt_url: "https://receipt-preview.test/archive-metadata.png",
    },
    {
      id: ids.archiveNoReceipt,
      expense_date: today,
      vendor_name: `HH ${prefix} Archive No Receipt Vendor`,
      vendor: `HH ${prefix} Archive No Receipt Vendor`,
      payment_method: "Check",
      reference_no: `${prefix}-archive-no-receipt`,
      notes: "archive no receipt description",
      total: 33.5,
      amount: 33.5,
      line_count: 1,
      status: "reviewed",
      source_type: "company",
      project_id: projectId,
      receipt_url: null,
    },
    {
      id: ids.archiveInternalPayment,
      expense_date: today,
      vendor_name: `HH ${prefix} Archive Internal Payment Vendor`,
      vendor: `HH ${prefix} Archive Internal Payment Vendor`,
      payment_method: "ZZ-PM-DETAIL-SHOULD-NOT-SHOW",
      reference_no: `${prefix}-archive-internal-payment`,
      notes: null,
      total: 44.5,
      amount: 44.5,
      line_count: 1,
      status: "reviewed",
      source_type: "receipt_upload",
      project_id: projectId,
      receipt_url: "https://receipt-preview.test/archive-internal-payment.png",
    },
    {
      id: ids.archiveDuplicateA,
      expense_date: today,
      vendor_name: `HH ${prefix} Archive Duplicate Vendor`,
      vendor: `HH ${prefix} Archive Duplicate Vendor`,
      payment_method: "Cash",
      reference_no: `${prefix}-archive-duplicate-a`,
      notes: "archive duplicate description",
      total: 91,
      amount: 91,
      line_count: 1,
      status: "reviewed",
      source_type: "company",
      project_id: projectId,
      receipt_url: null,
    },
    {
      id: ids.archiveDuplicateB,
      expense_date: today,
      vendor_name: `HH ${prefix} Archive Duplicate Vendor`,
      vendor: `HH ${prefix} Archive Duplicate Vendor`,
      payment_method: "Cash",
      reference_no: `${prefix}-archive-duplicate-b`,
      notes: "archive duplicate description",
      total: 91,
      amount: 91,
      line_count: 1,
      status: "reviewed",
      source_type: "company",
      project_id: projectId,
      receipt_url: null,
    },
  ]);
  if (expenseInsert.error) {
    throw new Error(`compact expense seed failed: ${expenseInsert.error.message}`);
  }

  const lineInsert = await admin.from("expense_lines").insert([
    {
      id: randomUUID(),
      expense_id: ids.receipt,
      project_id: projectId,
      category: "Materials",
      amount: 42.12,
      total: 42.12,
    },
    {
      id: randomUUID(),
      expense_id: ids.noReceipt,
      project_id: projectId,
      category: "Materials",
      amount: 17.5,
      total: 17.5,
    },
    {
      id: randomUUID(),
      expense_id: ids.overhead,
      project_id: null,
      category: "Other",
      amount: 21.25,
      total: 21.25,
    },
    {
      id: randomUUID(),
      expense_id: ids.duplicateA,
      project_id: null,
      category: "—",
      amount: 66,
      total: 66,
    },
    {
      id: randomUUID(),
      expense_id: ids.duplicateB,
      project_id: null,
      category: "—",
      amount: 66,
      total: 66,
    },
    {
      id: randomUUID(),
      expense_id: ids.missingProject,
      project_id: null,
      category: "Materials",
      amount: 77,
      total: 77,
    },
    {
      id: randomUUID(),
      expense_id: ids.archiveReceipt,
      project_id: projectId,
      category: "Materials",
      amount: 82.12,
      total: 82.12,
    },
    {
      id: randomUUID(),
      expense_id: ids.archiveNoDescription,
      project_id: projectId,
      category: "Materials",
      amount: 22.5,
      total: 22.5,
    },
    {
      id: randomUUID(),
      expense_id: ids.archiveNoReceipt,
      project_id: projectId,
      category: "Materials",
      amount: 33.5,
      total: 33.5,
    },
    {
      id: randomUUID(),
      expense_id: ids.archiveInternalPayment,
      project_id: projectId,
      category: "Materials",
      amount: 44.5,
      total: 44.5,
    },
    {
      id: randomUUID(),
      expense_id: ids.archiveDuplicateA,
      project_id: projectId,
      category: "Materials",
      amount: 91,
      total: 91,
    },
    {
      id: randomUUID(),
      expense_id: ids.archiveDuplicateB,
      project_id: projectId,
      category: "Materials",
      amount: 91,
      total: 91,
    },
  ]);
  if (lineInsert.error) {
    throw new Error(`compact expense line seed failed: ${lineInsert.error.message}`);
  }

  return { prefix, projectId, ids };
}

async function gotoCompactInbox(page: Page, prefix: string) {
  await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForExpensesQuerySuccess(page, 90_000);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  await expensesVendorSearch(page).fill(prefix);
}

async function gotoCompactExpenses(page: Page, prefix: string) {
  await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitForExpensesQuerySuccess(page, 90_000);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  await expensesVendorSearch(page).fill(prefix);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function unexpectedPageErrors(errors: readonly string[]): string[] {
  return errors.filter((message) => !message.includes("net::ERR_NAME_NOT_RESOLVED"));
}

async function expectCompactRowHeight(row: Locator) {
  const box = await row.boundingBox();
  expect(box, "expense row should have a layout box").not.toBeNull();
  expect(
    box!.height,
    "desktop inbox row should stay in the compact 44-52px target"
  ).toBeLessThanOrEqual(52);
  expect(box!.height).toBeGreaterThanOrEqual(40);
}

async function expectHeaderCellsAligned(table: Locator, row: Locator) {
  const alignment = await table.evaluate(
    (tableEl, rowEl) => {
      const headers = Array.from(tableEl.querySelectorAll("thead th"));
      const cells = Array.from((rowEl as HTMLTableRowElement).querySelectorAll("td"));
      return headers.map((header, index) => {
        const headerBox = header.getBoundingClientRect();
        const cellBox = cells[index]?.getBoundingClientRect();
        return {
          index,
          headerLeft: headerBox.left,
          headerRight: headerBox.right,
          cellLeft: cellBox?.left ?? null,
          cellRight: cellBox?.right ?? null,
          cellCount: cells.length,
        };
      });
    },
    await row.elementHandle()
  );

  for (const col of alignment) {
    expect(col.cellCount, "desktop data rows should render the compact 10-column table").toBe(10);
    expect(col.cellLeft, `column ${col.index} left edge should align`).not.toBeNull();
    expect(col.cellRight, `column ${col.index} right edge should align`).not.toBeNull();
    expect(Math.abs(col.headerLeft - col.cellLeft!)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(col.headerRight - col.cellRight!)).toBeLessThanOrEqual(1.5);
  }
}

async function expectNoPageHorizontalOverflow(page: Page, maxWidth: number) {
  const scrollWide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWide).toBeLessThanOrEqual(maxWidth + 2);
}

async function expectDesktopTableScrollPolished(page: Page) {
  const scroll = page.locator(".expense-compact-table-scroll").first();
  await expect(scroll).toBeVisible({ timeout: 15_000 });
  const metrics = await scroll.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      clientWidth: el.clientWidth,
      overflowX: style.overflowX,
      scrollbarColor: style.scrollbarColor,
      scrollbarWidth: style.scrollbarWidth,
      scrollWidth: el.scrollWidth,
    };
  });
  expect(metrics.overflowX).toBe("auto");
  expect(metrics.scrollbarWidth).toBe("thin");
  expect(metrics.scrollbarColor).not.toBe("auto");
  expect(metrics.scrollWidth - metrics.clientWidth).toBeLessThanOrEqual(2);
}

async function expectCompactLayoutNoHorizontalOverflow(page: Page, maxWidth: number) {
  const table = page.locator("main table").first();
  const tableVisible = (await table.count()) > 0 && (await table.isVisible().catch(() => false));
  if (tableVisible) {
    await expectDesktopTableScrollPolished(page);
  }
  await expectNoPageHorizontalOverflow(page, maxWidth);
}

function dateGroupToggle(page: Page, index = 0) {
  return page
    .locator("button[aria-expanded]")
    .filter({ hasText: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/ })
    .nth(index);
}

async function openDesktopFilters(page: Page) {
  await page
    .getByRole("button", { name: /Filters/i })
    .last()
    .click();
  await expect(page.getByRole("button", { name: /^This month$/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Expense inbox compact table", () => {
  test.describe.configure({ timeout: 180_000, retries: 0 });

  test("desktop columns, receipt labels, collapsed issues, row height, and mobile overflow", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }
    const pageErrors = collectPageErrors(page);

    let seeded: SeededCompactRows | null = null;
    try {
      seeded = await seedCompactRows(admin);

      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoCompactInbox(page, seeded.prefix);

      const table = page.locator("main table").first();
      for (const header of [
        "Date",
        "Merchant",
        "Project",
        "Category",
        "Source",
        "Receipt",
        "Issues",
        "Status",
        "Amount",
        "Actions",
      ]) {
        await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
      }
      await expectDesktopTableScrollPolished(page);
      await expectNoPageHorizontalOverflow(page, 1440);

      const receiptRow = expenseListRowById(page, seeded.ids.receipt);
      await expect(receiptRow).toBeVisible({ timeout: 60_000 });
      await expectHeaderCellsAligned(table, receiptRow);
      await expect(receiptRow.getByRole("button", { name: /Preview receipt/i })).toHaveText(
        /^View$/
      );
      await expect(receiptRow.locator("td").nth(1).locator(".rounded-full")).toHaveCount(0);
      await expect(receiptRow.getByTestId("expense-inbox-issues")).toHaveText("—");
      await expectCompactRowHeight(receiptRow);

      const noReceiptRow = expenseListRowById(page, seeded.ids.noReceipt);
      await expect(noReceiptRow).toBeVisible();
      await expect(noReceiptRow.locator("td").nth(5)).toHaveText("—");
      await expect(noReceiptRow).not.toContainText("No receipt");
      const noReceiptIssueCell = noReceiptRow.getByTestId("expense-inbox-issues");
      await expect(noReceiptIssueCell).toHaveText("⚠");
      await noReceiptIssueCell.getByRole("button", { name: /issue/i }).click();
      let popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await popover.getByRole("button", { name: /Dismiss Missing receipt/i }).click();
      await expect(noReceiptIssueCell).toHaveText("—");
      await page.reload();
      await waitForExpensesQuerySuccess(page, 90_000);
      await expensesVendorSearch(page).fill(seeded.prefix);
      await expect(expenseListRowById(page, seeded.ids.noReceipt)).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        expenseListRowById(page, seeded.ids.noReceipt).getByTestId("expense-inbox-issues")
      ).toHaveText("—");
      await expectCompactRowHeight(noReceiptRow);

      const overheadRow = expenseListRowById(page, seeded.ids.overhead);
      await expect(overheadRow).toContainText("Overhead");
      const otherCategoryDisplay = await overheadRow
        .locator("td")
        .nth(3)
        .locator("span")
        .evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            backgroundColor: style.backgroundColor,
            borderRadius: style.borderRadius,
            borderWidth: style.borderWidth,
            display: style.display,
            text: el.textContent?.trim(),
          };
        });
      expect(otherCategoryDisplay).toMatchObject({
        backgroundColor: "rgba(0, 0, 0, 0)",
        borderRadius: "0px",
        borderWidth: "0px",
        text: "Other",
      });
      expect(otherCategoryDisplay.display).not.toBe("inline-flex");
      const overheadIssueCell = overheadRow.getByTestId("expense-inbox-issues");
      await expect(overheadIssueCell).toHaveText("⚠");
      await overheadIssueCell.getByRole("button", { name: /issue/i }).click();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await expect(popover).not.toContainText("Missing project");
      await page.keyboard.press("Escape");

      const unassignedMaterialsRow = expenseListRowById(page, seeded.ids.missingProject);
      await expect(unassignedMaterialsRow).toBeVisible();
      await expect(unassignedMaterialsRow.getByTestId("expense-inbox-issues")).toHaveText("⚠");
      const nonIssueText = await unassignedMaterialsRow.locator("td").evaluateAll((cells) =>
        cells
          .filter((_, index) => index !== 6)
          .map((cell) => cell.textContent ?? "")
          .join(" ")
      );
      expect(nonIssueText).not.toMatch(/Missing project/);
      await unassignedMaterialsRow
        .getByTestId("expense-inbox-issues")
        .getByRole("button", { name: /issue/i })
        .click();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await expect(popover).not.toContainText("Missing project");
      await page.keyboard.press("Escape");

      const duplicateIssueCell = expenseListRowById(page, seeded.ids.duplicateA).getByTestId(
        "expense-inbox-issues"
      );
      await expect(duplicateIssueCell).toHaveText("⚠");
      await expect(duplicateIssueCell).not.toContainText(/Possible duplicate|issues/i);
      await duplicateIssueCell.getByRole("button", { name: /issue/i }).click();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await expect(popover).toContainText("Missing category");
      await expect(popover).toContainText(/Possible duplicate amount/i);
      await expect(popover.getByRole("button", { name: /Dismiss/i })).toHaveCount(3);
      await page.keyboard.press("Escape");

      await page.setViewportSize({ width: 1100, height: 844 });
      await gotoCompactInbox(page, seeded.prefix);
      await expectCompactLayoutNoHorizontalOverflow(page, 1100);

      await page.setViewportSize({ width: 1024, height: 844 });
      await gotoCompactInbox(page, seeded.prefix);
      await expectCompactLayoutNoHorizontalOverflow(page, 1024);

      await page.setViewportSize({ width: 390, height: 844 });
      await gotoCompactInbox(page, seeded.prefix);
      const mobileReceiptRow = expenseListRowById(page, seeded.ids.receipt);
      await expect(mobileReceiptRow).toBeVisible({ timeout: 60_000 });
      await expect(mobileReceiptRow.locator(":scope > div > span.rounded-full")).toHaveCount(0);
      const mobileActionButton = mobileReceiptRow.getByRole("button", { name: /row actions/i });
      await expect(mobileActionButton).toHaveCount(1);
      const mobileActionDisplay = await mobileActionButton.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return {
          height: rect.height,
          opacity: Number(window.getComputedStyle(button).opacity),
          width: rect.width,
        };
      });
      expect(mobileActionDisplay.width).toBeGreaterThanOrEqual(44);
      expect(mobileActionDisplay.height).toBeGreaterThanOrEqual(44);
      expect(mobileActionDisplay.opacity).toBeGreaterThan(0);
      await expectNoPageHorizontalOverflow(page, 390);
      await expect(expenseListRowById(page, seeded.ids.noReceipt)).not.toContainText("No receipt");
      expect(unexpectedPageErrors(pageErrors)).toEqual([]);
    } finally {
      await cleanupCompactRows(admin, seeded);
    }
  });

  test("expenses archive keeps compact source, merchant description, issues, and edit wording", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }
    const pageErrors = collectPageErrors(page);

    let seeded: SeededCompactRows | null = null;
    try {
      seeded = await seedCompactRows(admin);

      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoCompactExpenses(page, seeded.prefix);

      const table = page.locator("main table").first();
      await expectCompactLayoutNoHorizontalOverflow(page, 1440);
      const firstGroupToggle = dateGroupToggle(page, 0);
      await expect(firstGroupToggle).toHaveAttribute("aria-expanded", "true");
      await expect(firstGroupToggle).toBeEnabled();
      await firstGroupToggle.click();
      await expect(firstGroupToggle).toHaveAttribute("aria-expanded", "false");
      await expect(expenseListRowById(page, seeded.ids.archiveReceipt)).toBeHidden();

      const secondGroupToggle = dateGroupToggle(page, 1);
      await expect(secondGroupToggle).toHaveAttribute("aria-expanded", "false");
      await secondGroupToggle.click();
      await expect(secondGroupToggle).toHaveAttribute("aria-expanded", "true");
      await expect(expenseListRowById(page, seeded.ids.archiveNoDescription)).toBeVisible();
      await secondGroupToggle.click();
      await expect(secondGroupToggle).toHaveAttribute("aria-expanded", "false");
      await expect(expenseListRowById(page, seeded.ids.archiveNoDescription)).toBeHidden();
      await secondGroupToggle.click();
      await expect(secondGroupToggle).toHaveAttribute("aria-expanded", "true");
      await firstGroupToggle.click();
      await expect(firstGroupToggle).toHaveAttribute("aria-expanded", "true");

      await openDesktopFilters(page);
      await page.getByRole("button", { name: /^This month$/i }).click();
      await page.getByRole("button", { name: /^All time$/i }).click();
      const allTimeFirstGroupToggle = dateGroupToggle(page, 0);
      await expect(allTimeFirstGroupToggle).toBeEnabled();
      await allTimeFirstGroupToggle.click();
      await expect(allTimeFirstGroupToggle).toHaveAttribute("aria-expanded", "false");
      await allTimeFirstGroupToggle.click();
      await expect(allTimeFirstGroupToggle).toHaveAttribute("aria-expanded", "true");

      const archiveReceiptRow = expenseListRowById(page, seeded.ids.archiveReceipt);
      await expect(archiveReceiptRow).toBeVisible({ timeout: 60_000 });
      await expectHeaderCellsAligned(table, archiveReceiptRow);
      await expectCompactRowHeight(archiveReceiptRow);
      await expect(archiveReceiptRow.locator("td").nth(1).locator(".rounded-full")).toHaveCount(0);

      const merchantCell = archiveReceiptRow.locator("td").nth(1);
      await expect(merchantCell).toContainText(`HH ${seeded.prefix} Archive Receipt Vendor`);
      await expect(merchantCell).toContainText("compact archive description");
      await expect(merchantCell).not.toContainText("Receipt upload");
      await expect(archiveReceiptRow).not.toContainText("ZZ-PM-DEFAULT");
      await expect(archiveReceiptRow).not.toContainText("Receipt upload");
      await expect(archiveReceiptRow.locator("td").nth(4)).toHaveText("Amex");
      await expect(archiveReceiptRow.getByRole("button", { name: /Preview receipt/i })).toHaveText(
        /^View$/
      );

      const metadataRow = expenseListRowById(page, seeded.ids.archiveNoDescription);
      await expect(metadataRow).toBeVisible();
      const metadataMerchant = metadataRow.locator("td").nth(1);
      await expect(metadataMerchant).toContainText(`HH ${seeded.prefix} Archive Metadata Vendor`);
      await expect(metadataMerchant).toContainText(/Cash/);
      const metadataMerchantText = (await metadataMerchant.textContent()) ?? "";
      expect(metadataMerchantText).not.toMatch(/[A-Z][a-z]{2} \d{1,2}/);
      await expect(metadataMerchant).not.toContainText("Receipt upload");
      await expect(metadataRow.locator("td").nth(4)).toHaveText("Cash");

      const internalPaymentRow = expenseListRowById(page, seeded.ids.archiveInternalPayment);
      await expect(internalPaymentRow).toBeVisible();
      await expect(internalPaymentRow).not.toContainText("ZZ-PM");
      await expect(internalPaymentRow).not.toContainText("Receipt upload");
      await expect(internalPaymentRow.locator("td").nth(4)).toHaveText("—");
      await expect(internalPaymentRow.locator("td").nth(1).locator("p").nth(1)).toHaveText("—");

      const noReceiptRow = expenseListRowById(page, seeded.ids.archiveNoReceipt);
      await expect(noReceiptRow.locator("td").nth(5)).toHaveText("—");
      await expect(noReceiptRow).not.toContainText("No receipt");
      const noReceiptIssueCell = noReceiptRow.getByTestId("expense-inbox-issues");
      await expect(noReceiptIssueCell).toHaveText("⚠");
      await noReceiptIssueCell.getByRole("button", { name: /issue/i }).click();
      let popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await popover.getByRole("button", { name: /Dismiss Missing receipt/i }).click();
      await expect(noReceiptIssueCell).toHaveText("—");
      await page.reload();
      await waitForExpensesQuerySuccess(page, 90_000);
      await expensesVendorSearch(page).fill(seeded.prefix);
      await expect(
        expenseListRowById(page, seeded.ids.archiveNoReceipt).getByTestId("expense-inbox-issues")
      ).toHaveText("—");

      const duplicateIssueCell = expenseListRowById(page, seeded.ids.archiveDuplicateA).getByTestId(
        "expense-inbox-issues"
      );
      await expect(duplicateIssueCell).toHaveText("⚠");
      await expect(duplicateIssueCell).not.toContainText(/Possible duplicate|issues/i);
      await duplicateIssueCell.getByRole("button", { name: /issue/i }).click();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Possible duplicate amount");
      await expect(popover).toContainText("Missing receipt");
      await popover.getByRole("button", { name: /Dismiss Missing receipt/i }).click();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await popover.getByRole("button", { name: /Dismiss Possible duplicate amount/i }).click();
      await expect(duplicateIssueCell).toHaveText("—");

      const categoryDisplay = await archiveReceiptRow
        .locator("td")
        .nth(3)
        .locator("span")
        .evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            backgroundColor: style.backgroundColor,
            borderRadius: style.borderRadius,
            borderWidth: style.borderWidth,
            display: style.display,
            text: el.textContent?.trim(),
          };
        });
      expect(categoryDisplay).toMatchObject({
        backgroundColor: "rgba(0, 0, 0, 0)",
        borderRadius: "0px",
        borderWidth: "0px",
        text: "Materials",
      });
      expect(categoryDisplay.display).not.toBe("inline-flex");

      const projectDisplay = await archiveReceiptRow
        .locator("td")
        .nth(2)
        .locator("span")
        .evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            fontSize: style.fontSize,
            fontWeight: Number(style.fontWeight),
            opacity: Number(style.opacity),
            title: el.getAttribute("title"),
          };
        });
      expect(projectDisplay.fontSize).toBe("13px");
      expect(projectDisplay.fontWeight).toBeLessThanOrEqual(500);
      expect(projectDisplay.opacity).toBeLessThanOrEqual(0.8);
      expect(projectDisplay.title).toContain("Compact Long Project Name");

      const statusCell = archiveReceiptRow.locator("td").nth(7);
      await expect(statusCell).toHaveText("● Done");
      const doneStatusDisplay = await statusCell
        .locator("span")
        .first()
        .evaluate((container) => {
          const containerStyle = window.getComputedStyle(container);
          const dot = container.querySelector('[data-testid="expense-status-inline-dot"]');
          const label = container.querySelector('[data-testid="expense-status-inline-label"]');
          if (!dot || !label) throw new Error("Missing inline status dot or label.");
          const dotStyle = window.getComputedStyle(dot);
          const labelStyle = window.getComputedStyle(label);
          return {
            backgroundColor: containerStyle.backgroundColor,
            borderRadius: containerStyle.borderRadius,
            borderWidth: containerStyle.borderWidth,
            dotColor: dotStyle.color,
            labelColor: labelStyle.color,
          };
        });
      expect(doneStatusDisplay).toMatchObject({
        backgroundColor: "rgba(0, 0, 0, 0)",
        borderRadius: "0px",
        borderWidth: "0px",
        dotColor: "rgba(79, 175, 124, 0.58)",
        labelColor: "rgba(79, 175, 124, 0.82)",
      });

      const actionsCell = archiveReceiptRow.locator("td").nth(9);
      await expect(actionsCell.getByRole("button", { name: /row actions/i })).toHaveCount(1);
      await expect(actionsCell.locator("button")).toHaveCount(1);

      await archiveReceiptRow.getByRole("button", { name: /row actions/i }).click();
      await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
      const editDialog = page.getByRole("dialog", { name: /Edit expense/i });
      await expect(editDialog).toBeVisible({ timeout: 15_000 });
      await expect(editDialog.getByText("Description", { exact: true })).toBeVisible();
      await expect(editDialog.getByText("Notes", { exact: true })).toHaveCount(0);
      const description = `updated archive description ${Date.now()}`;
      await editDialog.locator("textarea").fill(description);
      await editDialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(editDialog).not.toBeVisible({ timeout: 15_000 });
      await expect(
        expenseListRowById(page, seeded.ids.archiveReceipt).locator("td").nth(1)
      ).toContainText(description);

      await page.setViewportSize({ width: 390, height: 844 });
      await gotoCompactExpenses(page, seeded.prefix);
      const mobileFirstGroupToggle = dateGroupToggle(page, 0);
      await expect(mobileFirstGroupToggle).toBeEnabled();
      await mobileFirstGroupToggle.click();
      await expect(mobileFirstGroupToggle).toHaveAttribute("aria-expanded", "false");
      await expect(expenseListRowById(page, seeded.ids.archiveReceipt)).toBeHidden();
      await mobileFirstGroupToggle.press("Enter");
      await expect(mobileFirstGroupToggle).toHaveAttribute("aria-expanded", "true");
      await mobileFirstGroupToggle.press(" ");
      await expect(mobileFirstGroupToggle).toHaveAttribute("aria-expanded", "false");
      await mobileFirstGroupToggle.press(" ");
      await expect(mobileFirstGroupToggle).toHaveAttribute("aria-expanded", "true");

      const mobileRow = expenseListRowById(page, seeded.ids.archiveReceipt);
      await expect(mobileRow).toBeVisible({ timeout: 60_000 });
      await expect(mobileRow.locator(":scope > div > span.rounded-full")).toHaveCount(0);
      await expect(mobileRow.getByRole("button", { name: /row actions/i })).toHaveCount(1);
      await expectNoPageHorizontalOverflow(page, 390);
      expect(unexpectedPageErrors(pageErrors)).toEqual([]);
    } finally {
      await cleanupCompactRows(admin, seeded);
    }
  });
});
