import type { Page } from "@playwright/test";

import { expect, test } from "./fixture";
import {
  E2E_PRESERVED_ESTIMATE_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_WORKER_ID,
} from "../e2e-cleanup-db";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
}

for (const viewport of VIEWPORTS) {
  test(`Phase 6B Dashboard uses canonical computed styles at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    const commandCenter = page.getByRole("region", { name: "HH Command Center" });
    await expect(commandCenter).toBeVisible();

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);
      const computed = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const hud = document.querySelector<HTMLElement>('[aria-label="HH Command Center"]');
        const amount = document.querySelector<HTMLElement>(".dashboard-profit-core__value");
        const action = document.querySelector<HTMLElement>(".dashboard-quick-actions a");
        if (!hud || !amount || !action) throw new Error("Dashboard convergence surfaces missing");

        action.focus();
        const bodyStyle = getComputedStyle(body);
        const hudStyle = getComputedStyle(hud);
        const amountStyle = getComputedStyle(amount);
        const actionStyle = getComputedStyle(action);
        const rootStyle = getComputedStyle(root);

        return {
          pageOverflow: root.scrollWidth - root.clientWidth,
          fontFamily: bodyStyle.fontFamily,
          hudBackground: hudStyle.backgroundColor,
          l2: rootStyle.getPropertyValue("--hh-l2-operational-surface").trim(),
          hudRadius: hudStyle.borderRadius,
          expectedRadius: rootStyle.getPropertyValue("--hh-radius-standard").trim(),
          amountNumeric: amountStyle.fontVariantNumeric,
          actionOutlineStyle: actionStyle.outlineStyle,
          actionOutlineWidth: actionStyle.outlineWidth,
        };
      });

      expect(computed.pageOverflow).toBeLessThanOrEqual(0);
      expect(computed.fontFamily.toLowerCase()).toContain("geist");
      expect(computed.hudBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(computed.l2).not.toBe("");
      expect(computed.hudRadius).toBe(computed.expectedRadius);
      expect(computed.amountNumeric).toContain("tabular-nums");
      expect(computed.actionOutlineStyle).toBe("solid");
      expect(computed.actionOutlineWidth).toBe("2px");

      await page.screenshot({
        path: testInfo.outputPath(`dashboard-${viewport.name}-${theme}.png`),
        fullPage: false,
      });
    }
  });

  test(`Phase 6B Expense Operations uses canonical computed styles at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const routes = [
      { path: "/financial/expenses", surface: ".expenses-ui" },
      { path: "/financial/inbox", surface: ".expenses-ui" },
      { path: "/financial/reimbursements", surface: "main" },
    ] as const;

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      const surface = page.locator(route.surface).first();
      await expect(surface).toBeVisible();

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const computed = await page.evaluate((selector) => {
          const root = document.documentElement;
          const body = document.body;
          const operationalSurface = document.querySelector<HTMLElement>(selector);
          if (!operationalSurface) throw new Error(`Expense surface missing: ${selector}`);

          const rootStyle = getComputedStyle(root);
          const surfaceStyle = getComputedStyle(operationalSurface);
          return {
            pageOverflow: root.scrollWidth - root.clientWidth,
            fontFamily: getComputedStyle(body).fontFamily,
            surfaceColor: surfaceStyle.color,
            primaryText: rootStyle.getPropertyValue("--hh-text-primary").trim(),
          };
        }, route.surface);

        expect(computed.pageOverflow).toBeLessThanOrEqual(0);
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.surfaceColor).not.toBe("");
        expect(computed.primaryText).not.toBe("");
      }

      await page.screenshot({
        path: testInfo.outputPath(
          `expense-${route.path.replaceAll("/", "-").replace(/^-/, "")}-${viewport.name}.png`
        ),
        fullPage: false,
      });
    }
  });

  test(`Phase 6B Estimates preserves operational and document contracts at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of ["/estimates", "/estimates/new"] as const) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const surface = page.locator(
        route === "/estimates" ? '[data-testid="estimate-list-workspace"]' : ".estimate-builder"
      );
      await expect(surface).toBeVisible({ timeout: 30_000 });

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const computed = await page.evaluate(
          (selector) => {
            const root = document.documentElement;
            const operationalSurface = document.querySelector<HTMLElement>(selector);
            if (!operationalSurface) throw new Error(`Estimate surface missing: ${selector}`);
            const rootStyle = getComputedStyle(root);
            const surfaceStyle = getComputedStyle(operationalSurface);
            return {
              pageOverflow: root.scrollWidth - root.clientWidth,
              fontFamily: getComputedStyle(document.body).fontFamily,
              background: surfaceStyle.backgroundColor,
              canonicalCanvas: rootStyle.getPropertyValue("--hh-l0-canvas").trim(),
              canonicalFocus: rootStyle.getPropertyValue("--hh-focus-ring").trim(),
            };
          },
          route === "/estimates" ? '[data-testid="estimate-list-workspace"]' : ".estimate-builder"
        );

        expect(computed.pageOverflow).toBeLessThanOrEqual(0);
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(computed.canonicalCanvas).not.toBe("");
        expect(computed.canonicalFocus).not.toBe("");
      }
    }

    await page.goto(`/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`, {
      waitUntil: "domcontentloaded",
    });
    const documentSurface = page.getByTestId("estimate-document");
    await expect(documentSurface).toBeVisible({ timeout: 30_000 });
    const documentContract = await documentSurface.evaluate((surface) => {
      const root = document.documentElement;
      const style = getComputedStyle(surface);
      const firstPage = surface.querySelector<HTMLElement>('[data-testid="estimate-preview-page"]');
      if (!firstPage) throw new Error("Estimate preview page missing");
      return {
        pageOverflow: root.scrollWidth - root.clientWidth,
        fontFamily: style.fontFamily,
        pageBackground: getComputedStyle(firstPage).backgroundColor,
      };
    });
    expect(documentContract.pageOverflow).toBeLessThanOrEqual(0);
    expect(documentContract.fontFamily.toLowerCase()).toContain("inter");
    expect(documentContract.pageBackground).toBe("rgb(255, 255, 255)");

    await page.screenshot({
      path: testInfo.outputPath(`estimates-${viewport.name}.png`),
      fullPage: false,
    });
  });

  test(`Phase 6B Labor and Payroll preserve operational and statement contracts at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of ["/labor", "/labor/payroll", "/labor/worker-balances"] as const) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 30_000 });

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const computed = await page.evaluate(() => {
          const root = document.documentElement;
          const numeric = document.querySelector<HTMLElement>(".hh-fin, .tabular-nums");
          return {
            pageOverflow: root.scrollWidth - root.clientWidth,
            fontFamily: getComputedStyle(document.body).fontFamily,
            numericVariant: numeric ? getComputedStyle(numeric).fontVariantNumeric : "",
            canvas: getComputedStyle(root).getPropertyValue("--hh-l0-canvas").trim(),
          };
        });

        expect(computed.pageOverflow).toBeLessThanOrEqual(0);
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.canvas).not.toBe("");
        if (computed.numericVariant) expect(computed.numericVariant).toContain("tabular-nums");
      }
    }

    await page.goto(`/workers/${E2E_PRESERVED_WORKER_ID}/statement/print`, {
      waitUntil: "domcontentloaded",
    });
    const statement = page.locator(".payroll-statement-print-root");
    await expect(statement).toBeAttached({ timeout: 30_000 });
    const statementFont = await statement.evaluate(
      (element) => getComputedStyle(element).fontFamily
    );
    expect(statementFont.toLowerCase()).toContain("inter");

    await page.screenshot({
      path: testInfo.outputPath(`labor-${viewport.name}.png`),
      fullPage: false,
    });
  });

  test(`Phase 6B Projects preserve operational and financial presentation at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of [
      "/projects",
      `/projects/${E2E_PRESERVED_PROJECT_ID}`,
      `/projects/${E2E_PRESERVED_PROJECT_ID}?tab=financial`,
    ] as const) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 30_000 });

      if (route.includes(E2E_PRESERVED_PROJECT_ID)) {
        await expect(page.getByRole("tablist", { name: "Project workspace sections" })).toBeVisible(
          {
            timeout: 30_000,
          }
        );
      }

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const computed = await page.evaluate(() => {
          const root = document.documentElement;
          const numeric = document.querySelector<HTMLElement>(".hh-fin, .tabular-nums");
          return {
            pageOverflow: root.scrollWidth - root.clientWidth,
            fontFamily: getComputedStyle(document.body).fontFamily,
            numericVariant: numeric ? getComputedStyle(numeric).fontVariantNumeric : "",
            canvas: getComputedStyle(root).getPropertyValue("--hh-l0-canvas").trim(),
          };
        });

        expect(computed.pageOverflow).toBeLessThanOrEqual(1);
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.canvas).not.toBe("");
        if (computed.numericVariant) expect(computed.numericVariant).toContain("tabular-nums");

        await page.keyboard.press("Tab");
        const focusVisible = page.locator(":focus-visible").first();
        await expect(focusVisible).toBeVisible();
        const focusStyle = await focusVisible.evaluate((element) => {
          const style = getComputedStyle(element);
          return { outline: style.outlineStyle, shadow: style.boxShadow };
        });
        expect(focusStyle.outline !== "none" || focusStyle.shadow !== "none").toBe(true);
      }
    }

    await page.screenshot({
      path: testInfo.outputPath(`projects-${viewport.name}.png`),
      fullPage: false,
    });
  });

  test(`Phase 6B Invoices preserve operational and document presentation at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/financial/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

    const detailPath = await page
      .locator('a[href^="/financial/invoices/"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .find((href) =>
            /^\/financial\/invoices\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              href ?? ""
            )
          )
      );
    if (!detailPath) {
      testInfo.annotations.push({
        type: "fixture",
        description:
          "No persistent local invoice; detail and document surfaces are covered by the guarded Invoice workflow gate.",
      });
    }

    const operationalRoutes = detailPath
      ? ["/financial/invoices", detailPath]
      : ["/financial/invoices", "/financial/invoices/new"];
    for (const route of operationalRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
      if (detailPath && route === detailPath) {
        await expect(page.getByTestId("invoice-detail")).toBeVisible({ timeout: 30_000 });
      }

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const computed = await page.evaluate(() => {
          const root = document.documentElement;
          const numeric = document.querySelector<HTMLElement>(".hh-fin, .tabular-nums");
          return {
            pageOverflow: root.scrollWidth - root.clientWidth,
            fontFamily: getComputedStyle(document.body).fontFamily,
            numericVariant: numeric ? getComputedStyle(numeric).fontVariantNumeric : "",
            canvas: getComputedStyle(root).getPropertyValue("--hh-l0-canvas").trim(),
          };
        });

        expect(computed.pageOverflow).toBeLessThanOrEqual(1);
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.canvas).not.toBe("");
        if (computed.numericVariant) expect(computed.numericVariant).toContain("tabular-nums");
      }
    }

    if (detailPath) {
      await page.goto(`${detailPath}/preview`, { waitUntil: "domcontentloaded" });
      const invoiceDocument = page.getByTestId("invoice-preview-document");
      await expect(invoiceDocument).toBeVisible({ timeout: 30_000 });
      const documentContract = await invoiceDocument.evaluate((surface) => ({
        fontFamily: getComputedStyle(surface).fontFamily,
        pageBackground: getComputedStyle(surface).backgroundColor,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(documentContract.fontFamily.toLowerCase()).toContain("inter");
      expect(documentContract.pageBackground).toBe("rgb(255, 255, 255)");
      expect(documentContract.pageOverflow).toBeLessThanOrEqual(1);
    }

    await page.screenshot({
      path: testInfo.outputPath(`invoices-${viewport.name}.png`),
      fullPage: false,
    });
  });
}
