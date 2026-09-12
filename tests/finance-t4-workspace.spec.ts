import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

loadE2EProcessEnv();
const billId = "d2bfa053-e3c2-430d-acce-3a8faca4f7b7";
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const original = "/bills?search=TEST&status=Paid&bill_type=Vendor&page=2&selectedRecord=existing";
async function readyBill(page: Page) {
  const sheet = page.getByRole("dialog").filter({
    has: page.getByText("Review this bill and its payments without leaving your workspace."),
  });
  await expect(sheet.getByText("Vendor / payee", { exact: true })).toBeVisible();
  return sheet;
}
async function layout(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      rootWidth: root?.clientWidth,
      rootScroll: root?.scrollWidth,
      dialogWidth: dialog?.clientWidth,
      dialogScroll: dialog?.scrollWidth,
      sidebars: document.querySelectorAll("[data-app-sidebar]").length,
      shells: document.querySelectorAll("[data-app-scroll-root]").length,
      renderedColors: dialog
        ? Array.from(dialog.querySelectorAll("dt,dd"))
            .slice(0, 4)
            .map((element) => ({
              text: element.textContent,
              foreground: getComputedStyle(element).color,
              background: getComputedStyle(dialog).backgroundColor,
            }))
        : [],
    };
  });
  await testInfo.attach(`${name}-layout`, {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  expect(result.shells).toBe(1);
  expect(result.sidebars).toBeLessThanOrEqual(1);
  expect(result.document).toBeLessThanOrEqual(result.viewport);
  if (result.dialogWidth && result.dialogScroll)
    expect(result.dialogScroll).toBeLessThanOrEqual(result.dialogWidth + 1);
}
for (const viewport of viewports) {
  test(`Bills, history and payment context ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(original);
    await expect(page.locator(`[data-finance-record="${billId}"]:visible`)).toBeVisible();
    await page.locator(`[data-finance-record="${billId}"]:visible`).scrollIntoViewIfNeeded();
    const before = await page.locator("[data-app-scroll-root]").evaluate((el) => el.scrollTop);
    await page.locator(`[data-finance-record="${billId}"]:visible`).click();
    const sheet = await readyBill(page);
    await expect(sheet.getByText("$220.00", { exact: true })).toHaveCount(2);
    await expect(sheet.getByText("$0.00", { exact: true })).toBeVisible();
    await layout(page, testInfo, "bill-drawer");
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(new URL(original, "http://localhost:3000").href);
    await expect
      .poll(() => page.locator("[data-app-scroll-root]").evaluate((el) => el.scrollTop))
      .toBe(before);

    await page.goto("/financial/payables/payments?page=2");
    await expect(page.getByText(/payments · Page 2/)).toBeVisible();
    await page.locator('a[href^="/bills/"]:visible').first().click();
    const historySheet = await readyBill(page);
    await historySheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000/financial/payables/payments?page=2");
    await expect(page.getByText(/payments · Page 2/)).toBeVisible();

    await page.goto("/financial/payables?tab=payments&page=2");
    await expect(page.getByText(/payments · Page 2/)).toBeVisible();
    await page.getByRole("button", { name: "View payment", exact: true }).first().click();
    const outgoing = page.getByRole("dialog", { name: "Outgoing payment details" });
    await expect(outgoing.getByText("AP bill payment", { exact: true })).toBeVisible();
    await layout(page, testInfo, "outgoing-payment");
    await outgoing.getByRole("button", { name: "Open related bill", exact: true }).click();
    const related = await readyBill(page);
    await related.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000/financial/payables?tab=payments&page=2");
    await expect(
      page.getByRole("button", { name: "View payment", exact: true }).first()
    ).toBeFocused();

    await page.goto("/financial/payments?q=TEST&method=Check");
    await page.getByRole("button", { name: "View payment", exact: true }).first().click();
    const payment = page.getByRole("dialog", { name: "Payment details", exact: true });
    await expect(payment.getByText("Customer invoice payment", { exact: true })).toBeVisible();
    const paymentContext = page.url();
    await expect(
      payment.getByRole("button", { name: "More payment actions", exact: true })
    ).toHaveCSS("opacity", "1");
    await payment.getByRole("button", { name: "More payment actions", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Send receipt", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Void payment", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(payment).toBeVisible();
    await layout(page, testInfo, "payment-drawer");
    await payment.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit Payment", exact: true });
    await expect(edit.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(paymentContext);
    await expect(payment).toBeVisible();
    await payment.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000/financial/payments?q=TEST&method=Check");
    await testInfo.attach("errors", {
      body: JSON.stringify(errors),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}

test("Bill edit and canonical Pay refresh the same drawer", async ({ page, request }, testInfo) => {
  assertE2ESupabaseUrlSafeForMutations(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  expect(new URL(testInfo.project.use.baseURL as string).hostname).toBe("localhost");
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  const marker = `PW Finance T4 ${Date.now()}`;
  let id: string | undefined;
  try {
    const created = await request.post("/api/bills", {
      data: {
        vendor_name: marker,
        bill_no: marker,
        amount: 100,
        bill_type: "Vendor",
        notes: marker,
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const body = await created.json();
    id = body.bill?.id || body.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await page.goto("/financial/payables");
    await expect(page.getByRole("link", { name: marker, exact: true })).toHaveCount(0);
    await page.goto(`/financial/payables?${new URLSearchParams({ tab: "bills", search: marker })}`);
    await page.locator(`[data-finance-record="${id}"]:visible`).click();
    const overview = await readyBill(page);
    await overview.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(
      `http://localhost:3000/financial/payables?${new URLSearchParams({ tab: "bills", search: marker })}`
    );
    const origin = `/financial/payables?${new URLSearchParams({ tab: "bills", search: marker, page: "2" })}`;
    await page.goto(origin);
    await page.locator(`[data-finance-record="${id}"]:visible`).click();
    const sheet = await readyBill(page);
    const context = page.url();
    await sheet.getByRole("link", { name: "Edit bill", exact: true }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(context);
    const returned = await readyBill(page);
    await expect(returned.getByText("$100.00", { exact: true })).toHaveCount(2);
    await returned.getByRole("button", { name: "Approve", exact: true }).click();
    await returned.getByRole("button", { name: "Pay bill", exact: true }).click();
    const pay = page.getByRole("dialog", { name: "Add payment", exact: true });
    await pay.locator('input[type="number"]').fill("25");
    await pay.getByRole("button", { name: "Add payment", exact: true }).click();
    await expect(pay).toBeHidden();
    await expect(returned.getByText("$75.00", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(context);
    const after = await (await request.get(`/api/bills/${id}`)).json();
    expect(after.bill).toMatchObject({
      amount: 100,
      paid_amount: 25,
      balance_amount: 75,
      status: "Partially Paid",
    });
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].amount).toBe(25);
    await testInfo.attach("amount-ledger", {
      body: JSON.stringify({ before: { amount: 100, paid: 0, balance: 100 }, after }),
      contentType: "application/json",
    });
    await layout(page, testInfo, "paid-drawer");
    await returned.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(new URL(origin, "http://localhost:3000").href);
    await expect(page.locator(`[data-finance-record="${id}"]:visible`)).toBeFocused();
  } finally {
    if (id && /^[0-9a-f-]{36}$/.test(id)) {
      // Only this test's marked Bill and its payments; never global teardown or T3 data.
      execFileSync("docker", [
        "exec",
        "supabase_db_hh-finance-audit-2026",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `BEGIN; DELETE FROM ap_bill_payments WHERE bill_id IN (SELECT id FROM ap_bills WHERE id='${id}' AND bill_no='${marker}'); DELETE FROM ap_bills WHERE id='${id}' AND bill_no='${marker}'; COMMIT;`,
      ]);
    }
  }
});

