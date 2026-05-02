import { expect, type Page, type Locator } from "@playwright/test";

/** Desktop: `main table tbody tr.exp-row`; mobile: `main ul.exp-divide > li.exp-row`. */
export function expenseListRow(page: Page, text: string | RegExp): Locator {
  return page
    .locator("main table tbody tr.exp-row, main ul.exp-divide > li.exp-row")
    .filter({ hasText: text })
    .first();
}

/** Vendor filter on `/financial/expenses` (scoped to `main` — not the global topbar search). */
export function expensesVendorSearch(page: Page): Locator {
  return page.locator("main").getByRole("textbox", { name: "Search…" });
}

/** Card row on `/financial/receipt-queue` (`data-testid="receipt-queue-row"`). */
export function receiptQueueRowByFileName(page: Page, fileName: string): Locator {
  return page.getByTestId("receipt-queue-row").filter({ hasText: fileName }).first();
}

/**
 * Receipt queue row: payment account is {@link PaymentAccountSelect} (Radix trigger), not a native
 * `<select>`. `data-queue-field="payment"` is set on the trigger in `receipt-queue-row-card`.
 */
export function receiptQueuePaymentAccountTrigger(queueRow: Locator): Locator {
  return queueRow.locator('[data-queue-field="payment"]').first();
}

/**
 * Payment account control: Quick expense / edit / inbox use Radix
 * `<button id="quick-expense-payment-select|edit-expense-payment-select" role="combobox">`.
 */
export function dialogPaymentAccountSelect(dialog: Locator, _page: Page): Locator {
  return dialog
    .locator("#quick-expense-payment-select")
    .or(dialog.locator("#edit-expense-payment-select"));
}

async function radixPaymentListbox(page: Page): Promise<Locator> {
  const lb = page.locator('[role="listbox"]').last();
  await expect(lb).toBeVisible({ timeout: 15_000 });
  return lb;
}

/** Opens “+ Add new account” from either a native `<select>` or a Radix payment trigger. */
export async function paymentAccountSelectChooseAddNew(
  page: Page,
  trigger: Locator
): Promise<void> {
  const control = trigger.first();
  await expect(control).toBeEnabled({ timeout: 60_000 });
  const tag = await control.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    await control.selectOption({ label: "+ Add new account" });
    return;
  }
  await control.click();
  const listbox = await radixPaymentListbox(page);
  await listbox.getByRole("option", { name: "+ Add new account", exact: true }).click();
}

/**
 * `payment_accounts` may be empty in some DBs (missing migration/cache). Prefer seed labels;
 * otherwise create a disposable account via “+ Add new account”.
 */
export async function pickOrCreatePaymentInSelect(
  page: Page,
  sel: Locator,
  preferredFirst: readonly string[] = ["Cash", "Amex", "Chase"]
): Promise<string> {
  const control = sel.first();
  await expect(control).toBeEnabled({ timeout: 60_000 });
  const tag = await control.evaluate((el) => el.tagName.toLowerCase());

  if (tag === "select") {
    for (const label of preferredFirst) {
      const o = control.getByRole("option", { name: label, exact: true });
      if ((await o.count()) > 0) {
        const value = await o.first().getAttribute("value");
        if (value && value.trim() !== "") {
          await control.selectOption({ value });
        } else {
          await control.selectOption({ label });
        }
        return label;
      }
    }
    const opts = control.locator("option");
    const n = await opts.count();
    for (let i = 0; i < n; i++) {
      const t = ((await opts.nth(i).textContent()) ?? "").trim();
      if (t && t !== "—" && !t.startsWith("+")) {
        await control.selectOption({ label: t });
        return t;
      }
    }
    const name = `E2E-Pay-${Date.now()}`;
    await control.selectOption({ label: "+ Add new account" });
    const sub = page.getByRole("dialog", { name: /New payment account/i });
    await expect(sub).toBeVisible({ timeout: 15_000 });
    await sub.getByPlaceholder("Name (e.g. Amex)").fill(name);
    await sub.getByPlaceholder("Name (e.g. Amex)").press("Enter");
    await expect(sub).toBeHidden({ timeout: 30_000 });
    return name;
  }

  for (const label of preferredFirst) {
    await control.click();
    const listbox = await radixPaymentListbox(page).catch(() => null);
    if (listbox) {
      const opt = listbox.getByRole("option", { name: label, exact: true });
      if ((await opt.count()) > 0) {
        await opt.click();
        return label;
      }
    }
    await page.keyboard.press("Escape");
  }

  await control.click();
  let listbox = await radixPaymentListbox(page);
  const opts = listbox.getByRole("option");
  const n = await opts.count();
  for (let i = 0; i < n; i++) {
    const o = opts.nth(i);
    const t = ((await o.textContent()) ?? "").trim();
    if (t && t !== "—" && !t.startsWith("+")) {
      await o.click();
      return t;
    }
  }

  const name = `E2E-Pay-${Date.now()}`;
  await control.click();
  listbox = await radixPaymentListbox(page);
  await listbox.getByRole("option", { name: "+ Add new account", exact: true }).click();
  const sub = page.getByRole("dialog", { name: /New payment account/i });
  await expect(sub).toBeVisible({ timeout: 15_000 });
  await sub.getByPlaceholder("Name (e.g. Amex)").fill(name);
  await sub.getByPlaceholder("Name (e.g. Amex)").press("Enter");
  await expect(sub).toBeHidden({ timeout: 30_000 });
  return name;
}

