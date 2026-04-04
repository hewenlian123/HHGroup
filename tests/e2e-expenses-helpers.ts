import { expect, type Page, type Locator } from "@playwright/test";

/** Expenses list is `<ul class="exp-divide">` with `<li class="... exp-row ...">`, not a table. */
export function expenseListRow(page: Page, text: string | RegExp): Locator {
  return page.locator("main ul.exp-divide > li").filter({ hasText: text }).first();
}

/** Vendor filter on `/financial/expenses` (scoped to `main` — not the global topbar search). */
export function expensesVendorSearch(page: Page): Locator {
  return page.locator("main").getByRole("textbox", { name: "Search…" });
}

/**
 * `PaymentAccountSelect` in Quick expense / edit flows: native `<select>` that includes
 * “+ Add new account” (unlike Project / Category selects).
 */
export function dialogPaymentAccountSelect(dialog: Locator, page: Page): Locator {
  return dialog
    .locator("select")
    .filter({ has: page.getByRole("option", { name: "+ Add new account" }) })
    .first();
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
  await expect(sel).toBeEnabled({ timeout: 60_000 });
  for (const label of preferredFirst) {
    const o = sel.getByRole("option", { name: label, exact: true });
    if ((await o.count()) > 0) {
      await sel.selectOption({ label });
      return label;
    }
  }
  const opts = sel.locator("option");
  const n = await opts.count();
  for (let i = 0; i < n; i++) {
    const t = ((await opts.nth(i).textContent()) ?? "").trim();
    if (t && t !== "—" && !t.startsWith("+")) {
      await sel.selectOption({ label: t });
      return t;
    }
  }
  const name = `E2E-Pay-${Date.now()}`;
  await sel.selectOption({ label: "+ Add new account" });
  const sub = page.getByRole("dialog", { name: /New payment account/i });
  await expect(sub).toBeVisible({ timeout: 15_000 });
  await sub.getByPlaceholder("Name (e.g. Amex)").fill(name);
  await sub.getByPlaceholder("Name (e.g. Amex)").press("Enter");
  await expect(sub).toBeHidden({ timeout: 30_000 });
  return name;
}

/** After queue upload, OCR may keep rows in `processing` — wait for an editable vendor cell. */
export async function waitForReceiptQueueEditableVendor(
  page: Page,
  timeoutMs = 120_000
): Promise<Locator> {
  const vendor = page.locator('tbody tr input[placeholder="Vendor"]:not([disabled])').first();
  await vendor.waitFor({ state: "visible", timeout: timeoutMs });
  return vendor;
}
