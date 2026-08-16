import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginAsE2EOwner } from "./e2e-auth-owner";
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
  const ids = Object.values(seeded.ids);
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

  const paymentAccountResult = await admin
    .from("payment_accounts")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (paymentAccountResult.error || !paymentAccountResult.data?.id) {
    throw new Error(
      `compact payment account seed failed: ${paymentAccountResult.error?.message ?? "no account"}`
    );
  }

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
      reference_no: `INBOX-UP-${prefix}-receipt`,
      notes: "compact receipt row",
      total: 42.12,
      amount: 42.12,
      line_count: 1,
      status: "needs_review",
      source_type: "receipt_upload",
      payment_account_id: paymentAccountResult.data.id,
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
      reference_no: `INBOX-UP-${prefix}-missing-project`,
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
  const search = expensesVendorSearch(page);
  await expect(search).toBeEditable();
  await search.fill(prefix);
  await expect(search).toHaveValue(prefix);
}

async function gotoCompactExpenses(page: Page, prefix: string) {
  await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitForExpensesQuerySuccess(page, 90_000);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  const search = expensesVendorSearch(page);
  await expect(search).toBeEditable();
  await search.fill(prefix);
  await expect(search).toHaveValue(prefix);
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

async function expectReceiptInboxTypographyHierarchy(page: Page, row: Locator) {
  const metrics = await row.evaluate((element) => {
    const cells = Array.from(element.querySelectorAll<HTMLElement>(":scope > td"));
    const type = (target: Element | null | undefined) => {
      if (!target) throw new Error("Receipt Inbox typography target is missing.");
      const style = window.getComputedStyle(target);
      return {
        fontSize: style.fontSize,
        fontVariantNumeric: style.fontVariantNumeric,
        fontWeight: Number(style.fontWeight),
        lineHeight: style.lineHeight,
        opacity: Number(style.opacity),
      };
    };

    return {
      amount: type(cells[8]?.querySelector("span")),
      category: type(cells[3]?.querySelector("span")),
      date: type(cells[0]),
      issues: type(cells[6]?.querySelector("[data-testid='expense-inbox-issues']")),
      merchant: type(cells[1]?.querySelector("p:first-of-type")),
      merchantSupporting: type(cells[1]?.querySelector("p:nth-of-type(2)")),
      project: type(cells[2]?.querySelector("span")),
      receipt: type(cells[5]?.querySelector("[data-expense-receipt-state]")),
      source: type(cells[4]?.querySelector("span")),
      status: type(cells[7]?.querySelector("span")),
    };
  });

  expect(metrics).toMatchObject({
    amount: {
      fontSize: "15px",
      fontWeight: 600,
      lineHeight: "15px",
    },
    category: {
      fontSize: "12px",
      fontWeight: 400,
      lineHeight: "15px",
    },
    date: {
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: "20px",
    },
    issues: {
      fontSize: "11px",
      fontWeight: 500,
      lineHeight: "20px",
    },
    merchant: {
      fontSize: "13px",
      fontWeight: 600,
      lineHeight: "16.25px",
    },
    merchantSupporting: {
      fontSize: "10px",
      fontWeight: 400,
      lineHeight: "12.5px",
    },
    project: {
      fontSize: "13px",
      fontWeight: 500,
      lineHeight: "16.25px",
      opacity: 0.9,
    },
    receipt: {
      fontSize: "11px",
      fontWeight: 500,
    },
    source: {
      fontSize: "11px",
      fontWeight: 400,
      lineHeight: "13.75px",
      opacity: 0.85,
    },
    status: {
      fontSize: "10px",
      fontWeight: 500,
    },
  });
  expect(metrics.amount.fontVariantNumeric).toContain("tabular-nums");

  const surfaceMetrics = await page
    .locator('[data-expenses-list-page="inbox"]')
    .evaluate((root) => {
      const type = (selector: string) => {
        const target = root.querySelector(selector);
        if (!target) throw new Error(`Receipt Inbox typography target is missing: ${selector}`);
        const style = window.getComputedStyle(target);
        return {
          fontSize: style.fontSize,
          fontWeight: Number(style.fontWeight),
          lineHeight: style.lineHeight,
        };
      };
      return {
        helper: type("[data-inbox-shortcuts]"),
        kpi: type("[data-inbox-decision-brief] dd"),
        label: type("[data-inbox-decision-brief] dt"),
        tableHeader: type("thead th"),
      };
    });

  expect(surfaceMetrics).toEqual({
    helper: { fontSize: "11px", fontWeight: 400, lineHeight: "15.125px" },
    kpi: { fontSize: "15px", fontWeight: 650, lineHeight: "15px" },
    label: { fontSize: "10px", fontWeight: 600, lineHeight: "20px" },
    tableHeader: { fontSize: "11px", fontWeight: 500, lineHeight: "20px" },
  });
}

test.describe("Expense inbox compact table", () => {
  // These deterministic scenarios seed, exercise, reload and clean several rows across
  // multiple responsive viewports. Authentication adds enough local-dev compilation time
  // that the old three-minute suite budget could expire before assertions completed.
  test.describe.configure({ timeout: 300_000, retries: 0 });

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
      await loginAsE2EOwner(page, E2E_FINANCIAL_INBOX_URL);
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
      await expectReceiptInboxTypographyHierarchy(page, receiptRow);
      await expectHeaderCellsAligned(table, receiptRow);
      await expect(receiptRow.getByRole("button", { name: /Receipt attached/i })).toHaveText(
        /^Receipt$/
      );
      await expect(receiptRow.locator("td").nth(1).locator(".rounded-full")).toHaveCount(0);
      await expect(receiptRow.getByTestId("expense-inbox-issues")).toHaveText("Clear");
      await expectCompactRowHeight(receiptRow);

      const noReceiptRow = expenseListRowById(page, seeded.ids.noReceipt);
      await expect(noReceiptRow).toBeVisible();
      await expect(noReceiptRow.locator("td").nth(5)).toHaveText("Missing");
      const noReceiptIssueCell = noReceiptRow.getByTestId("expense-inbox-issues");
      await expect(noReceiptIssueCell).toHaveText(/^⚠\s*\d+$/);
      await noReceiptIssueCell.getByRole("button", { name: /issue/i }).hover();
      let popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await popover.getByRole("button", { name: /Dismiss Missing receipt/i }).click();
      await expect(noReceiptIssueCell).toHaveText("Clear");
      await page.reload();
      await waitForExpensesQuerySuccess(page, 90_000);
      await expensesVendorSearch(page).fill(seeded.prefix);
      await expect(expenseListRowById(page, seeded.ids.noReceipt)).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        expenseListRowById(page, seeded.ids.noReceipt).getByTestId("expense-inbox-issues")
      ).toHaveText("Clear");
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
      await expect(overheadIssueCell).toHaveText(/^⚠\s*\d+$/);
      await overheadIssueCell.getByRole("button", { name: /issue/i }).hover();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await expect(popover).not.toContainText("Missing project");
      await page.keyboard.press("Escape");

      const unassignedMaterialsRow = expenseListRowById(page, seeded.ids.missingProject);
      await expect(unassignedMaterialsRow).toBeVisible();
      await expect(unassignedMaterialsRow.getByTestId("expense-inbox-issues")).toHaveText(
        /^⚠\s*\d+$/
      );
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
        .hover();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await expect(popover).not.toContainText("Missing project");
      await page.keyboard.press("Escape");

      const duplicateIssueCell = expenseListRowById(page, seeded.ids.duplicateA).getByTestId(
        "expense-inbox-issues"
      );
      await expect(duplicateIssueCell).toHaveText(/^⚠\s*\d+$/);
      await expect(duplicateIssueCell).not.toContainText(/Possible duplicate/i);
      await duplicateIssueCell.getByRole("button", { name: /issue/i }).hover();
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
      await expect(expenseListRowById(page, seeded.ids.noReceipt)).toContainText("Missing");
      expect(unexpectedPageErrors(pageErrors)).toEqual([]);
    } finally {
      await cleanupCompactRows(admin, seeded);
    }
  });

  test("Receipt Inbox inline review saves corrections and approves next without a mode switch", async ({
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
      await loginAsE2EOwner(page, E2E_FINANCIAL_INBOX_URL);
      await gotoCompactInbox(page, seeded.prefix);

      const root = page.locator('[data-expenses-list-page="inbox"]');
      const queue = root.locator("[data-expenses-ledger]");
      const row = expenseListRowById(page, seeded.ids.receipt);
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.locator("td").nth(1).click();

      const panel = root.locator("[data-expense-detail-panel]");
      await expect(panel).toBeVisible();
      await expect(queue).toBeVisible();
      await expect(page.getByRole("dialog", { name: /Expense/i })).toHaveCount(0);
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}`)
      );
      await expect(row).toHaveAttribute("data-expense-active", "true");
      const compactContext = root.locator(
        `[data-expense-id="${seeded.ids.receipt}"]:visible [data-inbox-compact-context]`
      );
      await expect(compactContext).toBeVisible();
      await expect(compactContext).toContainText("Materials");
      await expect(panel.getByText(/\d+ of \d+/, { exact: true })).toBeVisible();

      const evidenceStage = panel.locator("[data-expense-receipt-stage]");
      const reviewPanel = panel.locator("[data-expense-review-panel]");
      await expect(evidenceStage).toBeVisible();
      await expect(reviewPanel).toBeVisible();
      const reviewLayout = await page.evaluate(() => {
        const queue = document.querySelector<HTMLElement>("[data-expenses-ledger]");
        const evidence = document.querySelector<HTMLElement>("[data-expense-receipt-stage]");
        const review = document.querySelector<HTMLElement>("[data-expense-review-panel]");
        if (!queue || !evidence || !review) return null;
        const queueBox = queue.getBoundingClientRect();
        const evidenceBox = evidence.getBoundingClientRect();
        const reviewBox = review.getBoundingClientRect();
        return {
          queueRight: queueBox.right,
          evidenceLeft: evidenceBox.left,
          evidenceRight: evidenceBox.right,
          reviewLeft: reviewBox.left,
          evidenceWidth: evidenceBox.width,
        };
      });
      expect(reviewLayout).not.toBeNull();
      expect(reviewLayout!.queueRight).toBeLessThanOrEqual(reviewLayout!.evidenceLeft + 2);
      expect(reviewLayout!.evidenceRight).toBeLessThanOrEqual(reviewLayout!.reviewLeft + 2);
      expect(reviewLayout!.evidenceWidth).toBeGreaterThan(280);

      const hierarchy = await panel.evaluate((element) => {
        const evidence = element.querySelector<HTMLElement>("[data-expense-receipt-evidence]");
        const amount = element.querySelector<HTMLElement>("[data-expense-detail-amount]");
        return {
          evidenceTop: evidence?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
          amountTop: amount?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
        };
      });
      expect(hierarchy.evidenceTop).toBeLessThan(hierarchy.amountTop);

      const queueMetrics = await queue.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(queueMetrics.scrollWidth - queueMetrics.clientWidth).toBeLessThanOrEqual(2);

      await expect(panel).toHaveAttribute("data-expense-detail-mode", "review");
      await expect(evidenceStage).toBeVisible();
      const vendor = panel.getByTestId("edit-expense-vendor-input");
      await expect(vendor).toBeVisible();
      await expect(panel.getByRole("button", { name: "Edit Expense" })).toHaveCount(0);
      await expect(panel.getByText("Payment method", { exact: true })).toBeHidden();
      await panel.getByText("More Details", { exact: true }).click();
      await expect(panel.getByText("Payment method", { exact: true })).toBeVisible();
      await expect(panel.getByText("Attachments", { exact: true })).toBeVisible();
      await panel.getByText("More Details", { exact: true }).click();

      const originalVendor = await vendor.inputValue();
      const savedVendor = `${originalVendor} inline-saved`;
      await vendor.fill(savedVendor);
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/expenses/${seeded!.ids.receipt}`) &&
          response.request().method() === "PATCH"
      );
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      expect((await saveResponsePromise).ok()).toBeTruthy();
      await expect(panel).toHaveAttribute("data-expense-detail-mode", "review");
      await expect(vendor).toHaveValue(savedVendor);
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}`)
      );

      const approvedVendor = `${originalVendor} inline-approved`;
      await vendor.fill(approvedVendor);

      await page.route(`**/api/expenses/${seeded.ids.receipt}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "Owner QA forced save failure" }),
        });
      });
      await panel.getByRole("button", { name: "Approve & Next", exact: true }).click();
      await expect(panel).toHaveAttribute("data-expense-detail-mode", "review");
      await expect(vendor).toHaveValue(approvedVendor);
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}`)
      );

      await page.unroute(`**/api/expenses/${seeded.ids.receipt}`);
      const correctionResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/expenses/${seeded!.ids.receipt}`) &&
          response.request().method() === "PATCH"
      );
      const approveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/financial/expenses/${seeded!.ids.receipt}/approve-inbox`) &&
          response.request().method() === "POST"
      );
      await panel.getByRole("button", { name: "Approve & Next", exact: true }).click();
      expect((await correctionResponsePromise).ok()).toBeTruthy();
      expect((await approveResponsePromise).ok()).toBeTruthy();
      await expect(page).not.toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}(?:&|$)`)
      );
      await expect(panel).toHaveAttribute("data-expense-detail-mode", "review");
      await expect(root.locator('[data-expense-active="true"]:visible')).toHaveCount(1);

      const persistedInlineReview = await admin
        .from("expenses")
        .select("vendor_name, status")
        .eq("id", seeded.ids.receipt)
        .single();
      expect(persistedInlineReview.error).toBeNull();
      expect(persistedInlineReview.data?.vendor_name).toBe(approvedVendor);
      expect(String(persistedInlineReview.data?.status).toLowerCase()).toBe("approved");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForExpensesQuerySuccess(page, 90_000);
      await expect(root.locator("[data-expense-detail-panel]")).toBeVisible();

      await page.setViewportSize({ width: 1024, height: 768 });
      const desktopLayout = await root.evaluate((element) => {
        const ledger = element.querySelector<HTMLElement>("[data-expenses-ledger]");
        const detail = element.querySelector<HTMLElement>("[data-expense-detail-panel]");
        if (!ledger || !detail) return null;
        const ledgerBox = ledger.getBoundingClientRect();
        const detailBox = detail.getBoundingClientRect();
        return {
          ledgerRight: ledgerBox.right,
          detailLeft: detailBox.left,
          detailWidth: detailBox.width,
          position: getComputedStyle(detail).position,
        };
      });
      expect(desktopLayout).not.toBeNull();
      expect(desktopLayout!.ledgerRight).toBeLessThanOrEqual(desktopLayout!.detailLeft + 2);
      expect(desktopLayout!.detailWidth).toBeGreaterThan(280);
      expect(desktopLayout!.position).not.toBe("fixed");

      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(panel.getByRole("button", { name: "Back to receipt queue" })).toBeVisible();
      await expect(panel).toHaveCSS("position", "fixed");
      await expect(evidenceStage).toBeHidden();

      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoPageHorizontalOverflow(page, 390);
      const back = panel.getByRole("button", { name: "Back to receipt queue" });
      const backBox = await back.boundingBox();
      expect(backBox?.width).toBeGreaterThanOrEqual(44);
      expect(backBox?.height).toBeGreaterThanOrEqual(44);
      await back.click();
      await expect(panel).toBeHidden();
      await expect(page).not.toHaveURL(/ops_record=/);
      const actionablePageErrors = unexpectedPageErrors(pageErrors).filter(
        (message) => !message.includes("status of 500") && !message.includes("status of 404")
      );
      expect(actionablePageErrors).toEqual([]);
    } finally {
      await cleanupCompactRows(admin, seeded);
    }
  });

  test("Receipt Inbox P0 review panel surfaces blockers and supports keyboard-only operation", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    let seeded: SeededCompactRows | null = null;
    try {
      seeded = await seedCompactRows(admin);
      await page.setViewportSize({ width: 1440, height: 900 });
      await loginAsE2EOwner(page, E2E_FINANCIAL_INBOX_URL);
      await gotoCompactInbox(page, seeded.prefix);

      const root = page.locator('[data-expenses-list-page="inbox"]');
      const row = expenseListRowById(page, seeded.ids.receipt);
      await row.locator("td").nth(1).click();

      const panel = root.locator("[data-expense-detail-panel]");
      await expect(panel).toBeVisible();
      const amount = panel.locator("#edit-expense-amount-input");
      const vendor = panel.locator("#edit-expense-vendor-input");
      const classification = panel.locator("#edit-expense-cost-allocation-select");
      const project = panel.locator("#edit-expense-project-select");
      const category = panel.locator("#edit-expense-category-select");
      const date = panel.locator("#inbox-preview-expense-date");
      const paymentAccount = panel.locator("#edit-expense-payment-select");

      await expect(amount).toBeVisible();
      await expect(vendor).toBeVisible();
      await expect(classification).toBeVisible();
      await expect(project).toBeVisible();
      await expect(category).toBeVisible();
      await expect(date).toBeVisible();
      await expect(paymentAccount).toBeVisible();
      await expect(category).toBeEnabled();
      await expect(paymentAccount).toBeEnabled();
      await expect(panel.getByText("Payment method", { exact: true })).toBeHidden();

      const fieldOrder = await panel
        .locator("[data-expense-review-field]")
        .evaluateAll((fields) =>
          fields.map((field) => field.getAttribute("data-expense-review-field"))
        );
      expect(fieldOrder.slice(0, 7)).toEqual([
        "amount",
        "vendor",
        "classification",
        "project",
        "category",
        "date",
        "payment-account",
      ]);

      const layout = await panel.evaluate((element) => {
        const box = (name: string) =>
          element
            .querySelector<HTMLElement>(`[data-expense-review-field="${name}"]`)
            ?.getBoundingClientRect();
        const amountBox = box("amount");
        const vendorBox = box("vendor");
        const classificationBox = box("classification");
        const projectBox = box("project");
        const categoryBox = box("category");
        const dateBox = box("date");
        return {
          amountWidth: amountBox?.width ?? 0,
          vendorWidth: vendorBox?.width ?? 0,
          amountTop: amountBox?.top ?? 0,
          vendorTop: vendorBox?.top ?? 0,
          classificationWidth: classificationBox?.width ?? 0,
          projectWidth: projectBox?.width ?? 0,
          classificationTop: classificationBox?.top ?? 0,
          projectTop: projectBox?.top ?? 0,
          categoryWidth: categoryBox?.width ?? 0,
          dateWidth: dateBox?.width ?? 0,
          categoryTop: categoryBox?.top ?? 0,
          dateTop: dateBox?.top ?? 0,
        };
      });
      expect(Math.abs(layout.amountTop - layout.vendorTop)).toBeLessThanOrEqual(2);
      expect(layout.amountWidth).toBeLessThan(layout.vendorWidth);
      expect(Math.abs(layout.classificationTop - layout.projectTop)).toBeLessThanOrEqual(2);
      expect(layout.classificationWidth).toBeLessThan(layout.projectWidth);
      expect(Math.abs(layout.categoryTop - layout.dateTop)).toBeLessThanOrEqual(2);
      expect(layout.categoryWidth).toBeGreaterThan(layout.dateWidth);

      await expect(amount).not.toBeFocused();
      await panel.getByRole("button", { name: "Close receipt detail" }).click();
      await expect(panel).toBeHidden();

      await row.focus();
      await row.press("Enter");
      await expect(panel).toBeVisible();
      await expect(amount).toBeFocused();
      await expect(category).toBeEnabled();
      await expect(paymentAccount).toBeEnabled();

      await page.keyboard.press("Tab");
      await expect(vendor).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(classification).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(project).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(category).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(date).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(paymentAccount).toBeFocused();

      const savedVendor = `${seeded.prefix} Shortcut Saved Vendor`;
      await vendor.fill(savedVendor);
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/expenses/${seeded!.ids.receipt}`) &&
          response.request().method() === "PATCH"
      );
      await page.keyboard.press("ControlOrMeta+s");
      expect((await saveResponsePromise).ok()).toBeTruthy();
      await expect(panel.locator("[data-expense-review-status]")).toContainText("Saved");

      const approveUrl = `**/api/financial/expenses/${seeded.ids.receipt}/approve-inbox`;
      await page.route(approveUrl, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "Owner QA forced shortcut failure" }),
        });
      });
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect(panel.getByRole("alert")).toContainText("Approval failed");
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}`)
      );
      await page.unroute(approveUrl);

      await panel.getByRole("button", { name: "Close receipt detail" }).click();
      const missingProjectRow = expenseListRowById(page, seeded.ids.missingProject);
      await missingProjectRow.locator("td").nth(1).click();
      await expect(panel).toBeVisible();
      await panel.locator("#edit-expense-cost-allocation-select").click();
      await page.getByRole("option", { name: "Project Cost", exact: true }).click();
      const missingProjectAction = panel.getByRole("button", {
        name: /Approve(?: & Next)?/,
      });
      await missingProjectAction.click();
      await expect(panel.locator("#edit-expense-project-error")).toContainText("Choose a project");
      await expect(panel.locator("#edit-expense-project-select")).toBeFocused();
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.missingProject)}`)
      );

      page.once("dialog", async (dialog) => dialog.accept());
      await panel.getByRole("button", { name: "Close receipt detail" }).click();
      await expect(panel).toBeHidden();
      await expensesVendorSearch(page).fill(savedVendor);
      const finalRow = expenseListRowById(page, seeded.ids.receipt);
      await finalRow.locator("td").nth(1).click();
      await expect(panel.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Approve & Next", exact: true })).toHaveCount(
        0
      );
    } finally {
      await cleanupCompactRows(admin, seeded);
    }
  });

  test("Expense Upload Approve & Next advances only after confirmed canonical success", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    let seeded: SeededCompactRows | null = null;
    try {
      seeded = await seedCompactRows(admin);
      await page.setViewportSize({ width: 1440, height: 900 });
      await loginAsE2EOwner(page, E2E_FINANCIAL_INBOX_URL);
      await gotoCompactInbox(page, seeded.prefix);

      const root = page.locator('[data-expenses-list-page="inbox"]');
      const row = expenseListRowById(page, seeded.ids.receipt);
      await row.locator("td").nth(1).click();
      const panel = root.locator("[data-expense-detail-panel]");
      const approveAndNext = panel.getByRole("button", {
        name: "Approve & Next",
        exact: true,
      });
      await expect(approveAndNext).toBeVisible();

      const approveUrl = `**/api/financial/expenses/${seeded.ids.receipt}/approve-inbox`;
      await page.route(approveUrl, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "Owner QA forced approval failure" }),
        });
      });
      await approveAndNext.click();
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}`)
      );
      await expect(row).toHaveAttribute("data-expense-active", "true");

      await page.unroute(approveUrl);
      await approveAndNext.click();
      await expect(page).not.toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(seeded.ids.receipt)}(?:&|$)`)
      );
      await expect(root.locator('[data-expense-active="true"]:visible')).toHaveCount(1);

      const persisted = await admin
        .from("expenses")
        .select("status")
        .eq("id", seeded.ids.receipt)
        .single();
      expect(persisted.error).toBeNull();
      expect(String(persisted.data?.status).toLowerCase()).toBe("approved");
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
      await loginAsE2EOwner(page, E2E_FINANCIAL_EXPENSES_ARCHIVE_URL);
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
      await expect(archiveReceiptRow.getByRole("button", { name: /Receipt attached/i })).toHaveText(
        /^Receipt$/
      );

      const metadataRow = expenseListRowById(page, seeded.ids.archiveNoDescription);
      await expect(metadataRow).toBeVisible();
      const metadataMerchant = metadataRow.locator("td").nth(1);
      await expect(metadataMerchant).toContainText(`HH ${seeded.prefix} Archive Metadata Vendor`);
      await expect(metadataMerchant).toContainText("No description");
      const metadataMerchantText = (await metadataMerchant.textContent()) ?? "";
      expect(metadataMerchantText).not.toMatch(/[A-Z][a-z]{2} \d{1,2}/);
      await expect(metadataMerchant).not.toContainText("Receipt upload");
      await expect(metadataRow.locator("td").nth(4)).toHaveText("Cash");

      const internalPaymentRow = expenseListRowById(page, seeded.ids.archiveInternalPayment);
      await expect(internalPaymentRow).toBeVisible();
      await expect(internalPaymentRow).not.toContainText("ZZ-PM");
      await expect(internalPaymentRow).not.toContainText("Receipt upload");
      await expect(internalPaymentRow.locator("td").nth(4)).toHaveText("—");
      await expect(internalPaymentRow.locator("td").nth(1).locator("p").nth(1)).toHaveText(
        "No description"
      );

      const noReceiptRow = expenseListRowById(page, seeded.ids.archiveNoReceipt);
      await expect(noReceiptRow.locator("td").nth(5)).toHaveText("Missing");
      const noReceiptIssueCell = noReceiptRow.getByTestId("expense-inbox-issues");
      await expect(noReceiptIssueCell).toHaveText(/^⚠\s*\d+$/);
      await noReceiptIssueCell.getByRole("button", { name: /issue/i }).hover();
      let popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Missing receipt");
      await popover.getByRole("button", { name: /Dismiss Missing receipt/i }).click();
      await expect(noReceiptIssueCell).toHaveText("Clear");
      await page.reload();
      await waitForExpensesQuerySuccess(page, 90_000);
      await expensesVendorSearch(page).fill(seeded.prefix);
      await expect(
        expenseListRowById(page, seeded.ids.archiveNoReceipt).getByTestId("expense-inbox-issues")
      ).toHaveText("Clear");

      const duplicateIssueCell = expenseListRowById(page, seeded.ids.archiveDuplicateA).getByTestId(
        "expense-inbox-issues"
      );
      await expect(duplicateIssueCell).toHaveText(/^⚠\s*\d+$/);
      await expect(duplicateIssueCell).not.toContainText(/Possible duplicate/i);
      await duplicateIssueCell.getByRole("button", { name: /issue/i }).hover();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await expect(popover).toContainText("Possible duplicate amount");
      await expect(popover).toContainText("Missing receipt");
      await popover.getByRole("button", { name: /Dismiss Missing receipt/i }).click();
      popover = page.getByTestId("expense-inbox-issue-popover").last();
      await popover.getByRole("button", { name: /Dismiss Possible duplicate amount/i }).click();
      await expect(duplicateIssueCell).toHaveText("Clear");

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
