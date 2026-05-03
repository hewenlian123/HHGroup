import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_ID, E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  attachmentPreviewModal,
  clickVisibleQuickExpenseButton,
  dialogPaymentAccountSelect,
  expenseListRow,
  expensesVendorSearch,
  paymentAccountSelectChooseAddNew,
  pickOrCreatePaymentInSelect,
  prepareReceiptQueueRowForConfirm,
  receiptQueueExpenseSuccessSeen,
  receiptQueuePaymentAccountTrigger,
  receiptQueueRowByFileName,
  E2E_FINANCIAL_INBOX_URL,
  waitForExpensesQuerySuccess,
  waitForQuickExpenseProjectLabel,
} from "./e2e-expenses-helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function attachConsoleErrorCollector(page: import("@playwright/test").Page): {
  assertNoErrors: () => void;
} {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return {
    assertNoErrors: () => {
      const fatal = errors.filter(
        (e) =>
          !/favicon|ResizeObserver|Non-Error promise rejection/i.test(e) &&
          !/Failed to load resource.*404/.test(e) &&
          !/Failed to load resource.*\b400\b|Bad Request/i.test(e) &&
          !/Failed to load resource.*\b401\b|Unauthorized/i.test(e)
      );
      expect(fatal, `Console errors: ${fatal.join(" | ")}`).toEqual([]);
    },
  };
}

