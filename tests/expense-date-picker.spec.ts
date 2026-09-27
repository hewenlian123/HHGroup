import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import {
  clickVisibleQuickExpenseButton,
  waitForExpensesQuerySuccess,
  waitForVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";

function attachConsoleCollector(page: Page) {
  const consoleErrors: string[] = [];
  const responseErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`);
  });
  return {
    assertClean() {
      expect({ consoleErrors, responseErrors }).toEqual({ consoleErrors: [], responseErrors: [] });
    },
  };
}

async function expectNeoDatePicker(page: Page, triggerSelector: string) {
  const trigger = page.locator(triggerSelector);
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const popover = page.locator('[data-finance-date-picker-content="true"]').last();
  await expect(popover).toBeVisible({ timeout: 10_000 });
  await expect(popover).toContainText("Today");

  const surface = await popover.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    dark: document.documentElement.classList.contains("dark"),
  }));
  if (surface.dark) expect(surface.background).not.toBe("rgb(255, 255, 255)");
  else expect(surface.background).toBe("rgb(255, 255, 255)");

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden({ timeout: 10_000 });
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cleanupExpense(admin: SupabaseClient, expenseId: string): Promise<void> {
  await admin.from("attachments").delete().eq("entity_type", "expense").eq("entity_id", expenseId);
  await admin.from("expense_attachments").delete().eq("expense_id", expenseId);
  await admin.from("expense_lines").delete().eq("expense_id", expenseId);
  await admin.from("expenses").delete().eq("id", expenseId);
}

async function seedExpenseForDatePicker(
  admin: SupabaseClient,
  params: { id: string; vendor: string; status: string; projectId?: string | null }
): Promise<void> {
  await cleanupExpense(admin, params.id);
  const today = new Date().toISOString().slice(0, 10);
  const expenseInsert = await admin.from("expenses").insert({
    id: params.id,
    vendor_name: params.vendor,
    vendor: params.vendor,
    payment_method: "Amex",
    status: params.status,
    expense_date: today,
    source_type: "company",
    amount: 8.75,
    total: 8.75,
    line_count: 1,
    project_id: params.projectId ?? null,
  });
  expect(
    expenseInsert.error,
    expenseInsert.error ? JSON.stringify(expenseInsert.error) : ""
  ).toBeNull();

  const lineInsert = await admin.from("expense_lines").insert({
    expense_id: params.id,
    project_id: params.projectId ?? null,
    category: "Other",
    amount: 8.75,
    total: 8.75,
  });
  expect(lineInsert.error, lineInsert.error ? JSON.stringify(lineInsert.error) : "").toBeNull();
}

async function openExpenseInlineEditor(page: Page, url: string, expenseId: string) {
  const target = `${url}${url.includes("?") ? "&" : "?"}date_kind=all&ops_record=${expenseId}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForExpensesQuerySuccess(page, 90_000);
  const panel = page.locator("[data-expense-detail-panel]");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
  await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
  return panel;
}

async function openNewExpensePage(page: Page) {
  await loginAsE2EOwner(page, "/financial/expenses/new");
  const surface = page.locator("main");
  await expect(surface.getByRole("heading", { name: "New expense", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return surface;
}

test.describe("Expense date picker", () => {
  test.describe.configure({ timeout: 180_000 });

  test("New Expense uses the Neo date picker instead of native browser date UI", async ({
    page,
  }) => {
    const consoleState = attachConsoleCollector(page);
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForVisibleQuickExpenseButton(page, 150_000);
    await clickVisibleQuickExpenseButton(page);

    const dialog = page.getByRole("dialog", { name: /New expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('input[type="date"]')).toHaveCount(0);

    await expectNeoDatePicker(page, "#quick-expense-date");
    consoleState.assertClean();
  });

  test("shared picker resolves selected, today, and keyboard focus into one neutral state", async ({
    page,
  }) => {
    const newExpensePage = await openNewExpensePage(page);
    await newExpensePage.locator("#new-expense-date").click();

    const popover = page.locator('[data-finance-date-picker-content="true"]').last();
    await expect(popover).toBeVisible();
    const selectedCell = popover.locator('[data-selected="true"]').first();
    const selectedButton = selectedCell.getByRole("button");
    await expect(selectedCell).toHaveAttribute("data-today", "true");

    const selectedState = await selectedCell.evaluate((cell) => {
      const button = cell.querySelector("button");
      if (!button) throw new Error("Selected date button is missing");
      const cellStyle = getComputedStyle(cell);
      const buttonStyle = getComputedStyle(button);
      return {
        cellBackground: cellStyle.backgroundColor,
        cellHasVisibleShadow:
          cellStyle.boxShadow !== "none" &&
          cellStyle.boxShadow
            .split(/,(?=\s*rgba)/)
            .some((shadow) => !shadow.trim().startsWith("rgba(0, 0, 0, 0)")),
        buttonBackground: buttonStyle.backgroundColor,
        buttonBorder: buttonStyle.borderColor,
        buttonTransform: buttonStyle.transform,
      };
    });

    expect(selectedState.cellBackground).toBe("rgba(0, 0, 0, 0)");
    expect(selectedState.cellHasVisibleShadow).toBe(false);
    expect(selectedState.buttonBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(selectedState.buttonBorder).not.toBe("rgb(0, 0, 255)");
    expect(selectedState.buttonTransform).toBe("none");

    await selectedButton.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(selectedButton).toBeFocused();
    expect(await selectedButton.evaluate((button) => button.matches(":focus-visible"))).toBe(true);
    const focusedState = await selectedButton.evaluate((button) => ({
      outline: getComputedStyle(button).outlineColor,
      shadow: getComputedStyle(button).boxShadow,
    }));
    expect(`${focusedState.outline} ${focusedState.shadow}`).not.toContain("rgb(0, 0, 255)");

    await expect(popover.getByRole("button", { name: "Clear" })).toBeDisabled();
    const caption = popover.locator(".rdp-caption_label");
    await expect(caption).toHaveText("August 2026");
    await popover.getByRole("button", { name: "Go to the Next Month" }).click();
    await expect(caption).toHaveText("September 2026");
    await popover.getByRole("button", { name: "Go to the Previous Month" }).click();
    await expect(caption).toHaveText("August 2026");

    await popover.getByRole("button", { name: "Saturday, August 15th, 2026" }).click();
    await expect(newExpensePage.locator("#new-expense-date")).toContainText("08/15/2026");
    await expect(popover).toBeVisible();
    await popover.getByRole("button", { name: "Today", exact: true }).click();
    const [year, month, day] = hawaiiTodayYmd().split("-");
    await expect(newExpensePage.locator("#new-expense-date")).toContainText(
      `${month}/${day}/${year}`
    );

    await newExpensePage.locator("#new-expense-date").click();
    await newExpensePage.getByRole("heading", { name: /New expense/i }).click();
    await expect(popover).toBeHidden();
    await newExpensePage.locator("#new-expense-date").click();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
  });

  test("shared picker keeps the V2 Light surface through the portal", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsE2EOwner(page, "/financial/payments");
    const receivePayment = page.getByRole("button", { name: "Receive Payment", exact: true });
    await expect(receivePayment.first()).toBeVisible({ timeout: 30_000 });
    await receivePayment.first().click();

    const dialog = page.getByRole("dialog", { name: "Receive Payment" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Choose date" }).click();

    const popover = page.locator('[data-finance-date-picker-content="true"]').last();
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute("data-finance-date-picker-appearance", "default");
    const colors = await popover.evaluate((node) => {
      const selectedButton = node.querySelector('[data-selected="true"] button');
      return {
        surface: getComputedStyle(node).backgroundColor,
        text: getComputedStyle(node).color,
        backdropFilter: getComputedStyle(node).backdropFilter,
        selected: selectedButton ? getComputedStyle(selectedButton).backgroundColor : null,
        selectedText: selectedButton ? getComputedStyle(selectedButton).color : null,
      };
    });
    expect(colors.surface).toBe("rgb(255, 255, 255)");
    expect(colors.text).toBe("rgb(24, 26, 30)");
    expect(colors.backdropFilter).toBe("none");
    expect(colors.selected).not.toBe("rgb(0, 0, 255)");
    expect(colors.selectedText).not.toBe("rgb(0, 0, 255)");

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
  });

  test("shared Light call site can select and clear an optional date", async ({ page }) => {
    await loginAsE2EOwner(page, "/estimates/44444444-4444-4444-4444-444444444449");
    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await expect(edit).toBeVisible({ timeout: 30_000 });
    await edit.click();
    await page.getByRole("button", { name: /Edit details/i }).click();

    const details = page.getByRole("dialog", {
      name: "Customer / project / pricing details",
    });
    await expect(details).toBeVisible({ timeout: 15_000 });
    const validUntil = details.getByRole("button", { name: "Choose date" }).last();
    await validUntil.click();

    const popover = page.locator('[data-finance-date-picker-content="true"]').last();
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute("data-finance-date-picker-appearance", "default");
    const firstAvailableDate = popover
      .locator(".rdp-day:not(.rdp-outside):not(.rdp-disabled) button")
      .first();
    await firstAvailableDate.click();
    await expect(popover).toBeHidden();

    await validUntil.click();
    const clear = popover.getByRole("button", { name: "Clear", exact: true });
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(validUntil).toContainText("Select date");
  });

  test("Expense inline edit uses the shared date picker", async ({ page }) => {
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required to seed date picker smoke rows.");
    const consoleState = attachConsoleCollector(page);
    const reviewedId = randomUUID();
    const reviewedVendor = `E2E-DATE-EDIT-${Date.now()}`;

    await seedExpenseForDatePicker(admin!, {
      id: reviewedId,
      vendor: reviewedVendor,
      status: "reviewed",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await loginAsE2EOwner(page, "/financial/expenses");
      const editPanel = await openExpenseInlineEditor(page, "/financial/expenses", reviewedId);
      await expect(editPanel.locator('input[type="date"]')).toHaveCount(0);
      await expectNeoDatePicker(page, "#inbox-preview-expense-date");

      consoleState.assertClean();
    } finally {
      await cleanupExpense(admin!, reviewedId);
    }
  });

  test("New Expense uses the Neo date picker without mobile overflow", async ({ page }) => {
    const consoleState = attachConsoleCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const newExpensePage = await openNewExpensePage(page);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await expectNeoDatePicker(page, "#new-expense-date");

    await newExpensePage.locator("#new-expense-date").click();
    const popover = page.locator('[data-finance-date-picker-content="true"]').last();
    const touchGeometry = await popover.evaluate((node) => {
      const dateButton = node.querySelector<HTMLElement>(".rdp-day_button");
      const navButton = node.querySelector<HTMLElement>(".rdp-button_previous");
      const rect = node.getBoundingClientRect();
      return {
        dateTarget: dateButton?.getBoundingClientRect().height ?? 0,
        navTarget: navButton?.getBoundingClientRect().height ?? 0,
        left: rect.left,
        right: rect.right,
        viewport: window.innerWidth,
      };
    });
    expect(touchGeometry.dateTarget).toBeGreaterThanOrEqual(44);
    expect(touchGeometry.navTarget).toBeGreaterThanOrEqual(44);
    expect(touchGeometry.left).toBeGreaterThanOrEqual(8);
    expect(touchGeometry.right).toBeLessThanOrEqual(touchGeometry.viewport - 8);
    await page.keyboard.press("Escape");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    consoleState.assertClean();
  });
});

test.describe("Shared date picker coarse-pointer sizing", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("iPad touch targets remain reachable without clipping", async ({ page }) => {
    const newExpensePage = await openNewExpensePage(page);
    await newExpensePage.locator("#new-expense-date").click();

    const popover = page.locator('[data-finance-date-picker-content="true"]').last();
    await expect(popover).toBeVisible();
    const geometry = await popover.evaluate((node) => {
      const targets = Array.from(
        node.querySelectorAll<HTMLElement>(
          ".rdp-day_button, .rdp-button_previous, .rdp-button_next"
        )
      );
      const rect = node.getBoundingClientRect();
      return {
        minimumTarget: Math.min(...targets.map((target) => target.getBoundingClientRect().height)),
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(geometry.minimumTarget).toBeGreaterThanOrEqual(44);
    expect(geometry.left).toBeGreaterThanOrEqual(8);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 8);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 8);
    expect(geometry.pageOverflow).toBe(false);
  });
});
