import { build } from "esbuild";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixture";
import { formatCurrency } from "../../src/lib/formatters";
import { formatEstimateCurrency } from "../../src/app/estimates/_components/estimate-currency";
import {
  sourceId,
  invoiceSources,
  paymentSources,
  invoiceReadModel,
  estimateSources,
  estimateDomain,
  payrollSource,
  payrollDomain,
  projectSource,
  projectDomain,
  dashboardDomain,
} from "./t81-financial-source-fixture";

// Authority: invoices-db.computeInvoiceDerived; financial/invoice-read-model.loadARPageReadModel;
// estimates-db.computeSummary/lineTotal; estimate-currency; formatters; EST-0063 fixed ledger.
// Scope: read-only source/domain/format/render only. Does not certify persistence or atomicity.
test.use({ deviceScaleFactor: 2, storageState: { cookies: [], origins: [] } });
async function mount(page: Page, surface: string) {
  const layoutCss = readFileSync(".next-e2e-ui-readonly/static/css/app/layout.css", "utf8");
  const fontVariables = [...layoutCss.matchAll(/\.(__variable_[\w]+)\s*\{/g)].map(
    (match) => match[1]
  );
  expect(fontVariables).toHaveLength(3);
  // Fully synthetic document and empty storage. No authenticated server, sessions or DB access.
  await page.route("**/*", (route) =>
    route.request().isNavigationRequest() && new URL(route.request().url()).pathname === surface
      ? route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="hh-motion-root"><main></main></body></html>',
        })
      : route.fallback()
  );
  await page.goto(`http://127.0.0.1:3000${surface}`);
  await page.evaluate(
    (classes) => document.documentElement.classList.add(...classes),
    fontVariables
  );
  await page.addStyleTag({ content: layoutCss });
  for (const path of [
    "src/app/estimates/_components/estimate-builder-glass.css",
    "src/app/estimates/_components/estimate-builder-operational.css",
  ])
    await page.addStyleTag({ content: readFileSync(path, "utf8") });
  const result = await build({
    entryPoints: ["tests/ui-readonly/t81-financial-render-fixture.tsx"],
    bundle: true,
    write: false,
    outfile: "t81-source.js",
    format: "iife",
    jsx: "automatic",
    alias: { react: "next/dist/compiled/react", "react-dom": "next/dist/compiled/react-dom" },
    define: {
      __SURFACE__: JSON.stringify(surface),
      "process.env": JSON.stringify({ NODE_ENV: "production", __NEXT_ROUTER_BASEPATH: "" }),
    },
    tsconfig: "tsconfig.json",
    plugins: [
      {
        name: "reject-server-actions",
        setup(plugin) {
          plugin.onLoad({ filter: /\/src\/app\/.*\/actions\.ts$/ }, (args) => ({
            contents: [...readFileSync(args.path, "utf8").matchAll(/export async function (\w+)/g)]
              .map(
                (m) =>
                  `export const ${m[1]} = async () => { throw new Error("T81 cannot invoke server actions"); };`
              )
              .join("\n"),
            loader: "js",
          }));
        },
      },
    ],
  });
  for (const file of result.outputFiles) {
    if (file.path.endsWith(".css")) await page.addStyleTag({ content: file.text });
    else await page.addScriptTag({ content: file.text });
  }
  await page.evaluate(() => document.fonts.ready);
}
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/^\/_next\/static\/media\/[\w.-]+$/.test(pathname)) {
      await route.fulfill({
        body: readFileSync(`.next-e2e-ui-readonly${pathname.replace("/_next", "")}`),
      });
      return;
    }
    await route.abort("blockedbyclient");
    throw new Error(`Unconfigured request blocked: ${route.request().method()} ${pathname}`);
  });
  await page.route("**/api/auth/local-auto-login**", (route) => route.abort("blockedbyclient"));
  page.on("request", (request) => {
    expect(
      ["GET", "HEAD", "OPTIONS"],
      `Unexpected write: ${request.method()} ${request.url()}`
    ).toContain(request.method());
  });
});
for (const width of [390, 1440]) {
  test(`T81 dashboard canonical summary source and rendered profit ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const domain = dashboardDomain();
    expect(domain.totalProfit).toBe(999999999.99);
    await page.setViewportSize({ width, height: 900 });
    await mount(page, "/dashboard");
    const profit = page
      .getByText("Guarded project profit", { exact: true })
      .locator("..")
      .locator("p")
      .nth(1);
    await expect(profit).toHaveText("$999,999,999.99");
    await info.attach("source-domain-display-ledger", {
      body: JSON.stringify({
        sourceId: "T81-dashboard",
        domain,
        expected: "$999,999,999.99",
        width,
        errors,
      }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath(`dashboard-source-${width}.png`),
      animations: "disabled",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
  test(`T81 invoice source payment association and exact rendered amounts ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const model = await invoiceReadModel();
    const expected = [
      ["$999,999,999.99", "$0.00", "$999,999,999.99", "Unpaid"],
      ["$961.26", "$384.50", "$576.76", "Partial"],
      ["$1.01", "$0.00", "$1.01", "Unpaid"],
    ];
    expect(model.invoices.map((i) => i.id)).toEqual(invoiceSources.map((i) => i.id));
    expect(model.invoices[1].paidTotal).toBe(384.5);
    expect(model.invoices[1].balanceDue).toBe(576.76);
    let reads = 0;
    await page.route("**/api/invoices?*", (route) => {
      expect(route.request().method()).toBe("GET");
      reads++;
      return route.fulfill({ json: { ok: true, invoices: model.invoices, projects: [] } });
    });
    await page.setViewportSize({ width, height: 900 });
    await mount(page, "/financial/invoices");
    for (const [index, invoice] of model.invoices.entries()) {
      expect([
        formatCurrency(invoice.total),
        formatCurrency(invoice.paidTotal),
        formatCurrency(invoice.balanceDue),
        invoice.computedStatus,
      ]).toEqual(expected[index]);
      const row = page.getByTestId(
        `${width < 1280 ? "invoice-mobile-card" : "invoice-row"}-T81-${index}`
      );
      await expect(row).toBeVisible();
      for (const [field, value] of [
        ["Total", expected[index][0]],
        ["Paid", expected[index][1]],
        ["Balance", expected[index][2]],
      ]) {
        if (width === 390)
          await expect(
            row
              .locator("div")
              .filter({ has: page.getByText(field, { exact: true }) })
              .filter({ has: page.locator("p") })
              .last()
              .locator("p")
              .last()
          ).toHaveText(value);
        else
          await expect(
            row.locator("td").nth(field === "Balance" ? 4 : field === "Paid" ? 5 : 6)
          ).toHaveText(value);
      }
      await expect(row).toContainText(expected[index][3]);
    }
    const summary = page.getByTestId("invoice-workspace-summary");
    await expect(summary).toContainText("$1,000,000,577.76");
    expect(reads).toBeGreaterThan(0);
    await info.attach("source-domain-display-ledger", {
      body: JSON.stringify({
        sourceId,
        invoiceSources,
        paymentSources,
        domain: model.invoices,
        expected,
        width,
        errors,
      }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath(`invoice-source-${width}.png`),
      animations: "disabled",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`T81 estimate source computation sign rounding and rendered amounts ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await mount(page, "/estimates/t81");
    for (const source of estimateSources) {
      const domain = estimateDomain(source);
      expect(
        [domain.subtotal, -domain.discount || 0, domain.tax, domain.grandTotal].map(
          formatEstimateCurrency
        )
      ).toEqual(source.expected);
      const row = page.locator(`[data-source-id="${source.id}"]`);
      if (width === 390) {
        await row.locator("summary").click();
        await expect(row.locator(".eb-mobile-summary-total")).toHaveText(source.expected[3]);
        await expect(row.locator(".eb-mobile-summary-breakdown")).toContainText(source.expected[0]);
        if (source.discount)
          await expect(row.locator(".eb-mobile-summary-breakdown")).toContainText(
            source.expected[1]
          );
        if (source.tax)
          await expect(row.locator(".eb-mobile-summary-breakdown")).toContainText(
            source.expected[2]
          );
      } else
        await expect(row.locator(".eb-pricing-summary-cell > strong")).toHaveText([
          ...source.expected,
        ]);
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${source.id}-${width}.png`),
        animations: "disabled",
      });
    }
    await info.attach("source-domain-display-ledger", {
      body: JSON.stringify({
        sourceId,
        sources: estimateSources,
        domain: estimateSources.map(estimateDomain),
        width,
        errors,
      }),
      contentType: "application/json",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`T81 payroll source earned payment and negative balance ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const rows = payrollDomain();
    expect(rows).toHaveLength(1);
    expect(rows[0].workerId).toBe("T81-worker");
    const values = [
      rows[0].earned,
      rows[0].reimbursements,
      rows[0].shouldPay,
      rows[0].paid,
      rows[0].balance,
    ].map(formatCurrency);
    expect(values).toEqual([
      "$999,999,999.99",
      "$0.00",
      "$999,999,999.99",
      "$1,000,000,000.00",
      "-$0.01",
    ]);
    await page.route("**/api/labor/payroll-summary?*", (route) =>
      route.fulfill({ json: { ok: true, projects: [], rows } })
    );
    await page.setViewportSize({ width, height: 900 });
    await mount(page, "/labor/payroll");
    if (width === 390) {
      const card = page
        .locator("div")
        .filter({ has: page.getByText("T81 Synthetic Worker", { exact: true }) })
        .filter({ has: page.locator("dl") })
        .last();
      await expect(card.locator("dd").nth(0)).toHaveText(values[0]);
      await expect(card.locator("dd").nth(1)).toHaveText(values[1]);
      await expect(card.locator("dd").nth(2)).toHaveText(values[2]);
      await expect(card.locator("dd").nth(3)).toHaveText(values[3]);
      await expect(card.locator("dd").nth(4)).toContainText(values[4]);
      await expect(card).toContainText("Overpaid");
    } else {
      const row = page.locator("tr").filter({ hasText: "T81 Synthetic Worker" });
      for (const [index, value] of values.entries())
        await expect(row.locator("td").nth(index + 1)).toContainText(value);
      await expect(row).toContainText("Overpaid");
    }
    await info.attach("source-domain-display-ledger", {
      body: JSON.stringify({ payrollSource, rows, values, width, errors }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath(`payroll-source-${width}.png`),
      animations: "disabled",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`T81 project source cost aggregation and signed profit ${width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const snapshot = projectDomain();
    expect(formatCurrency(snapshot.actualCost)).toBe("$1,000,000,600.05");
    expect(formatCurrency(snapshot.grossProfit)).toBe("-$999,000,600.05");
    await page.route("**/api/projects/financial-snapshots?*", (route) => {
      expect(new URL(route.request().url()).searchParams.get("ids")).toContain(
        projectSource.projectId
      );
      return route.fulfill({
        json: {
          ok: true,
          results: [
            { id: projectSource.projectId, ok: true, comparison: { newSnapshot: snapshot } },
          ],
        },
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await mount(page, "/projects");
    await expect(
      page.getByTestId(`project-list-profit-${projectSource.projectId}`).filter({ visible: true })
    ).toHaveText(width === 390 ? "Profit −$999,000,600" : "−$999,000,600");
    await info.attach("source-domain-display-ledger", {
      body: JSON.stringify({
        projectSource,
        snapshot,
        expectedDisplay: "−$999,000,600",
        displayAuthority: "projects-list-client.tsx fmtUsd0 whole USD",
        width,
        errors,
      }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath(`project-source-${width}.png`),
      animations: "disabled",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
}
