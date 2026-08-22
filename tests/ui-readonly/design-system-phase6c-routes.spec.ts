import type { Page } from "@playwright/test";

import { expect, test } from "./fixture";
import { E2E_PRESERVED_WORKER_ID } from "../e2e-cleanup-db";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const ROUTES = [
  "/system-health",
  "/bills",
  "/customers",
  "/subcontractors",
  "/reports",
  "/reports/workforce",
  "/settings/account",
  "/settings/company",
  "/finance",
  "/finance/labor-cost",
  "/financial/accounts",
  "/financial/ar",
  "/financial/bank",
  "/financial/deposits",
  "/financial/owner",
  "/financial/vendors",
  "/financial/commissions",
  "/financial/payments",
  "/materials",
  "/materials/new",
  "/workers",
  `/workers/${E2E_PRESERVED_WORKER_ID}`,
  `/worker/${E2E_PRESERVED_WORKER_ID}/monthly-report`,
] as const;

const REPRESENTATIVE_ROUTES = [
  "/system-health",
  "/bills",
  "/customers",
  "/subcontractors",
  "/reports",
  "/settings/company",
  "/finance",
  "/financial/accounts",
  "/materials",
  "/workers",
  `/workers/${E2E_PRESERVED_WORKER_ID}`,
] as const;

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
}

for (const viewport of VIEWPORTS) {
  test(`Phase 6C secondary modules inherit canonical UI at ${viewport.name}`, async ({ page }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const accessibilityFailures: string[] = [];
    const routes = viewport.name === "mobile" ? ROUTES : REPRESENTATIVE_ROUTES;

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${route} redirected unexpectedly`).toBe(route);
      await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const computed = await page.evaluate(() => {
          const root = document.documentElement;
          const rootStyle = getComputedStyle(root);
          const numeric = document.querySelector<HTMLElement>("main .hh-fin, main .tabular-nums");
          const shadow = document.querySelector<HTMLElement>("main .shadow-operational");
          const namedControls = [
            ...document.querySelectorAll<HTMLElement>(
              "main button, main input, main select, main textarea, main a[href]"
            ),
          ]
            .filter(
              (element) => element.getClientRects().length > 0 && !element.hasAttribute("disabled")
            )
            .map((element) => {
              const labels =
                element instanceof HTMLInputElement ||
                element instanceof HTMLSelectElement ||
                element instanceof HTMLTextAreaElement
                  ? [...(element.labels ?? [])].map((label) => label.textContent?.trim()).join(" ")
                  : "";
              const contentName =
                element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement
                  ? element.innerText?.trim()
                  : "";
              return {
                name:
                  element.getAttribute("aria-label")?.trim() ||
                  element.getAttribute("title")?.trim() ||
                  labels ||
                  contentName,
                display: getComputedStyle(element).display,
                height: element.getBoundingClientRect().height,
                tag: element.tagName,
              };
            });

          return {
            pageOverflow: root.scrollWidth - root.clientWidth,
            fontFamily: getComputedStyle(document.body).fontFamily,
            tokens: [
              "--hh-l0-canvas",
              "--hh-l1-workspace",
              "--hh-l2-operational-surface",
              "--hh-l3-hover",
              "--hh-l4-floating-surface",
              "--hh-l5-task-surface",
            ].map((token) => rootStyle.getPropertyValue(token).trim()),
            numericVariant: numeric ? getComputedStyle(numeric).fontVariantNumeric : "",
            operationalShadow: shadow ? getComputedStyle(shadow).boxShadow : "",
            namedControls,
          };
        });

        expect(computed.pageOverflow, `${route} overflows at ${viewport.name}`).toBeLessThanOrEqual(
          0
        );
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.tokens.every(Boolean)).toBe(true);
        if (computed.numericVariant) expect(computed.numericVariant).toContain("tabular-nums");
        if (computed.operationalShadow) expect(computed.operationalShadow).not.toBe("none");
        const unnamed = computed.namedControls.filter((control) => !control.name);
        if (unnamed.length) {
          accessibilityFailures.push(
            `${route}: ${unnamed.length} unnamed ${unnamed.map((item) => item.tag).join(", ")}`
          );
        }

        if (viewport.name === "mobile") {
          const undersizedTouchControls = computed.namedControls.filter(
            (control) =>
              (["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(control.tag) ||
                (control.tag === "A" && control.display !== "inline")) &&
              control.height < 43.5
          );
          if (undersizedTouchControls.length)
            accessibilityFailures.push(
              `${route}: undersized mobile controls (${undersizedTouchControls
                .map((control) => `${control.tag}:${control.name}:${control.height}`)
                .join(" | ")})`
            );
        }
      }

      const keyboardStops: string[] = [];
      for (let stop = 0; stop < 8; stop += 1) {
        await page.keyboard.press("Tab");
        keyboardStops.push(await page.evaluate(() => document.activeElement?.tagName ?? ""));
      }
      expect(
        keyboardStops.some((tag) => ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(tag)),
        `${route} exposes no keyboard focus stop`
      ).toBe(true);
    }

    expect(accessibilityFailures).toEqual([]);
  });
}
