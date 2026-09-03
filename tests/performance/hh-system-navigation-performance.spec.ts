import { writeFile } from "node:fs/promises";

import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";

import { HH_PROJECT_OS_NAV_SECTIONS } from "../../src/lib/navigation/ia";
import { isProductionAppUrl } from "../e2e-supabase-url-guard";
import {
  classifyNavigationPerformanceResult,
  isMutatingNavigationRequest,
  type NavigationPerformanceError,
  type NavigationPerformanceRequest,
} from "./performance-result";

const SETTLE_QUIET_WINDOW_MS = 500;
const SETTLE_TIMEOUT_MS = 5_000;

const TARGET_LABELS = ["Dashboard", "Projects", "Overview", "Workers", "Documents"] as const;

const USEFUL_CONTENT_LOCATORS: Record<string, string> = {
  "/dashboard": "main [aria-label='HH Command Center'], main h1, main [role='heading']",
  "/projects": "[data-testid='projects-page-heading'], main h1, main [role='heading']",
  "/financial": "main h1, main [role='heading'], main [data-testid]",
  "/workers": "[data-testid='worker-center-row'], main h1, main [role='heading']",
  "/documents": "main h1, main [role='heading'], main [data-testid]",
  "/projects/:visible-detail":
    "[aria-label='Project workspace sections'], main h1, main [role='heading']",
};

const navigationTargets = HH_PROJECT_OS_NAV_SECTIONS.flatMap((section) =>
  section.entries
    .filter(
      (
        entry
      ): entry is Extract<(typeof section.entries)[number], { href: string; label: string }> =>
        "href" in entry && TARGET_LABELS.includes(entry.label as (typeof TARGET_LABELS)[number])
    )
    .map((entry) => ({ label: entry.label, href: entry.href }))
);

function routePath(page: Page): string {
  return new URL(page.url()).pathname;
}

function requestRecord(request: Request, startedAtMs: number): NavigationPerformanceRequest {
  return {
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
    startedAtMs,
  };
}

class RequestInventory {
  private readonly byRequest = new Map<Request, NavigationPerformanceRequest>();
  private readonly errors: Array<{ atMs: number; value: NavigationPerformanceError }> = [];
  private lastActivityAtMs = 0;

  constructor(private readonly page: Page) {
    page.on("request", (request) => {
      const record = requestRecord(request, performance.now());
      this.byRequest.set(request, record);
      this.lastActivityAtMs = record.startedAtMs;
    });
    page.on("response", (response) => {
      const record = this.byRequest.get(response.request());
      if (!record) return;
      record.status = response.status();
      record.finishedAtMs = performance.now();
      this.lastActivityAtMs = record.finishedAtMs;
    });
    page.on("requestfailed", (request) => {
      const record = this.byRequest.get(request);
      if (!record) return;
      record.failure = request.failure()?.errorText || "request failed";
      record.finishedAtMs = performance.now();
      this.lastActivityAtMs = record.finishedAtMs;
      this.errors.push({
        atMs: performance.now(),
        value: { source: "requestfailed", message: record.failure, url: record.url },
      });
    });
    page.on("pageerror", (error) =>
      this.errors.push({
        atMs: performance.now(),
        value: { source: "pageerror", message: error.message },
      })
    );
    page.on("console", (message) => {
      if (message.type() === "error") {
        this.errors.push({
          atMs: performance.now(),
          value: { source: "console", message: message.text() },
        });
      }
    });
  }

  startWindow(): number {
    const startedAtMs = performance.now();
    this.lastActivityAtMs = startedAtMs;
    return startedAtMs;
  }

  requestsSince(startedAtMs: number): NavigationPerformanceRequest[] {
    return [...this.byRequest.values()].filter((request) => request.startedAtMs >= startedAtMs);
  }

  errorsSince(startedAtMs: number): NavigationPerformanceError[] {
    return this.errors.filter((error) => error.atMs >= startedAtMs).map((error) => error.value);
  }

  async waitForSettle(): Promise<void> {
    const deadline = performance.now() + SETTLE_TIMEOUT_MS;
    while (performance.now() < deadline) {
      if (performance.now() - this.lastActivityAtMs >= SETTLE_QUIET_WINDOW_MS) return;
      await this.page.waitForTimeout(50);
    }
  }
}

async function visibleCanonicalLink(page: Page, href: string): Promise<Locator> {
  const links = page.locator("a[href]");
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    if ((await link.getAttribute("href")) === href && (await link.isVisible())) return link;
  }
  throw new Error(`No visible navigation link found for ${href}.`);
}

async function visibleProjectDetailLink(page: Page): Promise<Locator> {
  const links = page.locator("main a[href^='/projects/']");
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    if (
      href &&
      /^\/projects\/[^/?#]+(?:[?#].*)?$/.test(href) &&
      href !== "/projects/new" &&
      (await link.isVisible())
    ) {
      return link;
    }
  }
  throw new Error(
    "No visible project detail link is available for the dynamic-detail measurement."
  );
}