test("Payment Save retains filters and exact Deposit origin", async ({
  page,
  request,
}, testInfo) => {
  const id = "f71347ee-547f-4310-9c7e-b83e9e1d4472";
  const deposit = "/financial/deposits?q=f71347ee&account=TEST+Finance+Audit+2026+Operating";
  const params = new URLSearchParams({ paymentId: id, q: id, returnTo: deposit });
  await page.goto(`/financial/payments?${params}`);
  await page.getByRole("button", { name: "View payment", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Payment details", exact: true });
  const context = page.url();
  const beforeResponse = await request.get(`/api/financial/payments/${id}/receipt-preview`);
  expect(beforeResponse.ok()).toBe(true);
  const before = await beforeResponse.json();
  await sheet.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Payment", exact: true });
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(context);
  const after = await (await request.get(`/api/financial/payments/${id}/receipt-preview`)).json();
  expect(after).toEqual(before);
  await testInfo.attach("payment-save-ledger", {
    body: JSON.stringify({ before, after, delta: 0 }),
    contentType: "application/json",
  });
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(`http://localhost:3000/financial/payments?${params}`);
  await page.getByRole("link", { name: "Back to Deposits", exact: true }).click();
  await expect(page).toHaveURL(`http://localhost:3000${deposit}`);
});

test("Unavailable Bill can close and retry without losing workspace context", async ({ page }) => {
  let fail = true;
  await page.route(`**/api/bills/${billId}`, (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "T4 synthetic read failure" }),
        })
      : route.continue()
  );
  await page.goto(original);
  await page.locator(`[data-finance-record="${billId}"]:visible`).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("alert")).toContainText("T4 synthetic read failure");
  await expect(sheet.getByText("$0.00", { exact: true })).toHaveCount(0);
  fail = false;
  await sheet.getByRole("button", { name: "Retry", exact: true }).click();
  await readyBill(page);
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(`http://localhost:3000${original}`);
});

test("Vendor links disclose unavailable ID scope and preserve origin", async ({
  page,
}, testInfo) => {
  const vendor = "/vendors/1c2227e1-a923-41e6-be6a-4669dfef4aa1";
  for (const [tab, label, message] of [
    ["bills", "Browse all bills", "Vendor-scoped bills are unavailable"],
    ["payments", "Browse all outgoing payments", "Vendor-scoped payments are unavailable"],
    ["expenses", "Browse all expenses", "Vendor-specific expense history is unavailable"],
  ]) {
    const origin = `${vendor}?tab=${tab}`;
    await page.goto(origin);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    const href = await page.getByRole("link", { name: label, exact: true }).getAttribute("href");
    const destination = new URL(href!, "http://localhost:3000");
    expect(destination.searchParams.get("returnTo")).toBe(origin);
    expect(destination.searchParams.has("search")).toBe(false);
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.getByRole("link", { name: "Back to vendor", exact: true }).click();
    await expect(page).toHaveURL(`http://localhost:3000${origin}`);
  }
  await layout(page, testInfo, "vendor-unavailable");
});
