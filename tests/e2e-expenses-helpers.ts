import { expect, type Page, type Locator, type Response } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Inbox (`/financial/inbox`) shows the **incomplete** pool only (`needs_review` / `pending` / `draft` / empty).
 * Quick expense with project + category defaults to `reviewed` (see `createQuickExpense`) — those rows
 * appear on **Expenses** (`/financial/expenses` archive pool), not Inbox.
 */
export const E2E_FINANCIAL_INBOX_URL = "/financial/inbox";

/** Archive list: `reviewed`/`done` rows with project + category (excludes inbox-only workflow rows). */
export const E2E_FINANCIAL_EXPENSES_ARCHIVE_URL = "/financial/expenses";

/** Desktop: `main table tbody tr.exp-row`; mobile: `main ul.exp-divide > li.exp-row`. */
export function expenseListRow(page: Page, text: string | RegExp): Locator {
  return page
    .locator("main table tbody tr.exp-row, main ul.exp-divide > li.exp-row")
    .filter({ hasText: text })
    .first();
}

export function expenseListRowById(page: Page, expenseId: string): Locator {
  return page
    .locator(
      `main table tbody tr.exp-row[data-expense-id="${expenseId}"], main ul.exp-divide > li.exp-row[data-expense-id="${expenseId}"]`
    )
    .first();
}

/**
 * Vendor filter on inbox/archive (`ExpensesPageClient`). Two inputs share placeholder `Search…`
 * (mobile `md:hidden` + desktop `hidden md:flex`); must target the **visible** one or fills no-op on Desktop.
 */
export function expensesVendorSearch(page: Page): Locator {
  return page.locator(".expenses-ui").getByPlaceholder("Search…").filter({ visible: true }).first();
}

/**
 * Inbox / Expenses toolbar renders two "Quick" buttons (mobile `md:hidden` + desktop `hidden md:block`).
 * Only one is visible; `nth(0)` / `nth(1)` alone is wrong when the count is 1 or order differs.
 */
export async function waitForVisibleQuickExpenseButton(
  page: Page,
  timeoutMs = 150_000
): Promise<void> {
  const buttons = page.getByRole("button", { name: /^Quick$/ });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      if (await b.isVisible().catch(() => false)) {
        await b.waitFor({ state: "visible", timeout: 10_000 });
        return;
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Visible "Quick" button not found');
}

export async function clickVisibleQuickExpenseButton(page: Page): Promise<void> {
  const buttons = page.getByRole("button", { name: /^Quick$/ });
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      return;
    }
  }
  throw new Error('Visible "Quick" button not found');
}

/** Radix project Select updates async; wait until the trigger shows the chosen label before Save. */
export async function waitForQuickExpenseProjectLabel(
  dialog: Locator,
  projectLabel: string,
  timeoutMs = 20_000
): Promise<void> {
  await expect(dialog.locator("#quick-expense-project-select")).toContainText(projectLabel, {
    timeout: timeoutMs,
  });
}

/**
 * Call **before** `page.reload()` or `goto(/financial/expenses)`, then `await` the returned promise
 * after navigation so we don't miss the expenses list GET (fixes empty client state before vendor search).
 *
 * **Note:** The first `GET …/expenses` completes before `fetchExpenses` finishes hydrating lines;
 * prefer {@link waitForExpensesQuerySuccess} after navigation so React Query has settled.
 */
export function listenForExpensesTableFetch(
  page: Page,
  timeoutMs = 90_000
): ReturnType<Page["waitForResponse"]> {
  return page.waitForResponse(
    (r) =>
      /\/rest\/v1\/expenses(?:\?|$)/i.test(r.url()) &&
      r.request().method() === "GET" &&
      r.status() === 200,
    { timeout: timeoutMs }
  );
}

/** True when the DELETE URL references this row id (substring — UUID is unique in typical PostgREST URLs). */
function receiptQueueDeleteUrlMatchesRowId(url: string, rowId: string): boolean {
  const id = rowId.trim().toLowerCase();
  if (!id) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* use raw */
  }
  return decoded.toLowerCase().includes(id) || url.toLowerCase().includes(id);
}

/**
 * Receipt-queue Confirm removes the row in the UI before `finalizeConfirmMutation` finishes; wait for the
 * terminal Supabase **DELETE** on `receipt_queue` for **this row id** (runs after expense + attachments).
 * Register **before** clicking Confirm; read the row id from `data-receipt-queue-row` on that row
 * (e.g. {@link receiptQueueRowIdFromLocator}) so the DELETE URL matches only that queue row.
 */
