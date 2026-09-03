import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";

import { isProductionAppUrl } from "../e2e-supabase-url-guard";
import {
  classifyNavigationPerformanceResult,
  classifyReadOnlyRequest,
  CORE_NAVIGATION_MATRIX,
  resolveVisibleDynamicDetail,
  SETTLE_QUIET_WINDOW_MS,
  SETTLE_TIMEOUT_MS,
  settleDecision,
  type CoreNavigationTarget,
  type NavigationPerformanceError,
  type NavigationPerformanceRequest,
  type NavigationPerformanceUnavailable,
} from "./performance-result";

type ProductionPolicy = "intercept" | "observe";

function currentCommit(): string {
  if (process.env.PERFORMANCE_COMMIT?.trim()) return process.env.PERFORMANCE_COMMIT.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch {
    return "unavailable";
  }
}

function sampleKind(): "cold" | "warm" | "repeat" {
  const value = process.env.PERFORMANCE_SAMPLE?.trim();
  return value === "warm" || value === "repeat" ? value : "cold";
}

function productionPolicy(): ProductionPolicy {
  return process.env.PERFORMANCE_PRODUCTION_POLICY === "observe" ? "observe" : "intercept";
}

function targetPath(href: string, baseURL: string): string {
  return new URL(href, baseURL).pathname;
}

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function localFixturePath(target: CoreNavigationTarget, production: boolean): string | null {
  if (production || target.kind !== "dynamic") return null;
  const key = `PERFORMANCE_LOCAL_${target.label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_PATH`;
  const value = process.env[key]?.trim();
  return value?.startsWith(target.pathPrefix) ? value : null;
}

