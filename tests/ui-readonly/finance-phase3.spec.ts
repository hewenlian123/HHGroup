import { test, expect, type Page } from "@playwright/test";

async function guardWrites(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue();
    if (
      ["/financial/accounts", "/financial/deposits"].includes(new URL(request.url()).pathname) &&
      request.headers()["next-action"] &&
      request.postData()?.trim() === "[]"
    )
      return route.continue();
    return route.abort("blockedbyclient");
  });
}
const sync = (page: Page) =>
  page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("hh:app-sync", { detail: { reason: "phase3-smoke", at: Date.now() } })
    )
  );
async function contained(page: Page) {
  expect(
    await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
    )
  ).toBeLessThanOrEqual(2);
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Phase 3 navigation and live session ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await guardWrites(page);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const routes = [
      ["/financial", "Finance Overview"],
      ["/financial/expenses/overview", "Recent expenses"],
      ["/financial/expenses?date_kind=all", "Tracked project costs and completed expenses"],
      ["/financial/inbox?date_kind=all", "Review uploaded receipts and draft expenses"],
      ["/financial/accounts/overview", "Accounts overview"],
      ["/financial/accounts", "Total accounts"],
      ["/financial/bank", "Bank Reconcile"],
      ["/financial/deposits", "Total deposited"],
      ["/financial/dashboard", "Company Financial Dashboard"],
      ["/finance/labor-cost", "Total labor cost"],
      ["/financial/ar", "Recent customer payments"],
      ["/financial/payables", "Vendor / subcontractor AP balances"],
    ];
    for (const [route, ready] of routes) {
      expect((await page.goto(route))?.status()).toBe(200);
      if (route.startsWith("/financial/expenses?") && viewport.width < 640) {
        // This existing mobile surface intentionally hides its desktop subtitle.
        const ledger = page.locator('[data-expenses-list-page="expenses"]');
        await expect(ledger).toHaveAttribute("data-expenses-query-status", "success");
        await expect(
          ledger
            .locator('[data-expense-surface-header="mobile"]')
            .getByRole("heading", { name: "Expenses", exact: true })
        ).toBeVisible();
        await expect(
          ledger.getByRole("region", { name: "Expense summary", exact: true })
        ).toBeVisible();
        await expect(ledger.getByText(ready, { exact: true }).first()).toBeHidden();
        await expect(page.locator("[data-expenses-availability]")).not.toBeVisible();
      } else {
        await expect(
          page.getByText(ready, { exact: true }).filter({ visible: true }).first()
        ).toBeVisible({ timeout: 60_000 });
      }
      await expect(
        page
          .getByText(
            /^(Expenses|Transactions|Deposits|Finance overview|Accounts overview|Labor cost|Portfolio summary) unavailable$/
          )
          .filter({ visible: true })
      ).toHaveCount(0);
      await expect(page.getByRole("banner")).toBeVisible();
      await contained(page);
      await page.screenshot({
        path: testInfo.outputPath(`${route.replace(/[^a-z0-9]/gi, "-")}-${viewport.width}.png`),
      });
    }
    await page.goto("/financial/expenses/overview");
    const sections = page.getByRole("navigation", { name: "Expense Operations workspace" });
    await sections.getByRole("link", { name: "Receipts", exact: true }).click();
    await expect(page).toHaveURL(/\/financial\/inbox/);
    await expect(sections.getByRole("link", { name: "Receipts", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await page.goto("/financial/accounts/overview");
    const accounts = page.getByRole("navigation", { name: "Accounts sections" });
    await accounts.getByRole("link", { name: "Transactions", exact: true }).click();
    await expect(page).toHaveURL(/\/financial\/bank$/);
    await accounts.getByRole("link", { name: "Deposits", exact: true }).click();
    await expect(page).toHaveURL(/\/financial\/deposits$/);
    await expect(accounts.getByRole("link", { name: "Deposits", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(errors).toEqual([]);
  });

  test(`Phase 3 empty failure and retry ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await guardWrites(page);
    await page.setViewportSize(viewport);
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    let bankMode = "empty";
    await page.route("**/api/financial/bank-transactions?view=reconcile", (route) =>
      route.fulfill({
        status: bankMode === "empty" ? 200 : bankMode === "permission" ? 403 : 500,
        contentType: "application/json",
        body: JSON.stringify(
          bankMode === "empty"
            ? {
                ok: true,
                transactions: [],
                projects: [],
                categories: [],
                vendors: [],
                paymentMethods: [],
              }
            : { ok: false, message: "Bank read unavailable" }
        ),
      })
    );
    await page.goto("/financial/bank");
    await expect(
      page.getByText("Bank Reconcile", { exact: true }).filter({ visible: true }).first()
    ).toBeVisible();
    for (const failure of ["query", "permission"]) {
      bankMode = failure;
      await sync(page);
      await expect(page.getByText("Transactions unavailable", { exact: true })).toBeVisible();
      await expect(page.getByTestId("bank-reconciliation-workspace")).not.toContainText("$0.00");
      await contained(page);
      bankMode = "empty";
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(
        page.getByText("Bank Reconcile", { exact: true }).filter({ visible: true }).first()
      ).toBeVisible();
    }
    let depositMode = "empty";
    await page.route("**/financial/deposits", async (route) => {
      const request = route.request();
      if (!request.headers()["next-action"]) return route.fallback();
      const response = await route.fetch();
      let replaced = false;
      const body = (await response.text())
        .split("\n")
        .map((line) => {
          const colon = line.indexOf(":");
          if (colon < 0) return line;
          let value;
          try {
            value = JSON.parse(line.slice(colon + 1));
          } catch {
            return line;
          }
          if (!value || !Array.isArray(value.deposits)) return line;
          replaced = true;
          return (
            line.slice(0, colon + 1) +
            JSON.stringify(
              depositMode === "empty"
                ? { deposits: [] }
                : {
                    deposits: [],
                    error:
                      depositMode === "permission"
                        ? "Permission denied"
                        : "Deposit query unavailable",
                  }
            )
          );
        })
        .join("\n");
      expect(replaced).toBe(true);
      return route.fulfill({ response, body });
    });
    await page.goto("/financial/deposits");
    await expect(page.getByText("No deposits yet", { exact: true })).toBeVisible();
    for (const failure of ["query", "permission"]) {
      depositMode = failure;
      await sync(page);
      await expect(page.getByText("Deposits unavailable", { exact: true })).toBeVisible();
      await expect(page.getByText("Total deposited", { exact: true })).not.toBeVisible();
      await expect(page.getByText("No deposits yet", { exact: true })).not.toBeVisible();
      depositMode = "empty";
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(page.getByText("No deposits yet", { exact: true })).toBeVisible();
    }
    await page.goto("/financial/expenses?date_kind=all");
    await expect(page.locator('[data-expenses-query-status="success"]')).toBeVisible();
    let expenseMode = "permission";
    await page.route("**/rest/v1/expenses?**", (route) =>
      expenseMode === "live"
        ? route.continue()
        : route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ code: "42501", message: "permission denied" }),
          })
    );
    await sync(page);
    await expect(page.getByText("Expenses unavailable", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-expenses-availability]")).not.toContainText("$0.00");
    await page.screenshot({
      path: testInfo.outputPath(`expenses-unavailable-${viewport.width}.png`),
    });
    expenseMode = "live";
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.locator("[data-expenses-availability]")).not.toBeVisible({ timeout: 30_000 });
    await contained(page);
    expect(pageErrors).toEqual([]);
  });
}

test("Expense draft survives background receipt refresh", async ({ page }) => {
  await guardWrites(page);
  await page.goto("/financial/expenses?date_kind=all");
  await expect(page.locator('[data-expenses-query-status="success"]')).toBeVisible();
  await page
    .getByRole("button", { name: "New Expense", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const vendor = page.locator("#quick-expense-vendor");
  await vendor.fill("PW Unsaved draft");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/expenses?**", async (route) => {
    await gate;
    await route.continue();
  });
  await sync(page);
  await expect(page.locator("[data-expenses-availability]")).toBeVisible();
  await expect(vendor).toHaveValue("PW Unsaved draft");
  release();
  await expect(page.locator("[data-expenses-availability]")).not.toBeVisible();
  await expect(vendor).toHaveValue("PW Unsaved draft");
});