/**
 * Receipt queue cells use controlled React `Input`s. `locator.fill()` / keystrokes can miss
 * `onChange` when the tree re-renders (OCR / soft refresh). Set the native value + dispatch
 * `input` so React picks it up (same pattern as React testing-library / Playwright issues).
 */
export async function fillControlledTextInput(input: Locator, value: string): Promise<void> {
  await input.waitFor({ state: "visible" });
  await input.evaluate((el, v) => {
    const inputEl = el as HTMLInputElement;
    const proto = window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(inputEl, v);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** @deprecated Use {@link fillControlledTextInput} — kept name for receipt-queue specs. */
export async function fillReceiptQueueVendorInput(input: Locator, value: string): Promise<void> {
  await fillControlledTextInput(input, value);
}

function receiptQueueAmountsMatch(actual: string, expected: string): boolean {
  const x = parseFloat(actual.replace(/,/g, "").trim());
  const y = parseFloat(expected.replace(/,/g, "").trim());
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.02;
}

/**
 * Fill vendor, amount, and project. Retries when a server refresh clears fields or Confirm stays
 * disabled briefly after values look correct.
 */
export async function prepareReceiptQueueRowForConfirm(
  page: Page,
  queueRow: Locator,
  opts: { vendor: string; amount: string; projectId: string },
  more?: { assertConfirmEnabled?: boolean }
): Promise<void> {
  const projectSelect = queueRow
    .locator("select")
    .filter({ has: page.locator(`option[value="${opts.projectId}"]`) });

  const amountNorm = opts.amount.replace(/,/g, "").trim();
  let lastVendor = "";
  let lastAmount = "";

  for (let attempt = 0; attempt < 5; attempt++) {
    const vendorIn = queueRow.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillReceiptQueueVendorInput(vendorIn, opts.vendor);
    await fillControlledTextInput(queueRow.getByPlaceholder("Amount"), opts.amount);
    await projectSelect.selectOption({ value: opts.projectId });

    lastVendor = (
      await queueRow.locator('input[placeholder="Vendor"]:not([disabled])').first().inputValue()
    ).trim();
    lastAmount = (await queueRow.getByPlaceholder("Amount").inputValue()).replace(/,/g, "").trim();
    if (!(lastVendor === opts.vendor && receiptQueueAmountsMatch(lastAmount, amountNorm))) continue;

    if (!more?.assertConfirmEnabled) return;

    try {
      await expect(queueRow.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled({
        timeout: 30_000,
      });
      return;
    } catch {
      /* Re-fill on next attempt — parallel tests / refresh can disable Confirm momentarily. */
    }
  }

  throw new Error(
    `Receipt queue row did not become confirmable (vendor="${lastVendor}" expected "${opts.vendor}", amount="${lastAmount}" expected "${amountNorm}")`
  );
}

/** After queue upload, OCR may keep rows in `processing` — wait for an editable vendor cell. */
export async function waitForReceiptQueueEditableVendor(
  page: Page,
  timeoutMs = 120_000
): Promise<Locator> {
  const vendor = page
    .getByTestId("receipt-queue-row")
    .locator('input[placeholder="Vendor"]:not([disabled])')
    .first();
  await vendor.waitFor({ state: "visible", timeout: timeoutMs });
  return vendor;
}

/** Queue confirm uses hotToast "Confirmed"; list elsewhere may say "Expense created". */
export function receiptQueueExpenseSuccessSeen(bodyText: string): boolean {
  return /expense created|confirmed/i.test(bodyText);
}

/** Global attachment preview portal (dialog title is the file name, not "Receipt preview"). */
export function attachmentPreviewModal(page: Page): Locator {
  return page.locator("[data-attachment-preview-modal]");
}
