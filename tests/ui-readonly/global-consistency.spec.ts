import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixture";
import {
  E2E_PRESERVED_PROJECT_ID as projectId,
  E2E_PRESERVED_CUSTOMER_ID as customerId,
} from "../e2e-cleanup-db";

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
for (const viewport of viewports) {
  test(`Global workspace consistency ${viewport.width}`, async ({ page }, info) => {
    test.setTimeout(300000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
    });
    const healthy = async () => {
      expect(
        await page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
        )
      ).toBeLessThanOrEqual(2);
      await expect(
        page.getByText(/Application error|Unhandled Runtime Error|Internal Server Error/).first()
      ).not.toBeVisible();
    };
    const goto = async (path: string) => {
      expect((await page.goto(path, { waitUntil: "networkidle" }))?.status()).toBe(200);
      await healthy();
    };
    const capture = async (name: string) =>
      page.screenshot({ caret: "initial", path: info.outputPath(`${name}-${viewport.width}.png`) });
    const navLink = async (owner: string, label: string) => {
      const nav = page.getByRole("navigation", { name: `${owner} workspace`, exact: true });
      const link = nav.getByRole("link", { name: label, exact: true });
      if (await link.isVisible()) await link.click();
      else {
        await nav.getByRole("button", { name: `More ${owner} sections` }).click();
        await page.getByRole("menuitem", { name: label, exact: true }).click();
      }
      await page.waitForLoadState("networkidle");
    };
    for (const [path, owner] of [
      ["/estimates", "Estimates"],
      ["/financial", "Finance"],
      ["/projects", "Projects"],
      ["/labor/overview", "Labor"],
      ["/customers/overview", "Contacts"],
    ]) {
      await goto(path);
      const nav = page.getByRole("navigation", { name: `${owner} workspace`, exact: true });
      await expect(nav).toHaveCount(1);
      await expect(page.locator("main h1:visible")).toHaveCount(1);
      expect(await nav.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(2);
      for (const el of await nav.locator("a:visible,button:visible").all()) {
        const b = (await el.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 2);
      }
      if (viewport.width < 1024 && owner !== "Estimates") {
        const more = nav.getByRole("button", { name: `More ${owner} sections` });
        await more.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
      }
      const before = (await nav.boundingBox())!.y;
      await page.locator("main").evaluate((e) => (e.scrollTop = e.scrollHeight));
      expect((await nav.boundingBox())!.y).toBe(before);
      await page.locator("main").evaluate((e) => (e.scrollTop = 0));
      const contrast = await new AxeBuilder({ page })
        .include("[data-workspace-navigation]")
        .withRules(["color-contrast"])
        .analyze();
      expect(contrast.violations).toEqual([]);
      await capture(owner.toLowerCase());
      if (viewport.width < 640) {
        await page.getByRole("button", { name: "Open menu", exact: true }).click();
        await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
        await page.keyboard.press("Escape");
      } else await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
    }
    await goto("/projects");
    await navLink("Projects", "Documents");
    await expect(page).toHaveURL(/\/documents$/);
    await page.goBack();
    const projectSearch = page
      .getByRole("textbox", { name: "Search projects", exact: true })
      .filter({ visible: true });
    await projectSearch.fill("no-match-global-fixture");
    await expect(page.getByText(/No projects match/).filter({ visible: true })).toBeVisible();
    await projectSearch.fill("");
    if (viewport.width < 768)
      await page
        .getByRole("button", { name: /Filter/ })
        .filter({ visible: true })
        .first()
        .click();
    const status = page
      .getByRole("combobox", { name: "Filter projects by status" })
      .filter({ visible: true });
    if (viewport.width < 1024)
      expect((await status.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await status.selectOption("all");
    if (viewport.width < 768) await page.getByRole("button", { name: "Done", exact: true }).click();
    const projectLink =
      viewport.width < 768
        ? page.locator(`a[href="/projects/${projectId}"]:visible`).first()
        : page
            .locator("tr[role=link]")
            .filter({ has: page.getByTestId(`project-list-actual-cost-${projectId}`) });
    await projectLink.click();
    await expect(page.locator(`[data-project-context="${projectId}"]`)).toBeVisible();
    await capture("project-detail");
    await page.goBack();
    await expect(projectSearch).toBeVisible();
    await goto("/estimates");
    const estimateSearch = page
      .getByRole("textbox", { name: "Search estimates", exact: true })
      .filter({ visible: true });
    if (viewport.width < 1024)
      expect((await estimateSearch.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await estimateSearch.fill("no-match-global-fixture");
    await expect(page.getByText(/No estimates match/).filter({ visible: true })).toBeVisible();
    await estimateSearch.fill("");
    if (viewport.width < 768) {
      await page
        .getByRole("button", { name: /Filter/ })
        .filter({ visible: true })
        .first()
        .click();
      const select = page.getByLabel("Status", { exact: true });
      expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await select.selectOption("Draft");
      await page.getByRole("button", { name: "Done", exact: true }).click();
    } else {
      const filter = page.locator(".estimate-list-status-filter").first();
      if (viewport.width < 1024)
        expect((await filter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await filter.click();
    }
    const estimateLink = page
      .locator('main a[href^="/estimates/"]:visible')
      .filter({ hasNotText: /New estimate/i })
      .first();
    await estimateLink.click();
    await expect(page).toHaveURL(/\/estimates\/[^/?]+/);
    await page.waitForLoadState("networkidle");
    await capture("estimate-detail");
    await page.goBack();
    await expect(estimateSearch).toBeVisible();
    await goto("/labor/overview");
    await navLink("Labor", "Workers");
    const workerSearch = page
      .getByRole("textbox", { name: "Search workers" })
      .filter({ visible: true });
    await workerSearch.fill("no-match-global-fixture");
    await workerSearch.fill("");
    const workerLink = page
      .locator(
        'main tr[role=link]:visible, [data-testid="worker-center-mobile-cards"] [role=button]:visible'
      )
      .first();
    await workerLink.click();
    await expect(page.locator("[data-worker-tabs]")).toBeVisible();
    await capture("worker-detail");
    await page.goBack();
    await expect(workerSearch).toBeVisible();
    await goto("/customers/overview");
    const contactSearch = page.getByRole("textbox", { name: "Search contacts" });
    await contactSearch.fill("no-match-global-fixture");
    await expect(page.getByText("No contacts match your filters", { exact: true })).toBeVisible();
    await contactSearch.fill("");
    await page.getByRole("combobox", { name: "Contact type" }).selectOption("Customer");
    await page.locator(`a[href="/customers/${customerId}"]:visible`).first().click();
    await expect(page.getByRole("textbox", { name: "Customer Name", exact: true })).toBeVisible();
    await capture("contact-detail");
    await page.goBack();
    await expect(contactSearch).toBeVisible();
    await goto("/financial");
    await navLink("Finance", "Billing");
    await page
      .getByRole("navigation", { name: "Billing sections", exact: true })
      .getByRole("link", { name: "Invoices", exact: true })
      .click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Invoices", exact: true }).filter({ visible: true })
    ).toBeVisible();
    await capture("invoices-list");
    await goto("/financial/expenses");
    const expenseSearch = page
      .getByRole("searchbox", { name: "Search expenses" })
      .or(page.getByRole("textbox", { name: "Search expenses" }))
      .filter({ visible: true });
    await expenseSearch.fill("no-match-global-fixture");
    await expenseSearch.fill("");
    const groups = page.getByRole("combobox", { name: "Expense groups per page" });
    if (viewport.width >= 768) {
      await expect(groups).toBeVisible();
      expect((await groups.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await capture("expenses-controls");
    await healthy();
    await page.emulateMedia({ forcedColors: "active" });
    await goto("/vendors");
    const contactsNav = page.getByRole("navigation", { name: "Contacts workspace", exact: true });
    if (viewport.width < 1024) {
      await contactsNav.getByRole("button", { name: "More Contacts sections" }).click();
      await expect(page.getByRole("menuitem", { name: "Vendors", exact: true })).toHaveCSS(
        "text-decoration-line",
        "underline"
      );
      await page.keyboard.press("Escape");
    } else
      await expect(contactsNav.locator("[aria-current=page]")).toHaveCSS(
        "text-decoration-line",
        "underline"
      );
    await capture("forced-colors");
    await page.emulateMedia({ forcedColors: "none" });
    await info.attach("console-errors", {
      body: JSON.stringify(errors),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });

  test(`Global unavailable loading empty Retry ${viewport.width}`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    const pageErrors: string[] = [];
    const errors: { url: string; text: string }[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push({ url: m.location().url, text: m.text() });
    });
    for (const item of [
      {
        path: "/vendors",
        api: "**/api/vendors?includeDisabled=1",
        empty: { vendors: [] },
        failure: /Vendor contacts unavailable/,
        retry: /Retry contacts/,
        emptyText: /No contacts yet/,
      },
      {
        path: "/labor/entries",
        api: "**/api/labor/entries?*",
        empty: { ok: true, entries: [], workers: [], projects: [] },
        failure: /unavailable/i,
        retry: /Try again|Retry/,
        emptyText: /No time entries|No entries/,
      },
    ]) {
      let status = 403;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      let waiting = true;
      await page.route(item.api, async (route) => {
        if (waiting) await gate;
        await route.fulfill({
          status,
          json: status === 200 ? item.empty : { message: "Fixture unavailable" },
        });
      });
      await page.goto(item.path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main [aria-busy=true]").first()).toBeVisible();
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`loading-${item.path.replaceAll("/", "-")}.png`),
      });
      waiting = false;
      release();
      for (const code of [403, 500]) {
        status = code;
        if (code === 500) await page.reload({ waitUntil: "networkidle" });
        await expect(page.locator("main").getByText(item.failure).first()).toBeVisible();
        await expect(page.locator("main")).not.toContainText("$0");
        await expect(
          page.getByText(item.emptyText).filter({ visible: true }).first()
        ).not.toBeVisible();
        await page.screenshot({
          caret: "initial",
          path: info.outputPath(`unavailable-${code}-${item.path.replaceAll("/", "-")}.png`),
        });
      }
      status = 200;
      await page.getByRole("button", { name: item.retry }).click();
      await expect(page.getByText(item.emptyText).filter({ visible: true }).first()).toBeVisible();
      await page.unroute(item.api);
    }
    await page.route("**/rest/v1/payments_received?**", (route) =>
      route.fulfill({ status: 403, json: { code: "42501", message: "Permission denied" } })
    );
    await page.goto("/financial/payments", { waitUntil: "networkidle" });
    const failure = page.getByRole("alert").filter({ hasText: "Unable to load received payments" });
    await expect(failure).toBeVisible();
    await expect(page.getByText("Total received", { exact: true })).not.toBeVisible();
    await page.unroute("**/rest/v1/payments_received?**");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(failure).not.toBeVisible();
    expect(pageErrors).toEqual([]);
    for (const e of errors) {
      expect(e.url).toMatch(/\/api\/(vendors|labor\/entries)|\/rest\/v1\/payments_received/);
      expect(e.text).toMatch(/Failed to load resource.*(?:403|500)/);
    }
    await info.attach("induced-console-errors", {
      body: JSON.stringify(errors),
      contentType: "application/json",
    });
  });
}
