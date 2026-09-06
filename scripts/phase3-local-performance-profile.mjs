import { chromium } from "@playwright/test";

const baseURL = "http://localhost:3000";
const storageState = "/private/tmp/hh-phase3-owner.json";
const projectId = "11111111-1111-1111-1111-111111111111";
const rounds = 3;

const routes = [
  {
    name: "Dashboard",
    source: "/projects",
    href: "/dashboard",
    useful: 'main [aria-label="HH Command Center"]',
  },
  {
    name: "Projects",
    source: "/dashboard",
    href: "/projects",
    useful: 'main h1:has-text("Projects"):visible',
  },
  {
    name: "Project Detail",
    source: "/projects",
    href: `/projects/${projectId}`,
    selector:
      'a[href^="/projects/"]:visible:not([href="/projects/new"]), tr[role="link"][aria-label^="Open project"]:visible',
    useful: 'main h1:has-text("[E2E] Seed — HH Unified"):visible',
  },
  {
    name: "Revenue / AR",
    source: "/financial",
    href: "/financial/ar",
    useful: '[data-testid="ar-workspace-summary"]',
  },
  {
    name: "Workers",
    source: "/dashboard",
    href: "/workers",
    useful: 'main :text-is("Worker Center"):visible',
  },
];

const viewports = [
  { width: 1440, height: 900 },
  { width: 820, height: 900 },
  { width: 390, height: 844 },
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round(value) {
  return Number(value.toFixed(1));
}

function safePath(url) {
  try {
    return new URL(url).pathname.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[id]"
    );
  } catch {
    return "unknown";
  }
}