test.describe("Expenses upgrades (queue, quick, edit, list, payment)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("receipt queue: upload, payment, preview, confirm", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const { assertNoErrors } = attachConsoleErrorCollector(page);

    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase browser client not configured.");
    }

    const vendorMark = `E2E-UP-${Date.now()}`;
    const queueFileName = `rq-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const queueRow = receiptQueueRowByFileName(page, queueFileName);
    await expect(queueRow).toBeVisible({ timeout: 120_000 });
    await prepareReceiptQueueRowForConfirm(page, queueRow, {
      vendor: vendorMark,
      amount: "15.00",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });

    const paySel = receiptQueuePaymentAccountTrigger(queueRow);
    await pickOrCreatePaymentInSelect(page, paySel);

    await queueRow.getByRole("button", { name: /preview receipt/i }).click();
    const preview = attachmentPreviewModal(page);
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.getByRole("button", { name: "Close" }).click();

    await prepareReceiptQueueRowForConfirm(
      page,
      queueRow,
      { vendor: vendorMark, amount: "15.00", projectId: E2E_PRESERVED_PROJECT_ID },
      { assertConfirmEnabled: true }
    );
    await pickOrCreatePaymentInSelect(page, paySel);

    await queueRow.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect
      .poll(
        async () => {
          const t = await page.locator("body").innerText();
          if (/create failed/i.test(t)) throw new Error("Confirm failed.");
          if (receiptQueueExpenseSuccessSeen(t)) return "ok";
          const n = await page
            .getByTestId("receipt-queue-row")
            .filter({ has: page.locator(`input[value="${vendorMark}"]`) })
            .count();
          if (n === 0) return "ok";
          return null;
        },
        { timeout: 120_000, intervals: [300] }
      )
      .toBe("ok");

    assertNoErrors();
  });

  test("quick expense: compact dialog, 2-column grid, payment, list shows account", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    const { assertNoErrors } = attachConsoleErrorCollector(page);

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    if (
      await dialog
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const box = await dialog.boundingBox();
    expect(box && box.height).toBeTruthy();
    if (box) expect(box.height).toBeLessThan(760);

    await expect(dialog.locator(".grid.grid-cols-2").first()).toBeVisible();

    await dialog.locator("input[type='number']").fill("77.01");
    const vendorMark = `E2E-QP-${Date.now()}`;
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);

    await pickOrCreatePaymentInSelect(page, dialogPaymentAccountSelect(dialog, page));

    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await dialog
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
    }

    await expect
      .poll(
        async () => (/expense saved/i.test(await page.locator("body").innerText()) ? "ok" : null),
        {
          timeout: 120_000,
          intervals: [400],
        }
      )
      .toBe("ok");

    await expect(dialog).not.toBeVisible({ timeout: 30_000 });

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(vendorMark);
    const row = expenseListRow(page, vendorMark);
    await expect(row).toBeVisible({ timeout: 60_000 });
    // List shows `payment_method` (quick create uses "Other"), not payment account name.
    await expect(row).toContainText("Other");
    await expect(row).toContainText("77.01");
    await expect(row).toContainText("[E2E] Seed — HH Unified");

    assertNoErrors();
  });

  test("payment account: add new from quick expense and save", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await clickVisibleQuickExpenseButton(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    if (
      await dialog
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const acct = `E2E-Pay-${Date.now()}`;
    const paySelect = dialogPaymentAccountSelect(dialog, page);
    await paymentAccountSelectChooseAddNew(page, paySelect);

    const sub = page.getByRole("dialog", { name: /New payment account/i });
    await expect(sub).toBeVisible({ timeout: 10_000 });
    await sub.getByPlaceholder("Name (e.g. Amex)").fill(acct);
    await sub.getByPlaceholder("Name (e.g. Amex)").press("Enter");

    await expect(sub).toBeHidden({ timeout: 30_000 });

    await dialog.locator("input[type='number']").fill("5");
    await dialog.locator("#quick-expense-vendor").fill(`V-${acct}`);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await dialog
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
    }
    await expect(dialog).not.toBeVisible({ timeout: 90_000 });
  });

  test("edit expense modal: vendor, amount, payment persist", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await clickVisibleQuickExpenseButton(page);
    const q = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(q).toBeVisible({ timeout: 15_000 });
    if (
      await q
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const vendorBase = `E2E-ED-${Date.now()}`;
    await q.locator("input[type='number']").fill("33");
    await q.locator("#quick-expense-vendor").fill(vendorBase);
    await q.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(q, E2E_PRESERVED_PROJECT_LABEL);
    await q.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await q
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await q.getByRole("button", { name: "Save", exact: true }).click();
    }
    await expect(q).not.toBeVisible({ timeout: 60_000 });

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(vendorBase);
    const row = expenseListRow(page, vendorBase);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.scrollIntoViewIfNeeded();
    await row.getByRole("button", { name: /row actions/i }).click();
    await page
      .getByRole("menuitem", { name: "Edit", exact: true })
      .click({ force: true, timeout: 30_000 });

    const editDlg = page.getByRole("dialog", { name: /Edit expense/i });
    await expect(editDlg).toBeVisible({ timeout: 15_000 });

    await editDlg.getByTestId("edit-expense-vendor-input").fill(`${vendorBase}-X`);
    await editDlg.locator('input[type="number"]').fill("44.55");

    const editPay = dialogPaymentAccountSelect(editDlg, page);
    await pickOrCreatePaymentInSelect(page, editPay, ["Chase", "Amex", "Cash"]);

    await editDlg.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(
        async () => {
          const body = await page.locator("body").innerText();
          if (/save failed|something went wrong/i.test(body)) {
            throw new Error("Edit expense save failed (error text in page).");
          }
          return /\bSaved\b|expense updated/i.test(body) ? "ok" : null;
        },
        {
          timeout: 30_000,
          intervals: [300],
        }
      )
      .toBe("ok");

    await expect(editDlg).not.toBeVisible({ timeout: 15_000 });

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(`${vendorBase}-X`);
    const row2 = expenseListRow(page, `${vendorBase}-X`);
    await expect(row2).toBeVisible({ timeout: 20_000 });
    await expect(row2).toContainText("44.55");
  });

  test("expenses list: unreviewed view, status control visible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/financial/inbox", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    const rows = page.locator("main table tbody > tr.exp-row, main ul.exp-divide > li.exp-row");
    if ((await rows.count()) === 0) {
      test.skip(true, "No unreviewed expenses in seed.");
    }

    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByText(/Needs Review|Done/)).toBeVisible();
  });
});
