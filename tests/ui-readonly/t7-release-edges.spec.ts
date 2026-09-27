import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixture";

test.use({ deviceScaleFactor: 2, hasTouch: true });

const targets = [
  ["dashboard", "/dashboard", '[aria-label="Operations home"]'],
  ["projects", "/projects", "main h1:visible"],
  ["estimate", "/estimates/44444444-4444-4444-4444-444444444449", ".estimate-builder-new"],
  ["invoice", "/financial/invoices", '[data-testid="invoice-workspace-summary"]'],
  ["expenses", "/financial/expenses?date_kind=all", '[data-expenses-query-status="success"]'],
] as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/invoices?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        projects: [{ id: "11111111-1111-1111-1111-111111111111", name: "Seed Job" }],
        invoices: [
          {
            id: "44444444-4444-4444-4444-444444444447",
            invoiceNo: "[E2E]-INV-SEED-001",
            projectId: "11111111-1111-1111-1111-111111111111",
            clientName: "Seed Client",
            issueDate: "2026-09-01",
            dueDate: "2026-09-30",
            status: "Sent",
            computedStatus: "Partial",
            lineItems: [],
            subtotal: 961.26,
            taxAmount: 0,
            total: 961.26,
            paidTotal: 384.5,
            balanceDue: 576.76,
            daysOverdue: 0,
          },
        ],
      },
    })
  );
});

