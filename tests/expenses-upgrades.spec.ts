import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import {
  dialogPaymentAccountSelect,
  expenseListRow,
  expensesVendorSearch,
  pickOrCreatePaymentInSelect,
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

    const queueRow = page.locator("tbody tr").filter({ hasText: queueFileName }).first();
    await expect(queueRow).toBeVisible({ timeout: 120_000 });
    const vendorInput = queueRow.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorInput.waitFor({ state: "visible", timeout: 120_000 });
    await vendorInput.fill(vendorMark);
    await queueRow.getByPlaceholder("Amount").fill("15.00");

    const projectSelect = queueRow
      .locator("select")
      .filter({ has: page.locator(`option[value="${E2E_PRESERVED_PROJECT_ID}"]`) });
    await projectSelect.selectOption({ value: E2E_PRESERVED_PROJECT_ID });

    const paySel = queueRow
      .locator("select")
      .filter({ has: page.getByRole("option", { name: "+ Add new account" }) })
      .first();
    await pickOrCreatePaymentInSelect(page, paySel);

    await queueRow.getByRole("button", { name: "Preview receipt" }).click();
    const preview = page.getByRole("dialog", { name: /Receipt preview/i });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.getByRole("button", { name: "Close" }).click();

    await expect(queueRow.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled({
      timeout: 120_000,
    });
    await queueRow.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect
      .poll(
        async () => {
          const t = await page.locator("body").innerText();
          if (/create failed/i.test(t)) throw new Error("Confirm failed.");
          return /expense created/i.test(t) ? "ok" : null;
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

    await page
      .getByRole("button", { name: /Quick expense/i })
      .first()
      .click();
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
    if (box) expect(box.height).toBeLessThan(660);

    await expect(dialog.locator(".grid.grid-cols-2").first()).toBeVisible();

    await dialog.locator("input[type='number']").fill("77.01");
    const vendorMark = `E2E-QP-${Date.now()}`;
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog
      .locator("select")
      .filter({ has: page.locator(`option[value="${E2E_PRESERVED_PROJECT_ID}"]`) })
      .selectOption({ value: E2E_PRESERVED_PROJECT_ID });

    const payLabel = await pickOrCreatePaymentInSelect(
      page,
      dialogPaymentAccountSelect(dialog, page)
    );

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

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(vendorMark);
    const row = expenseListRow(page, vendorMark);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () => {
          const t = await row.innerText();
          return t.includes(payLabel) ? "ok" : null;
        },
        { timeout: 60_000, intervals: [400] }
      )
      .toBe("ok");

    assertNoErrors();
  });

  test("payment account: add new from quick expense and save", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await page
      .getByRole("button", { name: /Quick expense/i })
      .first()
      .click();
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
    await expect(paySelect).toBeEnabled({ timeout: 60_000 });
    await paySelect.selectOption({ label: "+ Add new account" });

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

    await page
      .getByRole("button", { name: /Quick expense/i })
      .first()
      .click();
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
    await q
      .locator("select")
      .filter({ has: page.locator(`option[value="${E2E_PRESERVED_PROJECT_ID}"]`) })
      .selectOption({ value: E2E_PRESERVED_PROJECT_ID });
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

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(vendorBase);
    const row = expenseListRow(page, vendorBase);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.hover();
    await row.getByRole("button", { name: "Edit" }).click();

    const editDlg = page.getByRole("dialog", { name: /Edit expense/i });
    await expect(editDlg).toBeVisible({ timeout: 15_000 });

    await editDlg.locator(".col-span-2 input").first().fill(`${vendorBase}-X`);
    await editDlg.locator('input[type="number"]').fill("44.55");

    const editPay = dialogPaymentAccountSelect(editDlg, page);
    await pickOrCreatePaymentInSelect(page, editPay, ["Chase", "Amex", "Cash"]);

    await editDlg.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(
        async () => (/expense updated/i.test(await page.locator("body").innerText()) ? "ok" : null),
        {
          timeout: 30_000,
          intervals: [300],
        }
      )
      .toBe("ok");

    await expect(editDlg).not.toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(`${vendorBase}-X`);
    const row2 = expenseListRow(page, `${vendorBase}-X`);
    await expect(row2).toBeVisible({ timeout: 20_000 });
    await expect(row2).toContainText("44.55");
  });

  test("expenses list: unreviewed view, status control visible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/financial/expenses?view=unreviewed", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    const list = page.locator("main ul.exp-divide");
    if ((await list.locator("> li").count()) === 0) {
      test.skip(true, "No unreviewed expenses in seed.");
    }

    const firstRow = list.locator("> li").first();
    await expect(firstRow).toBeVisible();
    await expect(
      firstRow
        .locator("button")
        .filter({ hasText: /reviewed|Pending|Needs/i })
        .first()
    ).toBeVisible();
  });
});