async function writeArtifact(testInfo: TestInfo, target: string, artifact: unknown): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    testInfo.outputPath(`${safeName(target)}-${testInfo.retry + 1}-${stamp}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );
}

class RequestInventory {
  private readonly requests = new Map<Request, NavigationPerformanceRequest>();
  private readonly errors: Array<{ atMs: number; value: NavigationPerformanceError }> = [];
  private active = false;
  private targetRoutePath = "";
  private startedAtMs = 0;
  private lastActivityAtMs = 0;
  private inFlight = 0;
  private routeStartedAtMs: number | null = null;

  constructor(private readonly page: Page) {
    page.on("request", (request) => {
      const atMs = performance.now();
      this.requests.set(request, {
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        startedAtMs: atMs,
      });
      if (!this.active || atMs < this.startedAtMs) return;
      this.inFlight += 1;
      this.lastActivityAtMs = atMs;
      if (this.routeStartedAtMs === null && this.isTargetRouteRequest(request))
        this.routeStartedAtMs = atMs;
    });
    page.on("response", (response) => {
      const record = this.requests.get(response.request());
      if (record) record.status = response.status();
    });
    page.on("requestfinished", (request) => this.finishRequest(request));
    page.on("requestfailed", (request) => {
      const record = this.requests.get(request);
      if (!record) return;
      record.failure = request.failure()?.errorText || "request failed";
      this.errors.push({
        atMs: performance.now(),
        value: { source: "requestfailed", message: record.failure, url: record.url },
      });
      this.finishRequest(request);
    });
    page.on("pageerror", (error) =>
      this.errors.push({
        atMs: performance.now(),
        value: { source: "pageerror", message: error.message },
      })
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        this.errors.push({
          atMs: performance.now(),
          value: { source: "console", message: message.text() },
        });
    });
  }

  private finishRequest(request: Request) {
    const record = this.requests.get(request);
    if (!record || record.finishedAtMs !== undefined) return;
    record.finishedAtMs = performance.now();
    record.durationMs = record.finishedAtMs - record.startedAtMs;
    if (this.active && record.startedAtMs >= this.startedAtMs) {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.lastActivityAtMs = record.finishedAtMs;
    }
  }

  private isTargetRouteRequest(request: Request): boolean {
    if (!/^(GET|HEAD)$/i.test(request.method())) return false;
    const url = new URL(request.url());
    const isDocumentOrRsc = request.resourceType() === "document" || url.searchParams.has("_rsc");
    return isDocumentOrRsc && url.pathname === this.targetRoutePath;
  }

  start(targetHref: string, baseURL: string): number {
    this.active = true;
    this.startedAtMs = performance.now();
    this.lastActivityAtMs = this.startedAtMs;
    this.targetRoutePath = targetPath(targetHref, baseURL);
    this.inFlight = 0;
    this.routeStartedAtMs = null;
    return this.startedAtMs;
  }

  routeStart(): number | null {
    return this.routeStartedAtMs;
  }
  async waitForRouteStart(): Promise<number | null> {
    const deadlineMs = performance.now() + 30_000;
    while (performance.now() < deadlineMs && this.routeStartedAtMs === null)
      await this.page.waitForTimeout(25);
    return this.routeStartedAtMs;
  }
  requestList(): NavigationPerformanceRequest[] {
    return [...this.requests.values()].filter((request) => request.startedAtMs >= this.startedAtMs);
  }
  errorList(): NavigationPerformanceError[] {
    return this.errors
      .filter((error) => error.atMs >= this.startedAtMs)
      .map((error) => error.value);
  }

  async settle(): Promise<{
    outcome: "settled" | "timeout";
    quietWindowMs: number;
    timeoutMs: number;
    inFlightAtEnd: number;
  }> {
    const deadlineMs = performance.now() + SETTLE_TIMEOUT_MS;
    while (true) {
      const decision = settleDecision({
        nowMs: performance.now(),
        lastActivityAtMs: this.lastActivityAtMs,
        inFlight: this.inFlight,
        deadlineMs,
        quietWindowMs: SETTLE_QUIET_WINDOW_MS,
      });
      if (decision.outcome !== "waiting")
        return {
          outcome: decision.outcome,
          quietWindowMs: SETTLE_QUIET_WINDOW_MS,
          timeoutMs: SETTLE_TIMEOUT_MS,
          inFlightAtEnd: this.inFlight,
        };
      await this.page.waitForTimeout(50);
    }
  }
}

async function visibleLink(page: Page, href: string): Promise<Locator | null> {
  const links = page.locator("a[href]");
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    if ((await link.getAttribute("href")) === href && (await link.isVisible())) return link;
  }
  return null;
}

async function visibleDynamicLink(
  page: Page,
  target: CoreNavigationTarget
): Promise<Locator | NavigationPerformanceUnavailable> {
  if (target.kind !== "dynamic") throw new Error("Expected dynamic navigation target.");
  const links = page.locator("main a[href]");
  const hrefs: string[] = [];
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    if (href && (await link.isVisible())) hrefs.push(href);
  }
  const resolution = resolveVisibleDynamicDetail(target, hrefs);
  if (resolution.status === "unavailable") return resolution;
  return page.locator(`main a[href="${resolution.href}"]`).first();
}

async function installReadOnlyPolicy(
  page: Page,
  production: boolean,
  safetyErrors: NavigationPerformanceError[]
) {
  const policy = production ? productionPolicy() : null;
  const observe = (request: Request) => {
    const decision = classifyReadOnlyRequest(request.method(), request.url());
    if (!decision.allowed)
      safetyErrors.push({
        source: "safety",
        message: `${decision.code}: ${request.method()} ${request.url()}`,
        url: request.url(),
      });
  };
  page.on("request", observe);
  if (policy === "intercept") {
    await page.route("**/*", async (route) => {
      const decision = classifyReadOnlyRequest(route.request().method(), route.request().url());
      if (!decision.allowed) return route.abort("blockedbyclient");
      return route.continue();
    });
  }
  return {
    cacheMode:
      policy === "intercept"
        ? ("disabled-by-production-interception" as const)
        : policy === "observe"
          ? ("observation-only" as const)
          : ("native" as const),
  };
}

async function freshFeedback(
  page: Page,
  target: CoreNavigationTarget,
  link: Locator
): Promise<number> {
  if (target.kind === "static") {
    await expect(link).toHaveAttribute("aria-current", "page");
    return performance.now();
  }
  await expect(page.locator(target.usefulContentLocator).first()).toBeVisible();
  return performance.now();
}

async function artifactMetadata(
  page: Page,
  baseURL: string,
  production: boolean,
  cacheMode: "native" | "disabled-by-production-interception" | "observation-only"
) {
  return {
    environment: production ? "production" : "local",
    baseURL,
    browser: await page.evaluate(() => navigator.userAgent),
    commit: currentCommit(),
    timestamp: new Date().toISOString(),
    cacheMode,
    sample: sampleKind(),
  };
}

async function recordNavigation(page: Page, testInfo: TestInfo, target: CoreNavigationTarget) {
  const baseURL = String(testInfo.project.use.baseURL);
  const production = isProductionAppUrl(baseURL);
  const safetyErrors: NavigationPerformanceError[] = [];
  const policy = await installReadOnlyPolicy(page, production, safetyErrors);
  const inventory = new RequestInventory(page);
  const startHref = target.kind === "dynamic" ? target.discoveryParent : "/dashboard";
  await page.goto(startHref, { waitUntil: "domcontentloaded" });
  const fixturePath = localFixturePath(target, production);
  if (fixturePath) {
    await page.goto(fixturePath, { waitUntil: "domcontentloaded" });
    await writeArtifact(testInfo, target.label, {
      status: "unavailable",
      blocker: {
        code: "ROUTE_START_NOT_OBSERVED",
        target: target.label,
        discoveryParent: target.kind === "dynamic" ? target.discoveryParent : undefined,
      },
      metadata: await artifactMetadata(page, baseURL, production, policy.cacheMode),
      note: "Direct local fixture paths are discovery-only and are not click timing samples.",
    });
    return;
  }
  const link =
    target.kind === "dynamic"
      ? await visibleDynamicLink(page, target)
      : await visibleLink(page, target.href);
  if (!link || "status" in link) {
    const unavailable =
      link && "status" in link
        ? link
        : {
            status: "unavailable" as const,
            blocker: { code: "NO_VISIBLE_DETAIL_LINK" as const, target: target.label },
          };
    await writeArtifact(testInfo, target.label, {
      ...unavailable,
      metadata: await artifactMetadata(page, baseURL, production, policy.cacheMode),
    });
    return;
  }
  const fromPath = new URL(page.url()).pathname;
  const linkHref = (await link.getAttribute("href")) || target.href;
  const clickStartedAtMs = inventory.start(linkHref, baseURL);
  await link.click();
  const routeStartedAtMs = await inventory.waitForRouteStart();
  const feedbackAtMs = await freshFeedback(page, target, link);
  await expect(page.locator(target.usefulContentLocator).first()).toBeVisible();
  const usefulContentAtMs = performance.now();
  if (routeStartedAtMs === null) {
    const unavailable: NavigationPerformanceUnavailable = {
      status: "unavailable",
      blocker: {
        code: "ROUTE_START_NOT_OBSERVED",
        target: target.label,
        discoveryParent: target.kind === "dynamic" ? target.discoveryParent : undefined,
      },
    };
    await writeArtifact(testInfo, target.label, {
      ...unavailable,
      metadata: await artifactMetadata(page, baseURL, production, policy.cacheMode),
    });
    return;
  }
  const settle = await inventory.settle();
  const classified = classifyNavigationPerformanceResult({
    target: { label: target.label, href: target.href },
    viewport: {
      name: testInfo.project.name,
      width: testInfo.project.use.viewport?.width || 0,
      height: testInfo.project.use.viewport?.height || 0,
    },
    run: testInfo.retry + 1,
    navigation: { fromPath, toPath: new URL(page.url()).pathname, linkHref },
    metadata: await artifactMetadata(page, baseURL, production, policy.cacheMode),
    clickToFeedbackMs: feedbackAtMs - clickStartedAtMs,
    clickToRouteStartMs: routeStartedAtMs - clickStartedAtMs,
    routeStartToUsefulContentMs: usefulContentAtMs - routeStartedAtMs,
    fullSettleMs: performance.now() - clickStartedAtMs,
    settle,
    requests: inventory.requestList(),
    errors: [...inventory.errorList(), ...safetyErrors],
  });
  await writeArtifact(testInfo, target.label, classified.ok ? classified.value : classified);
  expect(classified.ok, `${target.label} result contract`).toBe(true);
  expect(safetyErrors, `${production ? "Production" : "Local"} read-only policy`).toEqual([]);
}

test.describe("HH system navigation performance", () => {
  for (const target of CORE_NAVIGATION_MATRIX)
    test(`measures ${target.label}`, ({ page }, testInfo) =>
      recordNavigation(page, testInfo, target));

  test("executes the approved visible-link workflow", async ({ page }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const production = isProductionAppUrl(baseURL);
    const safetyErrors: NavigationPerformanceError[] = [];
    const policy = await installReadOnlyPolicy(page, production, safetyErrors);
    const workflow = CORE_NAVIGATION_MATRIX.filter((target) => target.workflow);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    for (const target of workflow.slice(1)) {
      const link =
        target.kind === "dynamic"
          ? await visibleDynamicLink(page, target)
          : await visibleLink(page, target.href);
      if (!link || "status" in link) {
        await writeArtifact(testInfo, `workflow-${target.label}`, {
          ...(link || {
            status: "unavailable",
            blocker: { code: "NO_VISIBLE_DETAIL_LINK", target: target.label },
          }),
          metadata: await artifactMetadata(page, baseURL, production, policy.cacheMode),
        });
        return;
      }
      const method = await link.evaluate((element) =>
        element.tagName === "A" ? "GET" : "NON_READ"
      );
      expect(method, `${target.label} workflow link`).toBe("GET");
      await link.click();
      await expect(page.locator(target.usefulContentLocator).first()).toBeVisible();
    }
    expect(
      safetyErrors,
      `${production ? "Production" : "Local"} workflow read-only policy`
    ).toEqual([]);
  });
});
