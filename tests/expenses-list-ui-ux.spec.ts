import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { waitForExpensesQuerySuccess } from "./e2e-expenses-helpers";

test.describe("Expenses list UI/UX", () => {
  test.describe.configure({ timeout: 180_000 });

  async function showAllExpenseDates(page: import("@playwright/test").Page): Promise<void> {
    const filters = page
      .getByRole("button", { name: /Filters/ })
      .filter({ visible: true })
      .first();
    await filters.click();
    await page
      .getByRole("button", { name: "This month", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "All time", exact: true })
      .filter({ visible: true })
      .first()
      .click();

    await expect(
      page.locator('[data-expense-component-surface="date-filter"]').last()
    ).toBeHidden();

    const done = page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true });
    if ((await done.count()) > 0) await done.first().click();
    else await page.keyboard.press("Escape");

    await expect(page.locator('[data-expense-component-surface="filters"]').last()).toBeHidden();
  }

  async function waitForExpensesReady(page: import("@playwright/test").Page): Promise<void> {
    try {
      await waitForExpensesQuerySuccess(page);
    } catch (error) {
      const retry = page
        .locator("[data-expenses-error]")
        .getByRole("button", { name: "Retry" })
        .filter({ visible: true });
      if ((await retry.count()) === 0) throw error;
      await retry.first().click();
      await waitForExpensesQuerySuccess(page);
    }
  }

  async function expectStablePortalControls(
    surface: import("@playwright/test").Locator
  ): Promise<void> {
    const invalid = await surface
      .locator(
        'button:visible, a[href]:visible, summary:visible, [role="button"]:visible, [role="menuitem"]:visible, [role="option"]:visible, [role="combobox"]:visible'
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80),
              transform: style.transform,
              transitionProperty: style.transitionProperty,
            };
          })
          .filter(
            ({ transform, transitionProperty }) =>
              transform !== "none" || /(^|,\s*)(all|transform)(,|$)/.test(transitionProperty)
          )
      );
    expect(invalid).toEqual([]);
  }

  async function openFirstExpenseWorkspaceRecord(
    page: import("@playwright/test").Page
  ): Promise<{ id: string; row: import("@playwright/test").Locator }> {
    await showAllExpenseDates(page);
    const root = page.locator('[data-expenses-list-page="expenses"]');
    const row = root.locator("[data-expense-id]:visible").first();
    await row.waitFor({ state: "visible", timeout: 15_000 });
    const id = await row.getAttribute("data-expense-id");
    expect(id, "The selected Expense must retain its canonical record id").toBeTruthy();
    await row.click();
    return { id: id!, row };
  }

  test("Expense Operations shell keeps four canonical surfaces in one workspace", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await page.goto(
      "/financial/expenses?date_kind=all&project_id=project-a&status=paid&ops_record=record-a",
      { waitUntil: "domcontentloaded" }
    );

    const shell = page.locator("[data-expense-operations-shell]");
    await expect(shell).toBeVisible();
    await expect(
      shell.getByRole("heading", { name: "Expense Operations", exact: true })
    ).toBeVisible();

    const nav = shell.getByRole("navigation", { name: "Expense Operations workspace" });
    await expect(nav.getByRole("link")).toHaveCount(4);
    await expect(nav.getByRole("link", { name: "Expenses", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(nav.getByRole("link", { name: "Receipt Inbox", exact: true })).toHaveAttribute(
      "href",
      "/financial/inbox?date_kind=all&project_id=project-a"
    );
    await expect(nav.getByRole("link", { name: "Worker Receipts", exact: true })).toHaveAttribute(
      "href",
      "/labor/receipts?project_id=project-a"
    );
    await expect(nav.getByRole("link", { name: "Reimbursements", exact: true })).toHaveAttribute(
      "href",
      "/labor/reimbursements?project_id=project-a"
    );

    await page.goto(
      "/labor/receipts?project_id=project-a&workerId=worker-a&date_kind=all&status=pending",
      { waitUntil: "domcontentloaded" }
    );
    const workerShell = page.locator("[data-expense-operations-shell]");
    await expect(workerShell).toBeVisible();
    const workerNav = workerShell.getByRole("navigation", {
      name: "Expense Operations workspace",
    });
    await expect(
      workerNav.getByRole("link", { name: "Worker Receipts", exact: true })
    ).toHaveAttribute("aria-current", "page");
    await expect(
      workerNav.getByRole("link", { name: "Reimbursements", exact: true })
    ).toHaveAttribute("href", "/labor/reimbursements?project_id=project-a&workerId=worker-a");
    await expect(workerNav.getByRole("link", { name: "Expenses", exact: true })).toHaveAttribute(
      "href",
      "/financial/expenses?project_id=project-a"
    );

    await workerNav.getByRole("link", { name: "Reimbursements", exact: true }).click();
    await expect(page).toHaveURL(
      /\/labor\/reimbursements\?project_id=project-a&workerId=worker-a$/
    );
    await expect(
      page
        .locator("[data-expense-operations-shell]")
        .getByRole("link", { name: "Reimbursements", exact: true })
    ).toHaveAttribute("aria-current", "page");
  });

  test("New Expense is the single list creation entry and direct route remains the full-entry form", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const desktopHeader = root.locator('[data-expense-surface-header="desktop"]');
    const newExpense = desktopHeader.getByRole("button", {
      name: "New Expense",
      exact: true,
    });
    await expect(newExpense).toHaveCount(1);
    await expect(desktopHeader.getByRole("button", { name: "Quick", exact: true })).toHaveCount(0);

    await newExpense.click();
    const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-testid", "quick-expense-dialog");
    await expect(dialog.locator("#quick-expense-vendor")).toBeVisible();
    await expect(dialog.locator("#quick-expense-project-select")).toBeVisible();
    await expect(dialog.locator("[data-quick-expense-more-content]")).toHaveCount(0);

    const moreDetails = dialog.getByRole("button", { name: /More Details/i });
    await moreDetails.click();
    await expect(moreDetails).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.locator("[data-quick-expense-more-content]")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    await page.goto("/financial/expenses/new", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/financial\/expenses\/new(?:\?|$)/);
    const fullEntryPage = page.locator("main");
    await expect(
      fullEntryPage.getByRole("heading", { name: "New expense", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(fullEntryPage.locator("#new-expense-date")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "New Expense", exact: true })).toHaveCount(0);
  });

  test("New Expense uses the lightweight control hierarchy without changing form semantics", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    await root
      .locator('[data-expense-surface-header="desktop"]')
      .getByRole("button", { name: "New Expense", exact: true })
      .click();

    const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
    const amount = dialog.locator("[data-new-expense-amount]");
    await expect(amount).toHaveAttribute("type", "number");
    await expect(amount).toHaveAttribute("inputmode", "decimal");
    await expect(amount).toHaveCSS("appearance", "textfield");
    await dialog.locator("#quick-expense-vendor").focus();
    const amountDefault = await amount.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });
    await amount.focus();
    await expect
      .poll(() => amount.evaluate((element) => getComputedStyle(element).borderColor))
      .not.toBe(amountDefault.borderColor);
    const amountFocused = await amount.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });
    expect(amountFocused.borderColor).not.toBe(amountDefault.borderColor);
    expect(amountFocused.boxShadow).not.toBe(amountDefault.boxShadow);

    await dialog.getByRole("button", { name: /More Details/i }).click();
    const deduction = dialog.locator('[data-expense-subcontract-appearance="compact"]');
    await expect(deduction).toBeVisible();
    const deductionStyle = await deduction.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect({
      backgroundColor: deductionStyle.backgroundColor,
      borderTopWidth: deductionStyle.borderTopWidth,
    }).toEqual({
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderTopWidth: "0px",
    });
    expect(
      deductionStyle.boxShadow === "none" ||
        deductionStyle.boxShadow
          .split(/, (?=rgba)/)
          .every((shadow) => shadow.startsWith("rgba(0, 0, 0, 0)"))
    ).toBe(true);

    const dropzone = dialog.locator('[data-new-expense-receipt-dropzone="true"]');
    await expect(dropzone).toBeVisible();
    await expect(dropzone.locator('[data-new-expense-receipt-icon="true"]')).toBeVisible();
    const dropzoneStyle = await dropzone.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderStyle: style.borderStyle,
        boxShadow: style.boxShadow,
      };
    });
    expect(dropzoneStyle.borderStyle).toBe("solid");
    expect(
      dropzoneStyle.boxShadow === "none" ||
        dropzoneStyle.boxShadow
          .split(/, (?=rgba)/)
          .every((shadow) => shadow.startsWith("rgba(0, 0, 0, 0)"))
    ).toBe(true);

    const shortcuts = dialog.locator('[data-new-expense-shortcuts="true"]');
    await expect(shortcuts).toBeVisible();
    const shortcutStyle = await shortcuts.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        opacity: Number.parseFloat(style.opacity),
      };
    });
    expect(shortcutStyle.fontSize).toBeLessThanOrEqual(10);
    expect(shortcutStyle.opacity).toBeLessThanOrEqual(0.72);

    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await save.evaluate((button) => button.setAttribute("disabled", ""));
    const saveStyle = await save.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        opacity: style.opacity,
      };
    });
    expect(saveStyle.opacity).toBe("1");
    expect(saveStyle.backgroundColor).not.toBe("rgb(24, 24, 27)");
    expect(saveStyle.color).not.toBe("rgb(250, 250, 250)");

    const moreSection = dialog.locator('[data-new-expense-more-section="true"]');
    await expect(moreSection).toBeVisible();
    await expect(moreSection).toHaveCSS("border-top-width", "0px");

    const footer = dialog.locator('[data-new-expense-footer="true"]');
    await expect(footer).toBeVisible();
    await expect(footer).toHaveCSS("border-top-width", "0px");
    const footerShadow = await footer.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(footerShadow).toMatch(/inset/);
    expect(footerShadow).not.toMatch(/rgba\(.+, 0\.[5-9]\d*\)/);

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(dialog).toHaveCSS("background-color", "rgb(41, 41, 41)");
    await expect(dropzone).toHaveCSS("border-style", "solid");
    await expect(moreSection).toHaveCSS("border-top-width", "0px");
    await expect
      .poll(() => amount.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(41, 41, 41)");
    const darkFieldStyle = await amount.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    expect(darkFieldStyle.background).toBe("rgb(41, 41, 41)");
    expect(darkFieldStyle.border).not.toBe(darkFieldStyle.background);
  });

  test("bulk actions expose only implemented canonical capabilities", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await showAllExpenseDates(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const select = root
      .getByRole("button", { name: /^Select / })
      .filter({ visible: true })
      .first();
    await select.click();
    const bulk = root.getByRole("status", { name: "Bulk actions" });
    await expect(bulk).toBeVisible();
    await expect(bulk.getByRole("button", { name: "Download", exact: true })).toHaveCount(0);
  });

  test("master-detail owns independent desktop scrolling and locks mobile background", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await openFirstExpenseWorkspaceRecord(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const queueScroll = root.locator(".expense-compact-table-scroll, [data-expense-mobile-ledger]");
    const detailScroll = root.locator("[data-expense-detail-body]");
    await expect(queueScroll).toBeVisible();
    await expect(detailScroll).toBeVisible();

    const queueMetrics = await queueScroll.evaluate((element) => {
      element.scrollTop = 120;
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        overflowY: getComputedStyle(element).overflowY,
      };
    });
    expect(queueMetrics.overflowY).toBe("auto");
    expect(queueMetrics.scrollHeight).toBeGreaterThan(queueMetrics.clientHeight);
    expect(queueMetrics.scrollTop).toBeGreaterThan(0);

    const detailMetrics = await detailScroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(detailMetrics.overflowY).toBe("auto");
    expect(detailMetrics.clientHeight).toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const appScrollRoot = page.locator("[data-app-scroll-root]");
    await expect(appScrollRoot).toHaveAttribute("data-expense-detail-scroll-lock", "true");
    await expect(appScrollRoot).toHaveCSS("overflow-y", "hidden");

    await root.getByRole("button", { name: "Back to expense queue" }).click();
    await expect(appScrollRoot).not.toHaveAttribute("data-expense-detail-scroll-lock", "true");
  });

  test("desktop uses URL-backed master-detail and edits in the same contextual surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    const { id, row } = await openFirstExpenseWorkspaceRecord(page);
    const root = page.locator('[data-expenses-list-page="expenses"]');
    const panel = root.locator("[data-expense-detail-panel]");

    await expect(panel).toBeVisible();
    await expect(root.locator("[data-expenses-ledger]")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`ops_record=${encodeURIComponent(id)}`));
    await expect(row).toHaveAttribute("data-expense-active", "true");
    const activeRowStyle = await row.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
    expect(activeRowStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      activeRowStyle.boxShadow,
      "Selected row uses only the restrained neutral anchor"
    ).toMatch(/inset/);
    expect(activeRowStyle.boxShadow).not.toMatch(/rgb\(0, 0, 0\)|0px 0px 0px 1px/);
    await expect(panel.locator("[data-expense-detail-amount]")).toBeVisible();

    await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    const vendor = panel.getByTestId("edit-expense-vendor-input");
    await expect(vendor).toBeFocused();
    await expect(root.locator("[data-expenses-ledger]")).toBeVisible();

    const originalVendor = await vendor.inputValue();
    await vendor.fill(`${originalVendor} owner-polish`);
    const [, discardMessage] = await Promise.all([
      page.keyboard.press("Escape"),
      page.waitForEvent("dialog").then(async (dialog) => {
        const message = dialog.message();
        await dialog.dismiss();
        return message;
      }),
    ]);
    expect(discardMessage).toContain("Discard unsaved expense changes");
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    await expect(vendor).toHaveValue(`${originalVendor} owner-polish`);
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "preview");
    await expect(page).toHaveURL(new RegExp(`ops_record=${encodeURIComponent(id)}`));
    await expect(row).toHaveAttribute("data-expense-active", "true");

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/ops_record=/);
    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`ops_record=${encodeURIComponent(id)}`));

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForExpensesReady(page);
    await expect(page.locator("[data-expense-detail-panel]")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`ops_record=${encodeURIComponent(id)}`));
  });

  test("desktop detail close button clears the contextual selection", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    await openFirstExpenseWorkspaceRecord(page);
    const root = page.locator('[data-expenses-list-page="expenses"]');
    const panel = root.locator("[data-expense-detail-panel]");
    const close = panel.getByRole("button", { name: "Close expense detail", exact: true });

    await expect(close).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    const closeBox = await close.boundingBox();
    expect(closeBox?.height, "iPad landscape close target").toBeGreaterThanOrEqual(44);
    expect(closeBox?.width, "iPad landscape close target").toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/ops_record=/);
    await expect(root.locator('[data-expense-active="true"]:visible')).toHaveCount(0);
  });

  test("desktop detail close button confirms before discarding inline edits", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    await openFirstExpenseWorkspaceRecord(page);
    const panel = page.locator("[data-expense-detail-panel]");
    await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
    const vendor = panel.getByTestId("edit-expense-vendor-input");
    const editedVendor = `${await vendor.inputValue()} close-confirmation`;
    await vendor.fill(editedVendor);

    const close = panel.getByRole("button", { name: "Close expense detail", exact: true });
    const [, dismissedMessage] = await Promise.all([
      close.click(),
      page.waitForEvent("dialog").then(async (dialog) => {
        const message = dialog.message();
        await dialog.dismiss();
        return message;
      }),
    ]);
    expect(dismissedMessage).toContain("Discard unsaved expense changes");
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    await expect(vendor).toHaveValue(editedVendor);

    await Promise.all([
      close.click(),
      page.waitForEvent("dialog").then((dialog) => dialog.accept()),
    ]);
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/ops_record=/);
  });

  test("Save & Next advances only after confirmed save success", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    const { id: firstId } = await openFirstExpenseWorkspaceRecord(page);
    const panel = page.locator("[data-expense-detail-panel]");
    await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
    const vendor = panel.getByTestId("edit-expense-vendor-input");
    const editedVendor = `${await vendor.inputValue()} failure-preserved`;
    await vendor.fill(editedVendor);

    await page.route(`**/api/expenses/${firstId}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "Owner QA forced save failure" }),
      });
    });
    await panel.getByRole("button", { name: "Save & Next", exact: true }).click();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    await expect(vendor).toHaveValue(editedVendor);
    await expect(page).toHaveURL(new RegExp(`ops_record=${encodeURIComponent(firstId)}`));

    await page.unroute(`**/api/expenses/${firstId}`);
    await page.route(`**/api/expenses/${firstId}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await panel.getByRole("button", { name: "Save & Next", exact: true }).click();
    await expect(page).not.toHaveURL(
      new RegExp(`ops_record=${encodeURIComponent(firstId)}(?:&|$)`)
    );
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "preview");
    await expect(page.locator('[data-expense-active="true"]:visible')).toHaveCount(1);
  });

  test("Detail hierarchy and Expense press feedback remain stable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    const { id } = await openFirstExpenseWorkspaceRecord(page);
    const root = page.locator('[data-expenses-list-page="expenses"]');
    const panel = root.locator("[data-expense-detail-panel]");
    const amount = panel.locator("[data-expense-detail-amount]");
    const merchant = panel.locator("[data-expense-detail-merchant]");
    const project = panel.locator("[data-expense-detail-project]");
    const facts = panel.locator("[data-expense-detail-facts]");
    const evidence = panel.locator("[data-expense-receipt-evidence]");
    const clickableSelector = [
      "button:visible",
      "a[href]:visible",
      "summary:visible",
      '[role="tab"]:visible',
      '[role="button"]:visible',
      '[role="combobox"]:visible',
      "[data-expense-id]:visible",
    ].join(",");
    const expectStableClickableContract = async () => {
      const invalid = await root.locator(clickableSelector).evaluateAll((elements) =>
        elements
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              label:
                element.getAttribute("aria-label") ??
                element.textContent?.trim().slice(0, 80) ??
                element.tagName,
              transform: style.transform,
              transitionProperty: style.transitionProperty,
            };
          })
          .filter(
            ({ transform, transitionProperty }) =>
              transform !== "none" || /(^|,\s*)(all|transform)(,|$)/.test(transitionProperty)
          )
      );
      expect(invalid).toEqual([]);
    };

    for (const target of [amount, merchant, project, facts, evidence]) {
      await expect(target).toBeVisible();
    }
    const hierarchyY = await Promise.all(
      [amount, merchant, project, facts, evidence].map(async (target) =>
        target.evaluate((element) => element.getBoundingClientRect().top)
      )
    );
    expect(hierarchyY).toEqual([...hierarchyY].sort((a, b) => a - b));
    await expect(facts.getByText("Status", { exact: true })).toHaveCount(0);
    await expectStableClickableContract();

    const edit = panel.getByRole("button", { name: "Edit Expense", exact: true });
    await expect(edit).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const beforePress = await edit.boundingBox();
    await edit.hover();
    await page.mouse.down();
    await expect
      .poll(() => edit.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("0.9");
    const pressedStyle = await edit.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        transform: style.transform,
        transitionProperty: style.transitionProperty,
        opacity: style.opacity,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });
    await page.mouse.move(0, 0);
    await page.mouse.up();
    expect(pressedStyle.transform).toBe("none");
    expect(pressedStyle.transitionProperty).not.toContain("transform");
    expect(pressedStyle.opacity).toBe("0.9");
    expect(pressedStyle).toMatchObject({
      x: beforePress?.x,
      y: beforePress?.y,
      width: beforePress?.width,
      height: beforePress?.height,
    });

    await edit.click();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    await expect(panel.locator("[data-expense-inline-identity]")).toBeVisible();
    await expectStableClickableContract();
    const inlineAmountY = await panel
      .locator("[data-expense-inline-amount]")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(inlineAmountY - hierarchyY[0])).toBeLessThanOrEqual(1);
    const saveAndNext = panel.locator("[data-expense-save-and-next]");
    await expect(saveAndNext).toHaveAccessibleName("Save & Next");
    const widthBeforeSave = (await saveAndNext.boundingBox())?.width;

    let releaseFailure!: () => void;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.route(`**/api/expenses/${id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await failureGate;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "Owner QA stable loading state" }),
      });
    });

    await saveAndNext.click();
    await expect(saveAndNext).toBeDisabled();
    await expect(saveAndNext).toHaveAccessibleName("Saving…");
    const widthDuringSave = (await saveAndNext.boundingBox())?.width;
    expect(widthDuringSave).toBe(widthBeforeSave);
    releaseFailure();
    await expect(saveAndNext).toBeEnabled();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    await expect(page).toHaveURL(new RegExp(`ops_record=${encodeURIComponent(id)}`));
  });

  test("approved handoff visual contracts hold across themes and adaptive viewports", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    const { row } = await openFirstExpenseWorkspaceRecord(page);

    const workspace = page.locator("[data-expense-operations-workspace]");
    const ledger = workspace.locator("[data-expenses-ledger]");
    const panel = workspace.locator("[data-expense-detail-panel]");
    const amount = panel.locator("[data-expense-detail-amount]");

    const lightTokens = await workspace.evaluate((element) => {
      const style = getComputedStyle(element.closest(".expenses-ui") ?? element);
      return {
        canvas: style.getPropertyValue("--eo-canvas").trim(),
        surface: style.getPropertyValue("--eo-surface-primary").trim(),
        primary: style.getPropertyValue("--eo-text-primary").trim(),
      };
    });
    expect(lightTokens).toEqual({ canvas: "#f7f7f6", surface: "#ffffff", primary: "#161616" });

    await expect(ledger.locator("[data-expenses-list-toolbar]").locator("..")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );
    await expect(ledger.locator("[data-expenses-pagination]")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );

    const amountStyle = await amount.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        family: style.fontFamily,
        variant: style.fontVariantNumeric,
        feature: style.fontFeatureSettings,
        size: Number.parseFloat(style.fontSize),
      };
    });
    expect(amountStyle.family).not.toMatch(/mono/i);
    expect(`${amountStyle.variant} ${amountStyle.feature}`).toMatch(/tabular|tnum/);
    expect(amountStyle.feature).toContain('"zero" 0');
    expect(amountStyle.size).toBeGreaterThanOrEqual(34);
    const queueAmountColor = await row
      .locator("[data-expense-amount]")
      .evaluate((element) => getComputedStyle(element).color);
    expect(queueAmountColor).toBe("rgb(9, 9, 9)");

    const desktopLedgerBox = await ledger.boundingBox();
    const desktopPanelBox = await panel.boundingBox();
    expect(desktopLedgerBox).not.toBeNull();
    expect(desktopPanelBox).not.toBeNull();
    expect(desktopLedgerBox!.x + desktopLedgerBox!.width).toBeLessThanOrEqual(
      desktopPanelBox!.x + 1
    );

    if (process.env.E2E_CAPTURE_EXPENSE_POLISH === "1") {
      await page.screenshot({ path: "/tmp/expense-operations-light-desktop.png", fullPage: true });
    }

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(200);
    const darkTokens = await workspace.evaluate((element) => {
      const style = getComputedStyle(element.closest(".expenses-ui") ?? element);
      return {
        canvas: style.getPropertyValue("--eo-canvas").trim(),
        surface: style.getPropertyValue("--eo-surface-primary").trim(),
        primary: style.getPropertyValue("--eo-text-primary").trim(),
      };
    });
    expect(darkTokens).toEqual({ canvas: "#0a0a0a", surface: "#111111", primary: "#f4f4f2" });
    const darkSelectedRow = await row.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        text: style.getPropertyValue("--eo-text-primary").trim(),
      };
    });
    expect(darkSelectedRow).toEqual({ background: "rgb(44, 44, 44)", text: "#f4f4f2" });
    if (process.env.E2E_CAPTURE_EXPENSE_POLISH === "1") {
      await page.screenshot({ path: "/tmp/expense-operations-dark-desktop.png", fullPage: true });
    }

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ] as const) {
      await page.setViewportSize(viewport);
      await expect(ledger).toBeVisible();
      await expect(panel).toBeVisible();
      const landscapeLedgerBox = await ledger.boundingBox();
      const landscapePanelBox = await panel.boundingBox();
      const queueShare =
        landscapeLedgerBox!.width / (landscapeLedgerBox!.width + landscapePanelBox!.width);
      expect(queueShare).toBeGreaterThanOrEqual(0.6);
      expect(queueShare).toBeLessThanOrEqual(0.65);
    }

    for (const viewport of [
      { name: "iPad portrait", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize(viewport);
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.x, `${viewport.name}: detail begins at viewport edge`).toBeLessThanOrEqual(1);
      expect(box!.width, `${viewport.name}: full-width detail`).toBeGreaterThanOrEqual(
        viewport.width - 1
      );
      expect(box!.height, `${viewport.name}: full-height detail`).toBeGreaterThanOrEqual(
        viewport.height - 1
      );
      const actionButtons = panel.locator(".expense-detail-actions button");
      for (const button of await actionButtons.all()) {
        const buttonBox = await button.boundingBox();
        expect(
          buttonBox!.height,
          `${viewport.name}: critical action touch target`
        ).toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(() =>
        [document.documentElement, document.querySelector(".expenses-ui")]
          .filter((element): element is Element => Boolean(element))
          .some((element) => element.scrollWidth > element.clientWidth + 2)
      );
      expect(overflow, `${viewport.name}: no page-level horizontal overflow`).toBe(false);
    }

    if (process.env.E2E_CAPTURE_EXPENSE_POLISH === "1") {
      await page.screenshot({ path: "/tmp/expense-operations-dark-mobile.png", fullPage: true });
    }

    await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
    await expect(panel.getByTestId("edit-expense-vendor-input")).toBeFocused();
    const moreDetails = panel.locator("details.expense-more-details");
    await expect(moreDetails).not.toHaveAttribute("open", "");
    await expect(panel.getByRole("button", { name: "Save & Next", exact: true })).toBeVisible();
    if (process.env.E2E_CAPTURE_EXPENSE_POLISH === "1") {
      await page.screenshot({
        path: "/tmp/expense-operations-dark-mobile-edit.png",
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(ledger).toBeVisible();
    await expect(panel).toBeVisible();
    if (process.env.E2E_CAPTURE_EXPENSE_POLISH === "1") {
      await page.screenshot({
        path: "/tmp/expense-operations-dark-desktop-edit.png",
        fullPage: true,
      });
    }
    expect({ consoleErrors, failedResponses }).toEqual({ consoleErrors: [], failedResponses: [] });
  });

  test("Light Expense portals stay white and Dark portals retain tonal hierarchy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const filterButton = root
      .getByRole("button", { name: /Filters/ })
      .filter({ visible: true })
      .first();
    await filterButton.click();

    const lightFilter = page
      .locator("body > [data-radix-popper-content-wrapper] .expenses-ui-dialog:visible")
      .last();
    await expect(lightFilter).toBeVisible();
    await expect(lightFilter).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(lightFilter).toHaveCSS("color", "rgb(22, 22, 22)");

    await lightFilter.locator("[data-expenses-filter-project]").click();
    const lightSelect = page.locator('[role="listbox"].expenses-ui-dialog:visible').last();
    await expect(lightSelect).toBeVisible();
    await expect(lightSelect).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.keyboard.press("Escape");
    await filterButton.click();

    const moreActions = root
      .getByRole("button", { name: "Row actions", exact: true })
      .filter({ visible: true })
      .first();
    if ((await moreActions.count()) > 0) {
      await moreActions.click();
      const lightMenu = page.locator('[role="menu"].expenses-ui-dialog:visible').last();
      await expect(lightMenu).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await page.keyboard.press("Escape");
    }

    await root
      .getByRole("button", { name: "New Expense", exact: true })
      .filter({ visible: true })
      .click();
    const quickDialog = page.getByTestId("quick-expense-dialog");
    await expect(quickDialog).toBeVisible();
    await expect(quickDialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await quickDialog.getByRole("button", { name: "Close" }).click();

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await filterButton.click();
    const darkFilter = page
      .locator("body > [data-radix-popper-content-wrapper] .expenses-ui-dialog:visible")
      .last();
    await expect(darkFilter).toBeVisible();
    await expect(darkFilter).toHaveCSS("background-color", "rgb(37, 37, 37)");
    await expect(darkFilter).toHaveCSS("color", "rgb(244, 244, 242)");
  });

  test("Expense component surfaces share one premium interaction contract", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const filterButton = root
      .getByRole("button", { name: /Filters/ })
      .filter({ visible: true })
      .first();
    await filterButton.click();
    const filterSurface = page
      .locator("body > [data-radix-popper-content-wrapper] .expenses-ui-dialog:visible")
      .last();
    await expect(filterSurface).toBeVisible();
    await expect.soft(filterSurface).toHaveAttribute("data-expense-component-surface", "filters");
    await expect.soft(filterSurface).toHaveCSS("border-radius", "10px");
    await expect.soft(filterSurface.getByText("Expense filters", { exact: true })).toHaveCount(1);
    await expectStablePortalControls(filterSurface);

    const projectTrigger = filterSurface.locator("[data-expenses-filter-project]");
    await projectTrigger.click();
    const selectSurface = page.locator('[role="listbox"].expenses-ui-dialog:visible').last();
    await expect(selectSurface).toBeVisible();
    await expect.soft(selectSurface).toHaveAttribute("data-expense-component-surface", "select");
    await expect.soft(selectSurface).toHaveCSS("border-radius", "10px");
    await expectStablePortalControls(selectSurface);
    const projectOptions = selectSurface.getByRole("option");
    if ((await projectOptions.count()) > 1) {
      await projectOptions.nth(1).click();
      const clearFilters = filterSurface.getByRole("button", { name: "Clear", exact: true });
      await expect(clearFilters).toBeVisible();
      await clearFilters.click();
      await expect(clearFilters).toBeHidden();
    } else {
      await page.keyboard.press("Escape");
    }

    const dateTrigger = filterSurface.locator("[data-expenses-filter-date]");
    await expect.soft(dateTrigger).toHaveCount(1);
    if ((await dateTrigger.count()) > 0) {
      await dateTrigger.click();
      const dateSurface = page
        .locator('[data-expense-component-surface="date-filter"]:visible')
        .last();
      await expect(dateSurface).toBeVisible();
      await expect.soft(dateSurface).toHaveCSS("border-radius", "10px");
      await page.keyboard.press("Escape");
      await expect(dateSurface).toBeHidden();
    }
    if (await filterSurface.isVisible()) await page.keyboard.press("Escape");
    await expect(filterSurface).toBeHidden();

    await expect(
      root
        .locator('[data-expense-surface-header="desktop"]')
        .getByRole("button", { name: "More actions", exact: true })
    ).toHaveCount(0);

    await root
      .getByRole("button", { name: "New Expense", exact: true })
      .filter({ visible: true })
      .click();
    const quickDialog = page.getByTestId("quick-expense-dialog");
    await expect(quickDialog).toBeVisible();
    await expect
      .soft(quickDialog)
      .toHaveAttribute("data-expense-component-surface", "quick-expense");
    await expect.soft(quickDialog).toHaveCSS("border-radius", "14px");
    await expectStablePortalControls(quickDialog);
    const amountInput = quickDialog.locator('input[type="number"]').first();
    const amountType = await amountInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return { size: Number.parseFloat(style.fontSize), weight: Number(style.fontWeight) };
    });
    expect.soft(amountType.size).toBeGreaterThanOrEqual(18);
    expect.soft(amountType.weight).toBeGreaterThanOrEqual(600);

    await quickDialog.locator("#quick-expense-project-select").click();
    const quickProjectSurface = page
      .locator('[data-expense-component-surface="combobox"]:visible')
      .last();
    await expect(quickProjectSurface).toBeVisible();
    await expect.soft(quickProjectSurface).toHaveCSS("border-radius", "10px");
    await expect.soft(quickProjectSurface.getByRole("searchbox")).toBeFocused();
    await page.keyboard.press("Escape");

    await quickDialog.locator("#quick-expense-date").click();
    const quickDateSurface = page
      .locator('[data-expense-component-surface="date-picker"]:visible')
      .last();
    await expect(quickDateSurface).toBeVisible();
    await expect.soft(quickDateSurface).toHaveCSS("border-radius", "10px");
    await expect.soft(quickDateSurface).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.keyboard.press("Escape");

    const moreDetailsTrigger = quickDialog
      .getByRole("button", { name: /Payment, items, description, attachments/ })
      .first();
    await expect
      .soft(moreDetailsTrigger)
      .toHaveAttribute("data-quick-expense-more-trigger", "true");
    await expect.soft(moreDetailsTrigger).toHaveAccessibleName(/More Details/i);
    await moreDetailsTrigger.click();
    const quickMore = quickDialog.locator("[data-quick-expense-more-content]");
    await expect.soft(quickMore).toHaveCount(1);
    if ((await quickMore.count()) > 0) {
      await expect(quickMore).toBeVisible();
      const animationDuration = await quickMore.evaluate(
        (element) => getComputedStyle(element).animationDuration
      );
      expect.soft(animationDuration).toContain("0.18s");
    }
    await quickDialog.getByRole("button", { name: "Close" }).click();

    const issueIndicator = root.locator('[data-expense-issue-indicator="count"]:visible').first();
    await issueIndicator.hover();
    const issueSurface = page.getByTestId("expense-inbox-issue-popover");
    await expect(issueSurface).toBeVisible();
    await expect.soft(issueSurface).toHaveAttribute("data-expense-component-surface", "issue");
    await expect.soft(issueSurface).toHaveCSS("border-radius", "10px");
    await issueSurface.hover();
    await expect(issueSurface).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(issueSurface).toBeHidden();

    const pageSize = root.getByRole("combobox").filter({ visible: true }).last();
    await pageSize.click();
    const paginationSelect = page.locator('[role="listbox"].expenses-ui-dialog:visible').last();
    await expect(paginationSelect).toBeVisible();
    await expect.soft(paginationSelect).toHaveCSS("border-radius", "10px");
    await expectStablePortalControls(paginationSelect);
    await page.keyboard.press("Escape");

    expect({ consoleErrors, failedResponses }).toEqual({ consoleErrors: [], failedResponses: [] });
  });

  test("Expense sheets and micro-interactions remain touch-safe and reduced-motion aware", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    const root = page.locator('[data-expenses-list-page="expenses"]');
    await root
      .getByRole("button", { name: /Filters/ })
      .filter({ visible: true })
      .first()
      .click();
    const filterSheet = page.locator('[role="dialog"].expenses-ui-dialog:visible').last();
    await expect(filterSheet).toBeVisible();
    await expect.soft(filterSheet).toHaveAttribute("data-expense-component-surface", "filters");
    await expect.soft(filterSheet).toHaveCSS("border-top-left-radius", "14px");
    const reducedAnimation = await filterSheet.evaluate(
      (element) => getComputedStyle(element).animationDuration
    );
    const reducedSeconds = Number.parseFloat(reducedAnimation);
    expect.soft(reducedSeconds).toBeLessThanOrEqual(0.001);
    for (const control of await filterSheet.locator("button:visible").all()) {
      const box = await control.boundingBox();
      expect.soft(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await filterSheet.getByRole("button", { name: "Close" }).click();

    await root
      .getByRole("button", { name: /Filters/ })
      .filter({ visible: true })
      .first()
      .click();
    const reopenedFilterSheet = page.locator('[role="dialog"].expenses-ui-dialog:visible').last();
    await reopenedFilterSheet.getByRole("button", { name: "New Expense", exact: true }).click();
    const quickDialog = page.getByTestId("quick-expense-dialog");
    await expect(quickDialog).toBeVisible();
    await expect
      .soft(quickDialog)
      .toHaveAttribute("data-expense-component-surface", "quick-expense");
    const mobileAmountBox = await quickDialog.locator('input[type="number"]').first().boundingBox();
    expect.soft(mobileAmountBox?.height ?? 0).toBeGreaterThanOrEqual(48);
    const quickOverflow = await quickDialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 2
    );
    expect.soft(quickOverflow).toBe(false);
    await quickDialog.getByRole("button", { name: "Close" }).click();

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(pageOverflow).toBe(false);
  });

  test("receipt evidence stays contextual and restores from workspace URL", async ({ page }) => {
    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    test.skip(!adminUrl || !adminKey, "Local Supabase service role is required for receipt QA.");
    const admin = createClient(adminUrl!, adminKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const marker = `ZZ-E2E-RECEIPT-CONTEXT-${Date.now()}`;
    let createdExpenseId: string | null = null;

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);

    try {
      const root = page.locator('[data-expenses-list-page="expenses"]');
      await root.getByRole("button", { name: "New Expense", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: /New expense/i });
      await dialog.locator("[data-new-expense-amount]").fill("7.25");
      await dialog.locator("#quick-expense-vendor").fill(marker);
      await dialog.getByTestId("quick-expense-receipt-input").setInputFiles({
        name: `${marker}.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
          "utf8"
        ),
      });
      await expect(dialog.getByText("Uploaded", { exact: true }).first()).toBeVisible({
        timeout: 90_000,
      });
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 90_000 });

      const { data: created, error: createdError } = await admin
        .from("expenses")
        .select("id")
        .eq("vendor_name", marker)
        .maybeSingle();
      expect(createdError, createdError?.message).toBeNull();
      createdExpenseId = String(created?.id ?? "") || null;
      expect(createdExpenseId).toBeTruthy();

      await page.goto(`/financial/expenses?date_kind=all&ops_record=${createdExpenseId}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForExpensesReady(page);
      const panel = page.locator("[data-expense-detail-panel]");
      await expect(panel.getByText("Open receipt preview", { exact: true })).toBeVisible();
      await panel.locator("[data-expense-receipt-evidence]").click();
      const viewer = page.locator("[data-receipt-viewer]");
      await expect(viewer).toBeVisible();
      await expect(page).toHaveURL(/ops_preview=receipt/);
      await expect(panel).toBeAttached();

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForExpensesReady(page);
      await expect(page.locator("[data-receipt-viewer]")).toBeVisible();
      await expect(page.locator("[data-expense-detail-panel]")).toBeAttached();

      await page.keyboard.press("Escape");
      await expect(page.locator("[data-receipt-viewer]")).toBeHidden();
      await expect(page).not.toHaveURL(/ops_preview=receipt/);
      await expect(page).toHaveURL(
        new RegExp(`ops_record=${encodeURIComponent(createdExpenseId!)}`)
      );
    } finally {
      if (createdExpenseId) {
        const { data: attachments } = await admin
          .from("attachments")
          .select("file_path")
          .eq("entity_type", "expense")
          .eq("entity_id", createdExpenseId);
        const paths = (attachments ?? []).map((row) => String(row.file_path ?? "")).filter(Boolean);
        if (paths.length > 0) await admin.storage.from("expense-attachments").remove(paths);
        await admin
          .from("attachments")
          .delete()
          .eq("entity_type", "expense")
          .eq("entity_id", createdExpenseId);
        await admin.from("expense_lines").delete().eq("expense_id", createdExpenseId);
        await admin.from("expenses").delete().eq("id", createdExpenseId);
      }
    }
  });

  test("desktop hierarchy keeps KPIs and controls attached to the ledger", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesQuerySuccess(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    await expect(root).toBeVisible();

    const kpis = root.locator("[data-expenses-kpi-strip]");
    const ledger = root.locator("[data-expenses-ledger]");
    const toolbar = ledger.locator("[data-expenses-list-toolbar]");

    await expect(kpis).toBeVisible();
    await expect(kpis).toHaveAttribute("aria-label", "Expense summary");
    await expect(toolbar).toBeVisible();
    await expect(ledger.getByRole("searchbox", { name: "Search expenses" })).toBeVisible();
    await expect(ledger.getByRole("button", { name: /Filters/ })).toBeVisible();

    const kpiBox = await kpis.boundingBox();
    expect(kpiBox, "Expense KPI strip should have a stable desktop box").not.toBeNull();
    expect(kpiBox!.height, "Expense KPIs should remain a compact operational strip").toBeLessThan(
      80
    );
  });

  test("desktop ledger prioritizes merchant, context, exceptions, and amount", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesQuerySuccess(page);

    const ledger = page.locator('[data-expenses-list-page="expenses"] [data-expenses-ledger]');
    let row = ledger.locator("table tbody tr.exp-row:visible").first();
    if ((await row.count()) === 0) {
      await ledger.getByRole("button", { name: /Filters/ }).click();
      await page.getByRole("button", { name: "This month", exact: true }).click();
      await page.getByRole("button", { name: "All time", exact: true }).click();
      row = ledger.locator("table tbody tr.exp-row:visible").first();
      await row.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    }
    if ((await row.count()) === 0) {
      test.skip(true, "The local Expenses fixture has no visible archived row.");
    }

    await expect(ledger.locator("[data-expense-date-group]").first()).toBeVisible();
    await expect(row.locator("[data-expense-merchant]")).toBeVisible();
    await expect(row.locator("[data-expense-context]").first()).toBeVisible();
    await expect(row.locator("[data-expense-signals]").first()).toBeVisible();

    const amount = row.locator("[data-expense-amount]");
    await expect(amount).toBeVisible();
    const amountStyle = await amount.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontVariantNumeric: style.fontVariantNumeric,
        textAlign: style.textAlign,
      };
    });
    expect(amountStyle.textAlign).toBe("right");
    expect(amountStyle.fontVariantNumeric).toContain("tabular-nums");

    await expect(row.getByRole("button", { name: "Row actions" })).toBeAttached();
    const select = row.getByRole("button", { name: /^Select / });
    await select.click();
    await expect(row).toHaveAttribute("aria-selected", "true");
    const selectedStyle = await row.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, boxShadow: style.boxShadow };
    });
    expect(selectedStyle.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      selectedStyle.boxShadow,
      "Pointer-selected row keeps the restrained neutral anchor"
    ).toMatch(/inset/);
    expect(selectedStyle.boxShadow).not.toMatch(/rgb\(0, 0, 0\)|0px 0px 0px 1px/);
    await page.keyboard.press("Escape");
    await expect(row).toHaveAttribute("aria-selected", "false");

    await select.focus();
    const focusedShadow = await row.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(focusedShadow, "Keyboard focus should retain a refined row anchor").not.toBe("none");
    expect(focusedShadow, "Keyboard focus must not draw a full-row box").not.toMatch(
      /0px 0px 0px 1px/
    );
  });

  test("Light structural lines stay sparse and hierarchy-led", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await showAllExpenseDates(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const kpi = root.locator("[data-expenses-kpi-strip]");
    const surfaceHeader = root.locator('[data-expense-surface-header="desktop"]');
    const ledger = root.locator("[data-expenses-ledger]");
    const row = ledger.locator("table tbody tr.exp-row:visible").first();

    await expect(kpi).toBeVisible();
    await expect(surfaceHeader).toBeVisible();
    await expect(row).toBeVisible();

    const kpiStyle = await kpi.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderTopColor, borderWidth: style.borderTopWidth };
    });
    expect(kpiStyle.borderWidth).toBe("1px");
    expect(kpiStyle.borderColor).toBe("rgba(22, 22, 22, 0.075)");
    const kpiInternalLines = await kpi
      .locator("dl > div")
      .evaluateAll((items) => items.slice(1).map((item) => getComputedStyle(item).borderLeftWidth));
    expect(kpiInternalLines).toEqual(kpiInternalLines.map(() => "0px"));

    await expect(surfaceHeader).toHaveCSS("border-bottom-width", "0px");
    await expect(row).toHaveCSS("border-bottom-width", "0px");

    const hierarchy = await row.evaluate((element) => {
      const weight = (selector: string) =>
        Number.parseInt(getComputedStyle(element.querySelector(selector)!).fontWeight, 10);
      return {
        amount: weight("[data-expense-amount]"),
        merchant: weight("[data-expense-merchant] > p:first-child"),
        project: weight('[data-expense-context="project"] > span'),
        category: weight('[data-expense-context="category"] > span'),
        source: weight('[data-expense-context="source"] > span'),
      };
    });
    expect(hierarchy.amount).toBeGreaterThanOrEqual(hierarchy.merchant);
    expect(hierarchy.merchant).toBeGreaterThanOrEqual(hierarchy.project);
    expect(hierarchy.project).toBeGreaterThan(hierarchy.category);
    expect(hierarchy.project).toBeGreaterThan(hierarchy.source);

    await row.click();
    const panel = root.locator("[data-expense-detail-panel]");
    await expect(panel).toBeVisible();
    const activeRow = ledger.locator('[data-expense-active="true"]:visible');
    await expect(activeRow).toHaveCSS("border-radius", "0px");
    const compactProject = activeRow.locator('[data-expense-context-part="project"]');
    const compactCategory = activeRow.locator('[data-expense-context-part="category"]');
    await expect(compactProject).toBeVisible();
    await expect(compactCategory).toBeVisible();
    const compactWeights = await Promise.all(
      [compactProject, compactCategory].map((target) =>
        target.evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10))
      )
    );
    expect(compactWeights[0]).toBeGreaterThan(compactWeights[1]);
    const facts = panel.locator("[data-expense-detail-facts]");
    const moreDetails = panel.locator("details.expense-more-details").first();
    await expect(facts).toHaveCSS("border-top-width", "0px");
    await expect(facts).toHaveCSS("border-bottom-width", "0px");
    await expect(moreDetails).toHaveCSS("border-top-width", "0px");

    await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
    const sectionTitle = panel.locator("[data-expense-detail-section-title]").first();
    await expect(sectionTitle).toBeVisible();
    await expect(sectionTitle).toHaveCSS("border-bottom-width", "0px");
  });

  test("open Master Detail preserves a 60–65% compact desktop queue", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await openFirstExpenseWorkspaceRecord(page);

    const workspace = page.locator("[data-expense-operations-workspace]");
    const ledger = workspace.locator("[data-expenses-ledger]");
    const panel = workspace.locator("[data-expense-detail-panel]");

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ] as const) {
      await page.setViewportSize(viewport);
      await expect(ledger).toBeVisible();
      await expect(panel).toBeVisible();

      const ledgerBox = await ledger.boundingBox();
      const panelBox = await panel.boundingBox();
      expect(ledgerBox, `${viewport.width}px: queue box`).not.toBeNull();
      expect(panelBox, `${viewport.width}px: detail box`).not.toBeNull();
      const queueShare = ledgerBox!.width / (ledgerBox!.width + panelBox!.width);
      expect(queueShare, `${viewport.width}px: queue width share`).toBeGreaterThanOrEqual(0.6);
      expect(queueShare, `${viewport.width}px: queue width share`).toBeLessThanOrEqual(0.65);

      const row = ledger
        .locator("[data-expense-mobile-ledger] > li[data-expense-id]:visible")
        .first();
      await expect(row, `${viewport.width}px: compact queue row`).toBeVisible();
      await expect(
        row.locator("[data-expense-row-primary]"),
        "merchant and amount line"
      ).toBeVisible();
      await expect(row.locator("[data-expense-row-metadata]"), "metadata line").toBeVisible();
      await expect(
        row.locator("[data-expense-row-description]"),
        "description is Detail-only"
      ).toBeHidden();

      const merchant = row.locator("[data-expense-merchant] > p").first();
      const merchantStyle = await merchant.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          whiteSpace: style.whiteSpace,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          lines: Math.round(
            element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)
          ),
        };
      });
      expect(merchantStyle).toMatchObject({
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        lines: 1,
      });

      const amount = row.locator("[data-expense-amount]");
      const amountStyle = await amount.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          flexShrink: style.flexShrink,
          whiteSpace: style.whiteSpace,
          textAlign: style.textAlign,
          numeric: `${style.fontVariantNumeric} ${style.fontFeatureSettings}`,
        };
      });
      expect(amountStyle.flexShrink).toBe("0");
      expect(amountStyle.whiteSpace).toBe("nowrap");
      expect(amountStyle.textAlign).toBe("right");
      expect(amountStyle.numeric).toMatch(/tabular|tnum/);

      const quietRow = ledger
        .locator('[data-expense-mobile-ledger] > li:has([data-expense-signal-row="quiet"]):visible')
        .first();
      if ((await quietRow.count()) > 0) {
        await expect(quietRow.locator("[data-expense-signals]")).toBeHidden();
      }

      const attentionRow = ledger
        .locator(
          '[data-expense-mobile-ledger] > li:has([data-expense-signal-row="attention"]):visible'
        )
        .first();
      if ((await attentionRow.count()) > 0) {
        const signalLine = attentionRow.locator("[data-expense-signals]");
        await expect(signalLine, "attention signal is a visible optional third line").toBeVisible();
        const attentionBox = await attentionRow.boundingBox();
        const signalBox = await signalLine.boundingBox();
        expect(
          signalBox!.y + signalBox!.height,
          "signal line stays inside its row"
        ).toBeLessThanOrEqual(attentionBox!.y + attentionBox!.height + 1);
      }

      const footer = ledger.locator("[data-expenses-pagination]");
      const footerLayout = await footer.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          direction: style.flexDirection,
          wrap: style.flexWrap,
          height: element.getBoundingClientRect().height,
          overflow: element.scrollWidth > element.clientWidth + 2,
        };
      });
      expect(footerLayout.direction).toBe("row");
      expect(footerLayout.wrap).toBe("nowrap");
      expect(footerLayout.height).toBeLessThanOrEqual(52);
      expect(footerLayout.overflow).toBe(false);
    }
  });

  test("Expense Issue count provides hover and focus preview without click semantics", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await showAllExpenseDates(page);
    await page.keyboard.press("Escape");

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const indicator = root.locator('[data-expense-issue-indicator="count"]:visible').first();
    const issueRow = indicator.locator("xpath=ancestor::*[@data-expense-id][1]");
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText(/^⚠\s*\d+$/);
    const issueRowId = await issueRow.getAttribute("data-expense-id");
    expect(issueRowId).toBeTruthy();
    const stableIssueRow = root.locator(`[data-expense-id="${issueRowId}"]`).first();

    const semantics = await indicator.evaluate((element) => ({
      tag: element.tagName,
      tabIndex: (element as HTMLElement).tabIndex,
      role: element.getAttribute("role"),
      hasPopup: element.getAttribute("aria-haspopup"),
      expanded: element.getAttribute("aria-expanded"),
    }));
    expect(semantics).toEqual({
      tag: "SPAN",
      tabIndex: 0,
      role: null,
      hasPopup: null,
      expanded: null,
    });

    const activeBefore = await root.locator('[data-expense-active="true"]').count();
    const popover = page.getByTestId("expense-inbox-issue-popover");

    // Hover owns preview state; crossing the trigger/content gap must not dismiss it.
    await indicator.hover();
    await expect(popover).toBeVisible();
    await popover.hover();
    await page.waitForTimeout(180);
    await expect(popover).toBeVisible();

    // Leaving both regions observes the approved short grace period.
    await root.locator("[data-expenses-kpi-strip]").hover({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(80);
    await expect(popover).toBeVisible();
    await expect(popover).toBeHidden({ timeout: 600 });

    // Re-entry cancels a pending dismissal.
    await indicator.hover();
    await root.locator("[data-expenses-kpi-strip]").hover({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(80);
    await indicator.hover();
    await page.waitForTimeout(180);
    await expect(popover).toBeVisible();

    // Click has no trigger/toggle behavior and never activates the row.
    await indicator.click();
    await expect(popover).toBeVisible();
    expect(await root.locator('[data-expense-active="true"]').count()).toBe(activeBefore);
    await expect(issueRow).not.toHaveAttribute("data-expense-active", "true");

    const rowFocusStyle = await issueRow.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
    });
    expect(rowFocusStyle.outlineWidth).toBe("0px");
    expect(
      rowFocusStyle.boxShadow,
      "Issue preview focus must not create a full-row box"
    ).not.toMatch(/0px 0px 0px 1px/);

    // Escape and outside interaction close without leaving a sticky layer.
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(indicator).toBeFocused();
    await root.getByRole("searchbox", { name: "Search expenses" }).focus();
    await indicator.focus();
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(indicator).toBeFocused();
    await page.mouse.move(0, 0);
    await indicator.hover();
    await expect(popover).toBeVisible();
    await root.locator("[data-expenses-kpi-strip]").click({ position: { x: 8, y: 8 } });
    await expect(popover).toBeHidden();

    // A synthetic click without pointer entry proves there is no click-trigger path.
    await indicator.dispatchEvent("pointerdown", { pointerType: "mouse" });
    await indicator.dispatchEvent("click", { detail: 1 });
    await expect(popover).toBeHidden();
    expect(await root.locator('[data-expense-active="true"]').count()).toBe(activeBefore);

    // Dismiss remains canonical and clickable inside the hover-owned preview.
    await indicator.hover();
    await expect(popover).toBeVisible();
    const initialIssueCount = Number((await indicator.textContent())?.replace(/\D/g, ""));
    await popover
      .getByRole("button", { name: /^Dismiss / })
      .first()
      .click();
    if (initialIssueCount > 1) {
      await expect(indicator).toHaveText(new RegExp(`⚠\\s*${initialIssueCount - 1}`));
    } else {
      await expect(stableIssueRow.getByTestId("expense-inbox-issues")).toHaveAttribute(
        "data-expense-issue-state",
        "clear"
      );
      await expect(popover).toBeHidden();
    }

    // The preview surface maps intentionally in both approved themes.
    if (initialIssueCount > 1) {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await indicator.hover();
      await expect(popover).toBeVisible();
      await expect(popover).toHaveCSS("background-color", "rgb(37, 37, 37)");
      await page.keyboard.press("Escape");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financial/expenses?date_kind=all", { waitUntil: "domcontentloaded" });
    await waitForExpensesReady(page);
    const touchIndicator = page.locator('[data-expense-issue-indicator="count"]:visible').first();
    const mobileActiveBefore = await page.locator('[data-expense-active="true"]').count();
    await touchIndicator.dispatchEvent("pointerdown", { pointerType: "touch" });
    await touchIndicator.dispatchEvent("click", { detail: 1 });
    await expect(page.getByTestId("expense-inbox-issue-popover")).toHaveCount(0);
    expect(await page.locator('[data-expense-active="true"]').count()).toBe(mobileActiveBefore);
  });

  test("Issue attention stays indicator-level unless canonical context is high attention", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesReady(page);
    await showAllExpenseDates(page);
    await page.mouse.move(0, 0);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const ledger = root.locator("[data-expenses-ledger]");
    const issueRow = ledger.locator('[data-expense-has-exception="true"]:visible').first();
    await expect(issueRow).toBeVisible();

    const expectQuietIssueRow = async (theme: "light" | "dark") => {
      const issueStyle = await issueRow.evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--eo-depth-l2)";
        element.appendChild(probe);
        const neutralBackground = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          background: style.backgroundColor,
          borderLeftColor: style.borderLeftColor,
          borderLeftWidth: style.borderLeftWidth,
          boxShadow: style.boxShadow,
          neutralBackground,
        };
      });
      expect(issueStyle.background, `${theme}: issue row remains neutrally surfaced`).not.toBe(
        theme === "light" ? "rgb(255, 247, 237)" : "rgb(69, 44, 10)"
      );
      expect(issueStyle.borderLeftWidth, `${theme}: no issue border`).toBe("0px");
      expect(issueStyle.boxShadow, `${theme}: no amber row rail`).toBe("none");
      expect(issueStyle.borderLeftColor, `${theme}: no amber outline`).not.toBe(
        theme === "light" ? "rgb(161, 98, 7)" : "rgb(216, 163, 74)"
      );
    };

    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await expectQuietIssueRow("light");

    const issueIndicator = issueRow.locator('[data-expense-issue-indicator="count"]').first();
    await expect(issueIndicator).toHaveText(/^⚠\s*\d+$/);
    const indicatorStyle = await issueIndicator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        borderWidth: style.borderWidth,
      };
    });
    expect(indicatorStyle).toEqual({ background: "rgba(0, 0, 0, 0)", borderWidth: "0px" });

    const missingReceipt = issueRow
      .locator('[data-expense-issue-indicator="missing-receipt"]')
      .first();
    if ((await missingReceipt.count()) > 0) {
      await expect(missingReceipt).toContainText("Missing");
      await expect(missingReceipt.locator("svg")).toBeVisible();
    }

    const selectIssueRow = issueRow.getByRole("button", { name: /^Select / });
    await selectIssueRow.click();
    await expect(issueRow).toHaveAttribute("aria-selected", "true");
    const selectedStyle = await issueRow.evaluate((element) => {
      const style = getComputedStyle(element);
      const warningProbe = document.createElement("span");
      warningProbe.style.color = "var(--eo-warning)";
      element.appendChild(warningProbe);
      const warning = getComputedStyle(warningProbe).color;
      warningProbe.remove();
      return {
        background: style.backgroundColor,
        boxShadow: style.boxShadow,
        warning,
      };
    });
    expect(selectedStyle.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(selectedStyle.boxShadow).not.toContain(selectedStyle.warning);
    await page.keyboard.press("Escape");
    await expect(issueRow).toHaveAttribute("aria-selected", "false");
    await root.getByRole("searchbox", { name: "Search expenses" }).focus();
    await page.mouse.move(0, 0);

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(240);
    await expectQuietIssueRow("dark");
    await expect(issueIndicator).toHaveCSS("color", "rgb(216, 163, 74)");

    for (const viewport of [
      { name: "iPad landscape", width: 1024, height: 768 },
      { name: "iPad portrait", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/financial/expenses?date_kind=all", { waitUntil: "domcontentloaded" });
      await waitForExpensesReady(page);
      await page.mouse.move(0, 0);
      const responsiveIssueRow = page
        .locator('[data-expenses-list-page="expenses"] [data-expense-has-exception="true"]:visible')
        .first();
      await expect(responsiveIssueRow, `${viewport.name}: issue row`).toBeVisible();
      const responsiveStyle = await responsiveIssueRow.evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--eo-depth-l2)";
        element.appendChild(probe);
        const neutralBackground = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          background: style.backgroundColor,
          boxShadow: style.boxShadow,
          neutralBackground,
        };
      });
      expect(responsiveStyle.background, `${viewport.name}: neutral issue row`).toBe(
        responsiveStyle.neutralBackground
      );
      expect(
        responsiveStyle.boxShadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,?\s*/g, ""),
        `${viewport.name}: no visible issue row rail`
      ).toBe("");
      await expect(
        responsiveIssueRow.locator('[data-expense-issue-indicator="count"]'),
        `${viewport.name}: compact count`
      ).toHaveText(/^⚠\s*\d+$/);
    }
  });

  test("responsive ledger preserves scan hierarchy on phone and iPad", async ({ page }) => {
    const viewports = [
      { name: "phone", width: 390, height: 844 },
      { name: "iPad portrait", width: 768, height: 1024 },
      { name: "iPad landscape", width: 1024, height: 768 },
    ] as const;

    await page.setViewportSize(viewports[0]);
    await loginAsE2EOwner(page, "/financial/expenses");

    for (const [index, viewport] of viewports.entries()) {
      await page.setViewportSize(viewport);
      if (index > 0) {
        await page.goto("/financial/expenses", { waitUntil: "domcontentloaded" });
      }
      await waitForExpensesReady(page);

      const root = page.locator('[data-expenses-list-page="expenses"]');
      const search = root
        .getByRole("searchbox", { name: "Search expenses" })
        .filter({ visible: true })
        .first();
      const filters = root
        .getByRole("button", { name: /Filters/ })
        .filter({ visible: true })
        .first();
      await expect(search, `${viewport.name}: visible search`).toBeVisible();
      await expect(filters, `${viewport.name}: visible filters`).toBeVisible();

      if (viewport.width < 768) {
        const searchBox = await search.boundingBox();
        const filterBox = await filters.boundingBox();
        expect(searchBox?.height, `${viewport.name}: search touch target`).toBeGreaterThanOrEqual(
          44
        );
        expect(filterBox?.height, `${viewport.name}: filter touch target`).toBeGreaterThanOrEqual(
          44
        );
      }

      await showAllExpenseDates(page);
      const ledger = root.locator("[data-expenses-ledger]");
      const row = ledger
        .locator("table tbody tr.exp-row:visible, ul.exp-divide > li.exp-row:visible")
        .first();
      await row.waitFor({ state: "visible", timeout: 15_000 });

      if (viewport.width < 960) {
        await expect(ledger.locator("[data-expense-mobile-ledger]")).toBeVisible();
      }
      await expect(row.locator("[data-expense-merchant]")).toBeVisible();
      await expect(row.locator("[data-expense-context]").first()).toBeVisible();
      await expect(row.locator("[data-expense-signals]").first()).toBeVisible();
      await expect(row.locator("[data-expense-amount]")).toBeVisible();

      await expect(root.locator("[data-expenses-pagination]")).toBeVisible();
      await expect(root.getByRole("button", { name: "Previous page" })).toBeVisible();
      await expect(root.getByRole("button", { name: "Next page" })).toBeVisible();

      const overflow = await page.evaluate(() => {
        const tolerance = 2;
        const elements = [
          document.documentElement,
          document.querySelector("main"),
          document.querySelector(".expenses-ui"),
        ].filter((element): element is Element => Boolean(element));
        return elements.some((element) => element.scrollWidth > element.clientWidth + tolerance);
      });
      expect(overflow, `${viewport.name}: no page-level horizontal overflow`).toBe(false);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await filters.focus();
      const focusStyle = await filters.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.outlineStyle}|${style.boxShadow}`;
      });
      expect(focusStyle, `${viewport.name}: visible focus survives reduced motion`).not.toBe(
        "none|none"
      );
    }
  });

  test("initial load failure is an explicit recoverable error, never a zero-data state", async ({
    page,
  }) => {
    await page.route("**/rest/v1/expenses*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "forced expense list failure" }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsE2EOwner(page, "/financial/expenses");

    const root = page.locator('[data-expenses-list-page="expenses"]');
    await expect(root).toHaveAttribute("data-expenses-query-status", "error", {
      timeout: 45_000,
    });
    const errorState = root.locator("[data-expenses-error]");
    await expect(errorState).toBeVisible();
    await expect(errorState).toHaveAttribute("role", "alert");
    await expect(errorState).toContainText("Expenses couldn’t load");
    await expect(errorState.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(root.locator("[data-expenses-empty], [data-expenses-empty-mobile]")).toHaveCount(
      0
    );
  });

  test("loading state mirrors ledger density without presenting empty data", async ({ page }) => {
    await page.route("**/rest/v1/expenses*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsE2EOwner(page, "/financial/expenses");

    const root = page.locator('[data-expenses-list-page="expenses"]');
    await expect(root.locator("[data-expenses-loading-ledger]")).toBeVisible({ timeout: 10_000 });
    await expect(root.locator("[data-expenses-empty], [data-expenses-empty-mobile]")).toHaveCount(
      0
    );
  });

  test("no-match state stays operational and distinct from load failure", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await waitForExpensesQuerySuccess(page);

    const root = page.locator('[data-expenses-list-page="expenses"]');
    const search = root
      .getByRole("searchbox", { name: "Search expenses" })
      .filter({ visible: true });
    await search.fill(`no-expense-match-${Date.now()}`);

    const empty = root.locator("[data-expenses-empty]");
    await expect(empty).toBeVisible({ timeout: 15_000 });
    await expect(empty).toContainText("No transactions found");
    await expect(empty).toContainText("Adjust filters or search");
    await expect(root.locator("[data-expenses-error]")).toHaveCount(0);
  });
});