for (const [name, route, ready] of targets) {
  for (const width of [320, 390, 1440]) {
    test(`T7 ${name} accessibility and long content ${width}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator(ready).first()).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      const lastAction = page
        .locator("main button:visible:not([disabled]), main a[href]:visible")
        .last();
      await lastAction.scrollIntoViewIfNeeded();
      expect(
        await lastAction.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top === el || el.contains(top);
        })
      ).toBe(true);
      await page.locator("main").evaluate((el) => {
        const scroller = el.closest("[data-app-scroll-root]") || el;
        scroller.scrollTop = 0;
      });
      await page.screenshot({
        path: info.outputPath(`${name}-${width}-normal.png`),
        animations: "disabled",
      });
      // Browser-only stress values; no production data or calculation is changed.
      const stressed = await page
        .locator('main [class*="tabular-nums"], main .hh-fin')
        .evaluateAll((nodes) => {
          let count = 0;
          for (const el of nodes) {
            if (
              !(el instanceof HTMLElement) ||
              !el.checkVisibility() ||
              el.children.length ||
              !el.textContent?.includes("$")
            )
              continue;
            el.textContent = "$999,999,999.99";
            el.dataset.t7Money = "true";
            count++;
          }
          for (const el of document.querySelectorAll<HTMLElement>(
            "main [data-invoice-primary-number]"
          )) {
            if (el.children.length === 0)
              el.textContent = "Long customer and project reference — " + "Reference".repeat(8);
          }
          return count;
        });
      const clipped = await page.locator("[data-t7-money]").evaluateAll((nodes) =>
        nodes.flatMap((el) => {
          const node = el as HTMLElement;
          let parent: HTMLElement | null = node;
          while (parent && parent.tagName !== "MAIN") {
            if (parent.clientWidth > 0 && parent.scrollWidth > parent.clientWidth + 1)
              return [
                {
                  text: node.textContent,
                  class: parent.className,
                  width: parent.clientWidth,
                  scroll: parent.scrollWidth,
                },
              ];
            parent = parent.parentElement;
          }
          return [];
        })
      );
      await info.attach("long-content", {
        body: JSON.stringify({ stressed, clipped }),
        contentType: "application/json",
      });
      await page.screenshot({
        path: info.outputPath(`${name}-${width}-long.png`),
        animations: "disabled",
      });
      expect(clipped).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
      const focusable = page
        .locator("main button:visible:not([disabled]), main a[href]:visible, main input:visible")
        .first();
      await focusable.focus();
      await expect(focusable).toBeFocused();
      expect(await focusable.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      expect(errors).toEqual([]);
    });
  }
}

for (const width of [390, 1440]) {
  test(`T7 invoice loading empty error recovery and status authority ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let mode: "empty" | "error" | "statuses" = "empty";
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.route("**/api/invoices?*", async (route) => {
      await pending;
      if (mode === "error")
        return route.fulfill({ json: { ok: false, message: "T7 fixture unavailable" } });
      await route.fulfill({
        json: {
          ok: true,
          projects: [],
          invoices:
            mode === "empty"
              ? []
              : ["Draft", "Unpaid", "Partial", "Paid", "Overdue", "Void"].map((status, index) => ({
                  id: `t7-invoice-${index}`,
                  invoiceNo: `T7-${status}`,
                  projectId: null,
                  clientName: "Long customer " + "Reference".repeat(10),
                  issueDate: "2026-09-01",
                  dueDate: "2026-09-02",
                  status: status === "Draft" ? "Draft" : "Sent",
                  computedStatus: status,
                  lineItems: [],
                  subtotal: 961.26,
                  taxAmount: 0,
                  total: 961.26,
                  paidTotal: status === "Paid" ? 961.26 : status === "Partial" ? 384.5 : 0,
                  balanceDue: status === "Paid" ? 0 : status === "Partial" ? 576.76 : 961.26,
                  daysOverdue: status === "Overdue" ? 5 : 0,
                })),
        },
      });
    });
    await page.goto("/financial/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-invoices-loading]")).toBeVisible();
    release();
    await expect(page.getByText("No invoices yet", { exact: true })).toBeVisible();
    await expect(page.getByTestId("invoice-workspace-summary")).toContainText("$0.00");
    await page.waitForLoadState("networkidle");
    mode = "error";
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Could not load invoices", { exact: true })).toBeVisible();
    await expect(page.getByTestId("invoice-workspace-summary")).toHaveCount(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Failed to load invoice list Error: T7 fixture unavailable");
    mode = "statuses";
    await page.getByRole("button", { name: "Try again" }).click();
    for (const status of ["Draft", "Unpaid", "Partial", "Paid", "Overdue", "Void"]) {
      const row = page.locator(
        `[data-testid="${width < 1280 ? "invoice-mobile-card" : "invoice-row"}-T7-${status}"]`
      );
      await expect(row).toBeVisible();
      await expect(row).toContainText(status);
      await expect(row).toContainText("$961.26");
    }
    const search = page.getByPlaceholder("Invoice #, client, project…").filter({ visible: true });
    await search.fill("not-present-in-fixture");
    await expect(page.getByText("No invoices match your filters", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.locator("[data-invoice-primary-number]:visible")).toHaveCount(6);
    await page.screenshot({
      path: info.outputPath(`invoice-states-${width}.png`),
      animations: "disabled",
    });
    expect(pageErrors).toEqual([]);
    expect(errors).toHaveLength(1);
  });
}

for (const width of [320, 390, 640, 1024]) {
  test(`T7 expense custom calendar touch and focus ${width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/financial/expenses?date_kind=all", { waitUntil: "networkidle" });
    await expect(page.locator('[data-expenses-query-status="success"]')).toBeVisible();
    if (!(await page.locator("[data-expenses-filter-date]:visible").count()))
      await page.getByRole("button", { name: /Filters/ }).click();
    const trigger = page.locator("[data-expenses-filter-date]:visible");
    expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    const panel = page.locator('[data-expense-component-surface="date-filter"]');
    const presetHeights = await panel
      .locator("button")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(Math.min(...presetHeights)).toBeGreaterThanOrEqual(44);
    await panel.getByRole("button", { name: "Custom range" }).click();
    await expect(panel.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`calendar-${width}.png`),
      animations: "disabled",
    });
    const geometry = await panel.evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
      rect: el.getBoundingClientRect().toJSON(),
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.rect.x).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.right).toBeLessThanOrEqual(width);
    const sizes = await panel.locator("button:visible").evaluateAll((nodes) =>
      nodes.map((el) => ({
        label: el.getAttribute("aria-label") || el.textContent,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
      }))
    );
    expect(sizes.filter((s) => s.w < 44 || s.h < 44)).toEqual([]);
    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });
    const axe = await new AxeBuilder({ page })
      .include('[data-expense-component-surface="date-filter"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  for (const name of ["projects", "expenses"] as const) {
    test(`T7 ${name} filtered empty and recovery ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(name === "projects" ? "/projects" : "/financial/expenses?date_kind=all", {
        waitUntil: "networkidle",
      });
      const search = page
        .getByPlaceholder(
          name === "projects" ? "Search projects…" : "Merchant, description, project…"
        )
        .filter({ visible: true });
      await search.fill("T7-absent-reference-" + "Long".repeat(20));
      await expect(
        page
          .getByText(
            name === "projects" ? /No projects match your filter/ : "No transactions found",
            { exact: name !== "projects" }
          )
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      const axe = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${name}-empty-${width}.png`),
        animations: "disabled",
      });
      await search.fill("");
      await expect(
        page
          .locator(
            name === "projects"
              ? '[data-testid="project-list-profit-11111111-1111-1111-1111-111111111111"]:visible'
              : "[data-expense-amount]:visible"
          )
          .first()
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
