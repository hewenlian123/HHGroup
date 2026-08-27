import type { Browser, Page } from "@playwright/test";

import { expect, test, UI_READONLY_METHODS } from "./fixture";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const OPERATIONAL_ROUTES = [
  "/change-orders",
  "/estimate-templates",
  "/financial",
  "/labor/entries",
  "/system-logs",
  "/system-metrics",
  "/system/backups",
] as const;

const AUTH_ROUTES = ["/login", "/forgot-password"] as const;

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
}

async function assertOperationalContract(page: Page, route: string, mobile: boolean) {
  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

  const computed = await page.evaluate(() => {
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const numeric = document.querySelector<HTMLElement>("main .hh-fin, main .tabular-nums");
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        "main button, main input, main select, main textarea, main a[href]"
      ),
    ]
      .filter((element) => element.getClientRects().length > 0 && !element.hasAttribute("disabled"))
      .map((element) => {
        const labelTarget = element.closest("label");
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
          display: getComputedStyle(element).display,
          height: Math.max(
            element.getBoundingClientRect().height,
            labelTarget?.getBoundingClientRect().height ?? 0
          ),
          name:
            element.getAttribute("aria-label")?.trim() ||
            element.getAttribute("title")?.trim() ||
            labels ||
            contentName,
          tag: element.tagName,
        };
      });

    return {
      controls,
      fontFamily: getComputedStyle(document.body).fontFamily,
      neoTokens: [...rootStyle].filter((property) => property.startsWith("--neo-")),
      numericVariant: numeric ? getComputedStyle(numeric).fontVariantNumeric : "",
      overflow: root.scrollWidth - root.clientWidth,
      tokens: [
        "--hh-l0-canvas",
        "--hh-l1-workspace",
        "--hh-l2-operational-surface",
        "--hh-l3-hover",
        "--hh-l3-selected",
        "--hh-l3-pressed",
        "--hh-l4-floating-surface",
        "--hh-l5-task-surface",
        "--hh-border",
        "--hh-focus-ring",
      ].map((token) => rootStyle.getPropertyValue(token).trim()),
    };
  });

  expect(computed.overflow, `${route} horizontal overflow`).toBeLessThanOrEqual(0);
  expect(computed.fontFamily.toLowerCase(), `${route} operational font`).toContain("geist");
  expect(computed.tokens.every(Boolean), `${route} canonical tokens`).toBe(true);
  expect(computed.neoTokens, `${route} legacy Neo custom properties`).toEqual([]);
  if (computed.numericVariant) {
    expect(computed.numericVariant, `${route} FIN`).toContain("tabular-nums");
  }

  const unnamed = computed.controls.filter((control) => !control.name);
  expect(unnamed, `${route} accessible names`).toEqual([]);

  if (mobile) {
    const undersized = computed.controls.filter(
      (control) =>
        (["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(control.tag) ||
          (control.tag === "A" && control.display !== "inline")) &&
        control.height < 43.5
    );
    expect(undersized, `${route} 44px touch targets`).toEqual([]);
  }

  const keyboardStops: string[] = [];
  for (let stop = 0; stop < 8; stop += 1) {
    await page.keyboard.press("Tab");
    keyboardStops.push(await page.evaluate(() => document.activeElement?.tagName ?? ""));
  }
  expect(
    keyboardStops.some((tag) => ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(tag)),
    `${route} keyboard focus`
  ).toBe(true);
}

async function openAnonymousPage(browser: Browser, baseURL: string, width: number, height: number) {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    viewport: { width, height },
  });
  await context.clearCookies();
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    if (UI_READONLY_METHODS.has(route.request().method())) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
  return { context, page };
}

for (const viewport of VIEWPORTS) {
  test(`Phase 6D operational convergence at ${viewport.name}`, async ({ page }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    for (const route of OPERATIONAL_ROUTES) {
      runtimeErrors.length = 0;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${route} redirected unexpectedly`).toBe(route);

      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        await assertOperationalContract(page, route, viewport.name === "mobile");
      }
      expect(runtimeErrors, `${route} uncaught browser errors`).toEqual([]);
    }
  });

  test(`Phase 6D auth surfaces remain canonical at ${viewport.name}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const baseURL = String(testInfo.project.use.baseURL);
    const { context, page } = await openAnonymousPage(
      browser,
      baseURL,
      viewport.width,
      viewport.height
    );
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    try {
      for (const route of AUTH_ROUTES) {
        runtimeErrors.length = 0;
        await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(new URL(page.url()).pathname, `${route} redirected unexpectedly`).toBe(route);
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        const computed = await page.evaluate(() => ({
          fontFamily: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          serif: /times/i.test(getComputedStyle(document.body).fontFamily),
        }));
        expect(computed.fontFamily.toLowerCase()).toContain("geist");
        expect(computed.serif).toBe(false);
        expect(computed.overflow).toBeLessThanOrEqual(0);
        expect(runtimeErrors, `${route} uncaught browser errors`).toEqual([]);
      }
    } finally {
      await context.close();
    }
  });
}
