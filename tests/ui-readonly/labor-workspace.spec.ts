import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixture";

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const routes = [
  "/labor/overview",
  "/workers",
  "/labor/entries",
  "/labor/costs",
  "/labor/worker-balances",
  "/labor/payments",
  "/labor/advances",
  "/labor/reimbursements",
  "/labor/payroll",
];
for (const viewport of viewports) {
  test(`Labor workspace smoke ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
    });
    for (const route of routes) {
      await test.step(route, async () => {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(response?.status(), route).toBe(200);
        if (route === "/labor/payroll")
          await expect(
            page.getByRole("heading", { name: "Payroll Summary", exact: true })
          ).toBeVisible({ timeout: 30_000 });
        await expect(
          page.getByRole("navigation", { name: "Labor workspace", exact: true })
        ).toBeVisible();
        await expect(page.locator("[data-labor-read-state]")).toHaveCount(0, { timeout: 30_000 });
        await expect(
          page
            .getByText(/Application error|Unhandled Runtime Error|Worker advances unavailable/)
            .first()
        ).not.toBeVisible();
        expect(
          await page.evaluate(
            () =>
              Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
          ),
          route
        ).toBeLessThanOrEqual(2);
        await page.screenshot({
          path: testInfo.outputPath(`${route.replaceAll("/", "-")}-${viewport.width}.png`),
        });
      });
    }
    await page.goto("/labor/overview");
    await expect(page.locator("[data-labor-read-state]")).toHaveCount(0, { timeout: 30_000 });
    const nav = page.getByRole("navigation", { name: "Labor workspace", exact: true });
    await expect(nav).toBeVisible();
    const contrast = await new AxeBuilder({ page })
      .include("[data-workspace-navigation]")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);
    for (const control of await nav.locator("a:visible,button:visible").all())
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (!(await nav.getByRole("link", { name: "Costs", exact: true }).isVisible())) {
      await nav.getByRole("button", { name: "More Labor sections" }).click();
      await page.getByRole("menuitem", { name: "Costs", exact: true }).click();
    } else await nav.getByRole("link", { name: "Costs", exact: true }).click();
    await expect(page).toHaveURL(/\/labor\/costs$/);
    await expect(page.locator("[data-labor-read-state]")).toHaveCount(0, { timeout: 30_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/labor\/overview$/);
    await expect(page.locator("[data-labor-read-state]")).toHaveCount(0, { timeout: 30_000 });
    const workerResponse = await page.request.get("/api/labor/workers");
    expect(workerResponse.ok()).toBe(true);
    const workers = (await workerResponse.json()) as { id: string; name: string }[];
    expect(workers.length, "Local worker fixture is required").toBeGreaterThan(0);
    const worker = process.env.E2E_UI_WORKER_ID
      ? workers.find((candidate) => candidate.id === process.env.E2E_UI_WORKER_ID)!
      : workers[0];
    expect(worker, "Requested exact local worker fixture exists").toBeTruthy();
    const entryResponse = await page.request.get(
      `/api/labor/entries?view=joined&workerId=${worker.id}`
    );
    expect(entryResponse.ok()).toBe(true);
    const entryData = await entryResponse.json();
    const project =
      entryData.entries.find((entry: { project_id: string | null }) => entry.project_id)
        ?.project_id ?? "";
    const base = `/workers/${worker.id}?projectId=${project}&returnTo=%2Flabor%2Foverview`;
    await page.goto(
      `/labor/reimbursements?workerId=${worker.id}&projectId=${project}&returnTo=%2Flabor%2Foverview`
    );
    const paymentTypes = page.getByRole("navigation", { name: "Labor payment types", exact: true });
    await expect(paymentTypes).toBeVisible();
    for (const control of await paymentTypes.getByRole("link").all()) {
      const target = new URL((await control.getAttribute("href"))!, "http://localhost");
      expect(target.pathname).toBe(`/workers/${worker.id}`);
      expect(target.searchParams.get("projectId")).toBe(project);
    }
    await paymentTypes.getByRole("link", { name: "Advances", exact: true }).click();
    await expect(page).toHaveURL(/tab=advances/);
    await expect(page.getByRole("heading", { name: worker.name, exact: true })).toBeVisible();
    await page.goto(`${base}&tab=work`);
    await expect(page.locator("[data-worker-tabs]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: worker.name, exact: true })).toBeVisible();
    const choose = async (label: string) => {
      await expect(page.locator("[data-worker-tabs]")).toBeVisible({ timeout: 30_000 });
      const expectedTab =
        label === "Time" ? "work" : label === "Rate History" ? "rates" : label.toLowerCase();
      const visibleTab = page.getByRole("tab", { name: label, exact: true });
      if (await visibleTab.isVisible()) await visibleTab.click();
      else {
        await page.getByRole("button", { name: "More worker sections" }).click();
        await page.getByRole("menuitem", { name: label, exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`[?&]tab=${expectedTab}(?:&|$)`));
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await expect(page.getByRole("heading", { name: worker.name, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("projectId")).toBe(project);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/labor/overview");
    };
    await choose("Payments");
    await expect(page).toHaveURL(/tab=payments/);
    await choose("Reimbursements");
    await expect(page).toHaveURL(/tab=reimbursements/);
    await page.goBack();
    await expect(page).toHaveURL(/tab=payments/);
    for (const label of [
      "Overview",
      "Time",
      "Balance",
      "Advances",
      "Receipts",
      "History",
      "Statements",
      "Rate History",
    ])
      await choose(label);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath(`worker-context-${viewport.width}.png`) });
    await page.goto(
      `/labor/workers/${worker.id}?tab=balance&projectId=${project}&returnTo=%2Flabor%2Foverview`
    );
    await expect(page).toHaveURL(new RegExp(`/workers/${worker.id}\\?`));
    await expect(page.locator("[data-worker-tabs]")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Review balance / Pay Worker" }).click();
    await expect(page.getByTestId("worker-balance-summary")).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(page).toHaveURL(/tab=balance/);
    await choose("Time");
    await page.getByRole("link", { name: "Add Time Entry", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("workerId")).toBe(worker.id);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Back to Worker", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${worker.id}`));
    await expect(page.locator("[data-worker-tabs]")).toBeVisible({ timeout: 30_000 });
    // Minimum frozen regressions: canonical hubs, distinct payment destinations, browser back.
    await page.goto("/financial");
    const finance = page.getByRole("navigation", { name: "Finance workspace", exact: true });
    await expect(finance).toBeVisible();
    await finance.getByRole("link", { name: "Billing", exact: true }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Billing sections", exact: true })
        .getByRole("link", { name: "Payments", exact: true })
    ).toHaveAttribute("href", "/financial/payments");
    await finance.getByRole("link", { name: "Payables", exact: true }).click();
    const payables = page.getByRole("navigation", { name: "Payables sections", exact: true });
    await expect(payables.getByRole("link", { name: "Bills", exact: true })).toHaveAttribute(
      "href",
      "/bills"
    );
    await expect(payables.getByRole("link", { name: "Payments", exact: true })).toHaveAttribute(
      "href",
      "/financial/payables/payments"
    );
    await page.goto("/projects");
    await expect(
      page.getByRole("navigation", { name: "Projects workspace", exact: true })
    ).toBeVisible();
    await page.goBack();
    await expect(finance).toBeVisible();
    await testInfo.attach("console-errors", {
      body: JSON.stringify(errors, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}

for (const viewport of viewports) {
  test(`Labor failed reads never present successful zero/empty ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    test.setTimeout(180_000);
    const cases = [
      {
        path: "/labor/payments",
        api: "**/api/labor/worker-payments*",
        empty: { ok: true, payments: [], workers: [], projects: [] },
      },
      {
        path: "/labor/worker-balances",
        api: "**/api/labor/worker-balances*",
        empty: { balances: [] },
      },
      { path: "/labor/advances", api: "**/api/labor/advances?*", empty: { advances: [] } },
      {
        path: "/labor/reimbursements",
        api: "**/api/worker-reimbursements",
        empty: { reimbursements: [] },
      },
      {
        path: "/labor/payroll",
        api: "**/api/labor/payroll-summary?*",
        empty: { ok: true, rows: [], projects: [] },
      },
      {
        path: "/labor/entries",
        api: "**/api/labor/entries?*",
        empty: { ok: true, entries: [], workers: [], projects: [] },
      },
      {
        path: "/labor/costs",
        api: "**/api/labor/entries?*",
        empty: { ok: true, entries: [], workers: [], projects: [] },
      },
    ];
    for (const item of cases) {
      for (const status of [503, 403]) {
        await page.route(item.api, (route) =>
          route.fulfill({ status, json: { message: "Unavailable fixture" } })
        );
        await page.goto(item.path);
        await expect(page.locator("[data-labor-read-state]").getByText(/unavailable/i)).toBeVisible(
          {
            timeout: 30_000,
          }
        );
        await expect(
          page.locator("[data-app-scroll-root]").getByText(/^\$0(?:\.00)?$/)
        ).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(2);
        await page.screenshot({
          path: testInfo.outputPath(
            `${item.path.replaceAll("/", "-")}-${status}-${viewport.width}.png`
          ),
        });
        await page.unroute(item.api);
      }
      await page.route(item.api, (route) => route.fulfill({ json: item.empty }));
      await page.goto(item.path);
      await expect(page.locator("[data-labor-read-state]")).toHaveCount(0, { timeout: 30_000 });
      await page.unroute(item.api);
    }
  });
}