const browser = await chromium.launch({ headless: true });
const samples = [];
let consoleErrors = 0;
let pageErrors = 0;
let non2xx = 0;

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, storageState });
  const page = await context.newPage();
  let capture = null;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors += 1;
  });
  page.on("pageerror", () => {
    pageErrors += 1;
  });
  page.on("request", (request) => {
    if (!capture) return;
    capture.lastNetworkChange = Date.now();
    capture.requests.push({
      request,
      startedAt: Date.now(),
      path: safePath(request.url()),
      type: request.resourceType(),
      rsc: request.url().includes("_rsc=") || request.headers().rsc === "1",
      api: safePath(request.url()).startsWith("/api/"),
      supabase: /\/rest\/v1\/|\/auth\/v1\//.test(request.url()),
    });
  });
  page.on("response", async (response) => {
    if (!capture) return;
    capture.lastNetworkChange = Date.now();
    const entry = capture.requests.find((item) => item.request === response.request());
    if (!entry) return;
    try {
      await response.finished();
    } catch {
      // requestfailed records aborted/error requests separately
    }
    entry.finishedAt = Date.now();
    entry.status = response.status();
    entry.serverTiming = response.headers()["server-timing"] ?? null;
    if (response.status() >= 400) non2xx += 1;
  });
  page.on("requestfailed", (request) => {
    if (!capture) return;
    capture.lastNetworkChange = Date.now();
    const entry = capture.requests.find((item) => item.request === request);
    if (entry) entry.failed = request.failure()?.errorText ?? "failed";
  });

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (const route of routes) {
      console.error(`profiling ${viewport.width} round ${roundIndex + 1}: ${route.name}`);
      await page.goto(`${baseURL}${route.source}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      if (route.name === "Revenue / AR" && viewport.width < 640) {
        await page.locator('button[aria-label="Open menu"]:visible').first().click();
        await page
          .locator('a[href="/financial/ar"]:visible')
          .first()
          .waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(350);
      }
      const link = page.locator(route.selector ?? `a[href="${route.href}"]:visible`).first();
      await link.waitFor({ state: "visible", timeout: 15_000 });

      capture = { requests: [], lastNetworkChange: Date.now() };
      await page.evaluate(() => {
        performance.clearResourceTimings();
        window.__hhPhase3ClickStart = performance.now();
        window.__hhPhase3FirstMutation = null;
        window.__hhPhase3LastMutation = window.__hhPhase3ClickStart;
        window.__hhPhase3Observer?.disconnect();
        window.__hhPhase3Observer = new MutationObserver(() => {
          window.__hhPhase3LastMutation = performance.now();
          if (window.__hhPhase3FirstMutation == null) {
            window.__hhPhase3FirstMutation = performance.now();
          }
        });
        window.__hhPhase3Observer.observe(document.body, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
      const wallStartedAt = Date.now();
      await link.click();
      await page.locator(route.useful).first().waitFor({ state: "visible", timeout: 30_000 });
      const fuc = Date.now() - wallStartedAt;
      const criticalRequests = [...capture.requests];
      await page.evaluate(() => {
        window.__hhPhase3Observer?.disconnect();
        window.__hhPhase3LastMutation = performance.now();
        const main = document.querySelector("main");
        if (main) {
          window.__hhPhase3Observer = new MutationObserver(() => {
            window.__hhPhase3LastMutation = performance.now();
          });
          window.__hhPhase3Observer.observe(main, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
          });
        }
      });
      const settleDeadline = Date.now() + 8_000;
      while (Date.now() < settleDeadline) {
        const domQuiet = await page.evaluate(() => {
          const lastMutation = window.__hhPhase3LastMutation ?? window.__hhPhase3ClickStart;
          return typeof lastMutation === "number" && performance.now() - lastMutation >= 400;
        });
        const pendingRequest = criticalRequests.some(
          (entry) => entry.finishedAt == null && entry.failed == null
        );
        if (domQuiet && !pendingRequest) break;
        await page.waitForTimeout(25);
      }
      const settled = Date.now() - wallStartedAt;
      const browserTiming = await page.evaluate(() => {
        const clickStart = window.__hhPhase3ClickStart;
        const firstMutation = window.__hhPhase3FirstMutation;
        window.__hhPhase3Observer?.disconnect();
        const resources = performance.getEntriesByType("resource");
        const rsc = resources.filter(
          (entry) => entry.name.includes("_rsc=") || entry.name.includes("text/x-component")
        );
        return {
          feedback:
            typeof firstMutation === "number" && typeof clickStart === "number"
              ? firstMutation - clickStart
              : null,
          rscStart:
            rsc.length > 0 && typeof clickStart === "number"
              ? Math.min(...rsc.map((entry) => entry.startTime)) - clickStart
              : null,
        };
      });

      const observed = capture.requests.filter((entry) => entry.startedAt >= wallStartedAt - 5);
      const complete = observed.filter(
        (entry) => typeof entry.finishedAt === "number" && entry.finishedAt >= entry.startedAt
      );
      const slowest = complete.sort(
        (a, b) => b.finishedAt - b.startedAt - (a.finishedAt - a.startedAt)
      )[0];
      samples.push({
        viewport: viewport.width,
        route: route.name,
        feedback: round(browserTiming.feedback ?? fuc),
        rscStart: round(browserTiming.rscStart ?? 0),
        fuc: round(fuc),
        settled: round(settled),
        requests: observed.length,
        rsc: observed.filter((entry) => entry.rsc).length,
        api: observed.filter((entry) => entry.api).length,
        supabase: observed.filter((entry) => entry.supabase).length,
        duplicates: observed.length - new Set(observed.map((entry) => entry.path)).size,
        aborted: observed.filter((entry) => entry.failed?.includes("ERR_ABORTED")).length,
        slowestMs: slowest ? round(slowest.finishedAt - slowest.startedAt) : 0,
        slowestPath: slowest?.path ?? null,
        serverTiming: complete.map((entry) => entry.serverTiming).filter(Boolean),
      });
      capture = null;
    }
  }
  await context.close();
}

await browser.close();

const aggregate = [];
for (const viewport of viewports) {
  for (const route of routes) {
    const rows = samples.filter(
      (sample) => sample.viewport === viewport.width && sample.route === route.name
    );
    aggregate.push({
      viewport: viewport.width,
      route: route.name,
      feedbackMedian: round(median(rows.map((row) => row.feedback))),
      rscStartMedian: round(median(rows.map((row) => row.rscStart))),
      fucMedian: round(median(rows.map((row) => row.fuc))),
      settleMedian: round(median(rows.map((row) => row.settled))),
      requestMedian: median(rows.map((row) => row.requests)),
      rscMedian: median(rows.map((row) => row.rsc)),
      apiMedian: median(rows.map((row) => row.api)),
      supabaseMedian: median(rows.map((row) => row.supabase)),
      duplicateMedian: median(rows.map((row) => row.duplicates)),
      abortedMedian: median(rows.map((row) => row.aborted)),
      slowestRequestMedian: round(median(rows.map((row) => row.slowestMs))),
      slowestPath: rows.sort((a, b) => b.slowestMs - a.slowestMs)[0]?.slowestPath ?? null,
      serverTiming: rows.flatMap((row) => row.serverTiming).slice(0, 3),
    });
  }
}

console.log(
  JSON.stringify(
    {
      aggregate,
      totals: { consoleErrors, pageErrors, non2xx, samples: samples.length },
    },
    null,
    2
  )
);