export function waitForReceiptQueueConfirmDeleteResponse(
  page: Page,
  receiptQueueRowId: string,
  timeoutMs = 180_000
): Promise<Response> {
  const rid = receiptQueueRowId.trim();
  if (!rid) {
    throw new Error("waitForReceiptQueueConfirmDeleteResponse: receiptQueueRowId is required");
  }
  return page.waitForResponse(
    (r) => {
      const req = r.request();
      const url = req.url();
      return (
        req.method() === "DELETE" &&
        /\breceipt_queue\b/i.test(url) &&
        /\/rest\/v\d+\//i.test(url) &&
        r.status() >= 200 &&
        r.status() < 300 &&
        receiptQueueDeleteUrlMatchesRowId(url, rid)
      );
    },
    { timeout: timeoutMs }
  );
}

function isSuccessfulReceiptQueuePatch(resp: Response): boolean {
  const req = resp.request();
  return (
    resp.url().includes("receipt_queue") &&
    req.method() === "PATCH" &&
    resp.status() >= 200 &&
    resp.status() < 300
  );
}

/**
 * Attach **before** the action that persists rows (e.g. Shift+Enter). Resolves after `count`
 * successful Supabase `receipt_queue` PATCH responses — multi-row debounced saves often emit one PATCH each.
 */