async function waitForUsefulContent(page: Page, targetHref: string): Promise<void> {
  const locator = USEFUL_CONTENT_LOCATORS[targetHref] || "main h1, main [role='heading'], main";
  await expect(page.locator(locator).first()).toBeVisible();
}

async function installReadOnlyGuard(page: Page, safetyErrors: NavigationPerformanceError[]) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (isMutatingNavigationRequest(request.method(), request.url())) {
      const message = `Blocked mutating navigation request: ${request.method()} ${request.url()}`;
      safetyErrors.push({ source: "safety", message, url: request.url() });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

async function writeResult(testInfo: TestInfo, result: unknown): Promise<void> {
  await writeFile(
    testInfo.outputPath("navigation-performance.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
}

test.describe("HH system navigation performance", () => {
  for (const target of navigationTargets) {
    test(`measures link navigation to ${target.label}`, async ({ page }, testInfo) => {
      const baseURL = String(testInfo.project.use.baseURL);
      const productionTarget = isProductionAppUrl(baseURL);
      const safetyErrors: NavigationPerformanceError[] = [];

      await installReadOnlyGuard(page, safetyErrors);

      const inventory = new RequestInventory(page);
      const startHref = target.href === "/dashboard" ? "/projects" : "/dashboard";
      await page.goto(startHref, { waitUntil: "domcontentloaded" });
      await waitForUsefulContent(page, startHref);

      const fromPath = routePath(page);
      const link = await visibleCanonicalLink(page, target.href);
      const linkHref = (await link.getAttribute("href")) || target.href;
      const startedAtMs = inventory.startWindow();

      await link.click();
      await expect(page.locator("main").first()).toBeVisible();
      const clickToFeedbackMs = performance.now() - startedAtMs;
      await page.waitForURL((url) => new URL(url).pathname === target.href, { timeout: 30_000 });
      const routeStartedAtMs = performance.now();
      await waitForUsefulContent(page, target.href);
      const usefulContentAtMs = performance.now();
      await inventory.waitForSettle();

      const classified = classifyNavigationPerformanceResult({
        target,
        viewport: {
          name: testInfo.project.name,
          width: testInfo.project.use.viewport?.width || 0,
          height: testInfo.project.use.viewport?.height || 0,
        },
        run: testInfo.retry + 1,
        navigation: { fromPath, toPath: routePath(page), linkHref },
        clickToFeedbackMs,
        clickToRouteStartMs: routeStartedAtMs - startedAtMs,
        routeStartToUsefulContentMs: usefulContentAtMs - routeStartedAtMs,
        fullSettleMs: performance.now() - startedAtMs,
        requests: inventory.requestsSince(startedAtMs),
        errors: [...inventory.errorsSince(startedAtMs), ...safetyErrors],
      });

      await writeResult(testInfo, classified.ok ? classified.value : classified);
      expect(classified.ok, "navigation performance result contract").toBe(true);
      expect(
        safetyErrors,
        productionTarget ? "Production read-only guard" : "read-only probe guard"
      ).toEqual([]);
    });
  }

  test("measures a visible project detail link without hard-coding an identifier", async ({
    page,
  }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const productionTarget = isProductionAppUrl(baseURL);
    const safetyErrors: NavigationPerformanceError[] = [];
    await installReadOnlyGuard(page, safetyErrors);
    const inventory = new RequestInventory(page);
    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await waitForUsefulContent(page, "/projects");

    const link = await visibleProjectDetailLink(page);
    const linkHref = (await link.getAttribute("href")) || "";
    const startedAtMs = inventory.startWindow();
    await link.click();
    await expect(page.locator("main").first()).toBeVisible();
    const clickToFeedbackMs = performance.now() - startedAtMs;
    await page.waitForURL(
      (url) => new URL(url).pathname === new URL(linkHref, page.url()).pathname
    );
    const routeStartedAtMs = performance.now();
    await waitForUsefulContent(page, "/projects/:visible-detail");
    const usefulContentAtMs = performance.now();
    await inventory.waitForSettle();

    const classified = classifyNavigationPerformanceResult({
      target: { label: "Visible project detail", href: "/projects/:visible-detail" },
      viewport: {
        name: testInfo.project.name,
        width: testInfo.project.use.viewport?.width || 0,
        height: testInfo.project.use.viewport?.height || 0,
      },
      run: testInfo.retry + 1,
      navigation: { fromPath: "/projects", toPath: routePath(page), linkHref },
      clickToFeedbackMs,
      clickToRouteStartMs: routeStartedAtMs - startedAtMs,
      routeStartToUsefulContentMs: usefulContentAtMs - routeStartedAtMs,
      fullSettleMs: performance.now() - startedAtMs,
      requests: inventory.requestsSince(startedAtMs),
      errors: [...inventory.errorsSince(startedAtMs), ...safetyErrors],
    });

    await writeResult(testInfo, classified.ok ? classified.value : classified);
    expect(classified.ok, "dynamic navigation performance result contract").toBe(true);
    expect(
      safetyErrors,
      productionTarget ? "Production read-only guard" : "read-only probe guard"
    ).toEqual([]);
  });
});