export function waitForReceiptQueueSuccessfulPatches(
  page: Page,
  count: number,
  timeoutMs = 120_000
): Promise<void> {
  if (count <= 0) return Promise.resolve();
  let seen = 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("response", onResp);
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for ${count} receipt_queue PATCH responses (saw ${seen}).`
        )
      );
    }, timeoutMs);
    const onResp = (resp: Response) => {
      if (!isSuccessfulReceiptQueuePatch(resp)) return;
      seen += 1;
      if (seen >= count) {
        clearTimeout(timer);
        page.off("response", onResp);
        resolve();
      }
    };
    page.on("response", onResp);
  });
}

/** No successful `receipt_queue` PATCH for `quietMs` (timer resets on each PATCH). */
export async function waitForReceiptQueuePatchIdle(
  page: Page,
  quietMs: number,
  timeoutMs: number
): Promise<void> {
  let lastPatchAt = Date.now();
  const onResp = (resp: Response) => {
    if (!isSuccessfulReceiptQueuePatch(resp)) return;
    lastPatchAt = Date.now();
  };
  page.on("response", onResp);
  try {
    await expect
      .poll(async () => Date.now() - lastPatchAt >= quietMs, {
        timeout: timeoutMs,
        intervals: [80, 150, 300, 500],
      })
      .toBe(true);
  } finally {
    page.off("response", onResp);
  }
}

/**
 * Call after {@link waitForReceiptQueuePatchIdle}. Only counts PATCH responses whose **request** was issued
 * after `press()` settles (Shift+Enter saves run asynchronously after keydown).
 */
export async function waitForReceiptQueuePatchesAfterPressQuiet(
  page: Page,
  press: () => Promise<void>,
  quietMs: number,
  timeoutMs: number
): Promise<void> {
  let seen = 0;
  let lastPatchAt = 0;
  let gated = false;
  let gateAt = 0;
  /** Playwright `request` vs `response.request()` may not share identity — key by URL/method/body. */
  const patchReqStartedAt = new Map<string, number>();
  const patchRequestKey = (url: string, method: string, postData: string | null | undefined) =>
    `${url}\0${method}\0${postData ?? ""}`;
  const onRequest = (req: {
    url: () => string;
    method: () => string;
    postData: () => string | null;
  }) => {
    if (!req.url().includes("receipt_queue") || req.method() !== "PATCH") return;
    patchReqStartedAt.set(
      patchRequestKey(req.url(), req.method(), req.postData()),
      performance.now()
    );
  };
  const onResp = (resp: Response) => {
    if (!gated || !isSuccessfulReceiptQueuePatch(resp)) return;
    const req = resp.request();
    const started = patchReqStartedAt.get(patchRequestKey(req.url(), req.method(), req.postData()));
    if (started === undefined || started < gateAt) return;
    seen += 1;
    lastPatchAt = Date.now();
  };
  page.on("request", onRequest);
  page.on("response", onResp);
  try {
    await press();
    gateAt = performance.now();
    gated = true;
    await expect
      .poll(
        async () => {
          if (seen < 1) return false;
          return Date.now() - lastPatchAt >= quietMs;
        },
        { timeout: timeoutMs, intervals: [80, 150, 300, 500, 800] }
      )
      .toBe(true);
  } finally {
    page.off("request", onRequest);
    page.off("response", onResp);
  }
}

/** Waits until `ExpensesPageClient` marks the React Query expenses list as success (not merely HTTP GET). */
export async function waitForExpensesQuerySuccess(page: Page, timeoutMs = 120_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const err = await page.locator(".expenses-ui[data-expenses-query-status='error']").count();
        if (err > 0)
          throw new Error("Expenses list query failed (data-expenses-query-status=error).");
        const ok = await page.locator(".expenses-ui[data-expenses-query-status='success']").count();
        return ok > 0;
      },
      { timeout: timeoutMs, intervals: [100] }
    )
    .toBe(true);
}

export type E2ESeededExpenseDbSnapshot = {
  expenseId: string;
  vendor_name: string | null;
  vendor: string | null;
  status: string | null;
  source_type: string | null;
  project_id: string | null;
  payment_method: string | null;
  expense_date: string | null;
  line_category: string | null;
  line_project_id: string | null;
};

/**
 * Fails fast with a clear log when a Quick expense (or any) row is missing before UI waits.
 * Retries briefly because the modal can close before PostgREST visibility.
 */
export async function assertE2EExpenseVisibleInDatabase(
  vendorMark: string,
  opts?: { timeoutMs?: number }
): Promise<E2ESeededExpenseDbSnapshot> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "[E2E] assertE2EExpenseVisibleInDatabase: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon) for DB checks."
    );
  }
  const deadline = Date.now() + timeoutMs;
  let lastMessage = "";
  while (Date.now() < deadline) {
    const sb = createClient(url, key);
    const { data: rows, error } = await sb
      .from("expenses")
      .select(
        "id, vendor_name, vendor, status, source_type, project_id, payment_method, expense_date, created_at"
      )
      .or(`vendor_name.eq.${vendorMark},vendor.eq.${vendorMark}`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) {
      lastMessage = error.message;
    } else if (rows && rows.length > 0) {
      const exp = rows[0] as {
        id: string;
        vendor_name: string | null;
        vendor: string | null;
        status: string | null;
        source_type: string | null;
        project_id: string | null;
        payment_method: string | null;
        expense_date: string | null;
      };
      const { data: line } = await sb
        .from("expense_lines")
        .select("category, project_id")
        .eq("expense_id", exp.id)
        .limit(1)
        .maybeSingle();
      const snap: E2ESeededExpenseDbSnapshot = {
        expenseId: exp.id,
        vendor_name: exp.vendor_name,
        vendor: exp.vendor,
        status: exp.status,
        source_type: exp.source_type,
        project_id: exp.project_id,
        payment_method: exp.payment_method,
        expense_date: exp.expense_date,
        line_category: (line?.category as string | null) ?? null,
        line_project_id: (line?.project_id as string | null) ?? null,
      };
      // eslint-disable-next-line no-console
      console.log("[E2E] expense row in DB (vendor mark)", vendorMark, snap);
      if (rows.length > 1) {
        // eslint-disable-next-line no-console
        console.warn(`[E2E] Multiple (${rows.length}) expenses matched vendor mark; using newest.`);
      }
      return snap;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(
    `[E2E] No expense in DB for vendor mark "${vendorMark}" after ${timeoutMs}ms. Last error: ${lastMessage || "none"}`
  );
}

/** Navigate to archive list and wait for query + shell — use after Quick expense (reviewed → archive pool). */
export async function gotoArchivedExpenseListReady(page: Page, timeoutMs = 120_000): Promise<void> {
  await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForExpensesQuerySuccess(page, timeoutMs);
  await waitForVisibleQuickExpenseButton(page, timeoutMs);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
}

/**
 * After receipt-queue confirm, DB status may land as archived (`reviewed`) or still in workflow — try
 * archive first, then inbox, until the vendor row is visible (optionally matching `projectSnippet`).
 */
export async function expectExpenseVendorRowArchiveOrInbox(
  page: Page,
  vendorMark: string,
  opts?: { projectSnippet?: string; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const snippet = opts?.projectSnippet;
  await expect
    .poll(
      async () => {
        for (const url of [E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, E2E_FINANCIAL_INBOX_URL]) {
          try {
            const expensesWait = page
              .waitForResponse(
                (r) =>
                  /\/rest\/v1\/expenses(?:\?|$)/i.test(r.url()) &&
                  r.request().method() === "GET" &&
                  r.status() === 200,
                { timeout: 45_000 }
              )
              .catch(() => {
                /* Cache hit / request finished before listener — row polls below still apply. */
              });
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
            await expensesWait;
            const err = await page
              .locator(".expenses-ui[data-expenses-query-status='error']")
              .count();
            if (err > 0)
              throw new Error("Expenses list query failed (data-expenses-query-status=error).");
            await page.locator("main").first().waitFor({ state: "visible", timeout: 45_000 });
            // Attached `success` alone can precede hydrated rows; wait until RQ reports success.
            await waitForExpensesQuerySuccess(page, 90_000);

            const rowByVendor = () => expenseListRow(page, vendorMark);
            let rowVisible = false;
            try {
              await expect
                .poll(
                  async () =>
                    rowByVendor()
                      .isVisible()
                      .catch(() => false),
                  {
                    timeout: 55_000,
                    intervals: [300, 600, 1200, 2000],
                  }
                )
                .toBe(true);
              rowVisible = true;
            } catch {
              /* Off-page, stale keepPreviousData snapshot, or refetch not landed yet — narrow via search. */
            }

            if (!rowVisible) {
              await expensesVendorSearch(page).fill(vendorMark);
              // Expenses list applies search on a ~280ms debounce.
              try {
                await expect
                  .poll(
                    async () =>
                      rowByVendor()
                        .isVisible()
                        .catch(() => false),
                    {
                      timeout: 55_000,
                      intervals: [100, 200, 350, 500, 800, 1200],
                    }
                  )
                  .toBe(true);
              } catch {
                continue;
              }
            }

            const row = expenseListRow(page, vendorMark);
            if (!(await row.isVisible().catch(() => false))) continue;
            if (snippet && !(await row.innerText()).includes(snippet)) continue;
            return true;
          } catch {
            continue;
          }
        }
        return false;
      },
      { timeout: timeoutMs, intervals: [900, 1800, 2600] }
    )
    .toBe(true);
}

/**
 * Card row on `/financial/receipt-queue` (`data-testid="receipt-queue-row"`).
 *
 * Receipt upload tests should assert against the **stored/compressed** file name (e.g. `.jpg` after
 * `compressImageFileForReceiptUpload`), not only the original `setInputFiles` name — see
 * `docs/receipt-upload-ocr-flow.md`.
 */
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

export async function receiptQueueRowIdFromLocator(queueRow: Locator): Promise<string> {
  return ((await queueRow.getAttribute("data-receipt-queue-row")) ?? "").trim();
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
  const projectSelect = queueRow.locator('[data-queue-field="project"]').first();

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

/**
 * Re-runs {@link prepareReceiptQueueRowForConfirm} until vendor/amount/project match in the DOM.
 * Needed because `softRefreshQueueAndExpenses` can replace local row state from the server without
 * sessionStorage draft merge, clearing fields after an otherwise successful prepare.
 */
export async function pollReceiptQueueRowUntilConfirmableDom(
  page: Page,
  queueRow: Locator,
  opts: { vendor: string; amount: string; projectId: string },
  more?: { timeoutMs?: number; afterPrepare?: () => Promise<void> }
): Promise<void> {
  const amountNorm = opts.amount.replace(/,/g, "").trim();
  const timeoutMs = more?.timeoutMs ?? 120_000;
  const afterPrepare = more?.afterPrepare;
  await expect
    .poll(
      async () => {
        await prepareReceiptQueueRowForConfirm(page, queueRow, opts, {
          assertConfirmEnabled: true,
        });
        if (afterPrepare) await afterPrepare();
        await waitForReceiptQueuePatchIdle(page, 450, 25_000).catch(() => {
          /* OCR / notify churn can prevent idle; DOM check below still gates Confirm. */
        });
        const vendor = (
          await queueRow.locator('input[placeholder="Vendor"]:not([disabled])').first().inputValue()
        ).trim();
        const amountRaw = (await queueRow.getByPlaceholder("Amount").inputValue())
          .replace(/,/g, "")
          .trim();
        const proj = await queueRow
          .locator('[data-queue-field="project"]')
          .first()
          .evaluate((el) => (el as HTMLSelectElement).value);
        return (
          vendor === opts.vendor &&
          receiptQueueAmountsMatch(amountRaw, amountNorm) &&
          proj === opts.projectId
        );
      },
      { timeout: timeoutMs, intervals: [180, 350, 600, 1100, 1800] }
    )
    .toBe(true);
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
