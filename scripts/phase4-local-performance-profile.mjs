import { chromium } from "@playwright/test";

const baseURL = process.env.HH_PROFILE_BASE_URL ?? "http://127.0.0.1:3000";
const storageState =
  process.env.HH_PROFILE_STORAGE_STATE ?? "/private/tmp/hh-local-prod-owner-desktop.json";
const projectId = "11111111-1111-1111-1111-111111111111";
const rounds = Number(process.env.HH_PROFILE_ROUNDS ?? "3");
const routeFilter = new Set(
  (process.env.HH_PROFILE_ROUTES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const detailRouteFilter = new Set(
  (process.env.HH_PROFILE_DETAIL_ROUTE ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

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
    name: "Estimate Detail",
    source: "/estimates",
    selector:
      'a[href^="/estimates/"]:visible:not([href="/estimates/new"]):not([href^="/estimates/templates"])',
    useful: '[data-testid="estimate-detail-header-actions"]',
  },
  {
    name: "Revenue / AR",
    source: "/dashboard",
    href: "/financial/ar",
    section: "FINANCIAL",
    useful: '[data-testid="ar-workspace-summary"]',
  },
  {
    name: "Workers",
    source: "/dashboard",
    href: "/workers",
    section: "DIRECTORY",
    useful: 'main :text-is("Worker Center"):visible',
  },
  {
    name: "Expenses",
    source: "/dashboard",
    href: "/financial/expenses",
    section: "FINANCIAL",
    useful: 'main h1:has-text("Expenses"):visible',
  },
  {
    name: "Schedule",
    source: "/dashboard",
    href: "/schedule",
    section: "PROJECTS",
    useful: 'main :text-is("Schedule"):visible',
  },
];

const viewports = [
  { width: 1440, height: 900 },
  { width: 820, height: 900 },
  { width: 390, height: 844 },
];
const selectedRoutes =
  routeFilter.size > 0 ? routes.filter((route) => routeFilter.has(route.name)) : routes;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const rounded = (value) => (typeof value === "number" ? Number(value.toFixed(1)) : null);

function normalizedPath(url) {
  try {
    return new URL(url).pathname.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[id]"
    );
  } catch {
    return "unknown";
  }
}

async function openNavigationIfNeeded(page, locator, section) {
  if (await locator.isVisible().catch(() => false)) return;
  const menuButton = page.locator('button[aria-label="Open menu"]:visible').first();
  await menuButton.waitFor({ state: "visible", timeout: 15_000 });
  await menuButton.click();
  if (section && !(await locator.isVisible().catch(() => false))) {
    const sectionButton = page
      .locator('[role="dialog"] button:visible')
      .filter({ hasText: section })
      .first();
    await sectionButton.click();
  }
  await locator.waitFor({ state: "visible", timeout: 15_000 });
}

const browser = await chromium.launch({ headless: true });
const samples = [];
let consoleErrors = 0;
let pageErrors = 0;
let non2xx = 0;

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, storageState });
  await context.addInitScript(() => {
    const hook = {
      supportsFiber: true,
      inject() {
        return 1;
      },
      onCommitFiberRoot() {
        window.__hhPhase4ReactCommits = (window.__hhPhase4ReactCommits ?? 0) + 1;
        if (window.__hhPhase4FirstCommit == null) {
          window.__hhPhase4FirstCommit = performance.now();
        }
      },
      onCommitFiberUnmount() {},
    };
    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      configurable: true,
      value: hook,
    });
  });
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
    const path = normalizedPath(request.url());
    capture.requests.push({
      request,
      startedAt: Date.now(),
      path,
      type: request.resourceType(),
      rsc: request.url().includes("_rsc=") || request.headers().rsc === "1",
      api: path.startsWith("/api/"),
      supabase: /\/rest\/v1\/|\/auth\/v1\//.test(request.url()),
    });
  });
  page.on("response", async (response) => {
    if (!capture) return;
    const entry = capture.requests.find((item) => item.request === response.request());
    if (!entry) return;
    try {
      await response.finished();
    } catch {
      // requestfailed records the request outcome.
    }
    entry.finishedAt = Date.now();
    entry.status = response.status();
    entry.serverTiming = response.headers()["server-timing"] ?? null;
    const length = response.headers()["content-length"];
    entry.payloadBytes = length ? Number(length) : null;
    if (response.status() >= 400) non2xx += 1;
  });
  page.on("requestfailed", (request) => {
    if (!capture) return;
    const entry = capture.requests.find((item) => item.request === request);
    if (entry) entry.failed = request.failure()?.errorText ?? "failed";
  });

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (const route of selectedRoutes) {
      console.error(`phase4 ${viewport.width} round ${roundIndex + 1}: ${route.name}`);
      await page.goto(`${baseURL}${route.source}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

      const link = page.locator(route.selector ?? `a[href="${route.href}"]:visible`).first();
      await openNavigationIfNeeded(page, link, route.section);
      await link.waitFor({ state: "visible", timeout: 15_000 }).catch(async (error) => {
        const snapshot = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        throw new Error(
          `Navigation target unavailable for ${route.name} at ${page.url()}: ${snapshot.slice(0, 240)}`,
          { cause: error }
        );
      });

      capture = { requests: [] };
      await page.evaluate(() => {
        performance.clearResourceTimings();
        window.__hhPhase4ClickStart = performance.now();
        window.__hhPhase4FirstMutation = null;
        window.__hhPhase4LastMutation = window.__hhPhase4ClickStart;
        window.__hhPhase4ReactCommits = 0;
        window.__hhPhase4FirstCommit = null;
        window.__hhPhase4Observer?.disconnect();
        window.__hhPhase4Observer = new MutationObserver((_records, observer) => {
          const now = performance.now();
          window.__hhPhase4LastMutation = now;
          if (window.__hhPhase4FirstMutation == null) {
            window.__hhPhase4FirstMutation = now;
          }
          observer.disconnect();
        });
        window.__hhPhase4Observer.observe(document.body, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
      });

      const wallStartedAt = Date.now();
      if (process.env.HH_PROFILE_NATIVE_CLICK === "1") {
        await link.evaluate((element) => element.click());
      } else {
        await link.click();
      }
      await page.waitForFunction(
        (routeName) => {
          let candidates = [];
          if (routeName === "Dashboard") {
            candidates = [...document.querySelectorAll('main [aria-label="HH Command Center"]')];
          } else if (routeName === "Estimate Detail") {
            candidates = [
              ...document.querySelectorAll('[data-testid="estimate-detail-header-actions"]'),
            ];
          } else if (routeName === "Revenue / AR") {
            candidates = [...document.querySelectorAll('[data-testid="ar-workspace-summary"]')];
          } else {
            const expectedText = {
              Projects: "Projects",
              "Project Detail": "[E2E] Seed — HH Unified",
              Workers: "Worker Center",
              Expenses: "Expenses",
              Schedule: "Schedule",
            }[routeName];
            candidates = [...document.querySelectorAll("main h1, main h2")].filter((element) =>
              element.textContent?.includes(expectedText)
            );
          }
          return candidates.some((element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity) > 0 &&
              rect.width > 0 &&
              rect.height > 0
            );
          });
        },
        route.name,
        { polling: "raf", timeout: 30_000 }
      );
      const fuc = await page.evaluate(
        () => performance.now() - (window.__hhPhase4ClickStart ?? performance.now())
      );
      const criticalRequests = [...capture.requests];

      await page.evaluate(() => {
        window.__hhPhase4Observer?.disconnect();
        window.__hhPhase4LastMutation = performance.now();
        const main = document.querySelector("main");
        if (!main) return;
        window.__hhPhase4Observer = new MutationObserver(() => {
          window.__hhPhase4LastMutation = performance.now();
        });
        window.__hhPhase4Observer.observe(main, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
        });
      });

      const settleDeadline = Date.now() + 8_000;
      while (Date.now() < settleDeadline) {
        const domQuiet = await page.evaluate(() => {
          const lastMutation = window.__hhPhase4LastMutation ?? window.__hhPhase4ClickStart;
          return typeof lastMutation === "number" && performance.now() - lastMutation >= 400;
        });
        const pending = criticalRequests.some(
          (entry) => entry.finishedAt == null && entry.failed == null
        );
        if (domQuiet && !pending) break;
        await page.waitForTimeout(25);
      }
      const settled = Date.now() - wallStartedAt;

      const clientTiming = await page.evaluate(() => ({
        feedback:
          typeof window.__hhPhase4FirstMutation === "number"
            ? window.__hhPhase4FirstMutation - window.__hhPhase4ClickStart
            : null,
        firstCommit:
          typeof window.__hhPhase4FirstCommit === "number"
            ? window.__hhPhase4FirstCommit - window.__hhPhase4ClickStart
            : null,
        commits: window.__hhPhase4ReactCommits ?? 0,
      }));
      const observed = capture.requests.filter((entry) => entry.startedAt >= wallStartedAt - 5);
      const complete = observed.filter(
        (entry) => typeof entry.finishedAt === "number" && entry.finishedAt >= entry.startedAt
      );
      const rscRequests = observed.filter((entry) => entry.rsc);
      const slowest = [...complete].sort(
        (a, b) => b.finishedAt - b.startedAt - (a.finishedAt - a.startedAt)
      )[0];
      const pathCounts = new Map();
      for (const entry of observed)
        pathCounts.set(entry.path, (pathCounts.get(entry.path) ?? 0) + 1);

      samples.push({
        viewport: viewport.width,
        route: route.name,
        feedback: rounded(clientTiming.feedback),
        rscStart:
          rscRequests.length > 0
            ? rounded(Math.min(...rscRequests.map((entry) => entry.startedAt)) - wallStartedAt)
            : null,
        firstCommit: rounded(clientTiming.firstCommit),
        fuc: rounded(fuc),
        settled: rounded(settled),
        requests: observed.length,
        rsc: rscRequests.length,
        api: observed.filter((entry) => entry.api).length,
        supabase: observed.filter((entry) => entry.supabase).length,
        duplicates: [...pathCounts.values()].reduce(
          (sum, count) => sum + Math.max(0, count - 1),
          0
        ),
        aborted: observed.filter((entry) => entry.failed?.includes("ERR_ABORTED")).length,
        commits: clientTiming.commits,
        payloadBytes: complete.reduce((sum, entry) => sum + (entry.payloadBytes ?? 0), 0),
        slowestMs: slowest ? rounded(slowest.finishedAt - slowest.startedAt) : 0,
        slowestPath: slowest?.path ?? null,
        serverTiming: complete.map((entry) => entry.serverTiming).filter(Boolean),
      });
      if (detailRouteFilter.has(route.name)) {
        console.error(
          JSON.stringify(
            observed.map((entry) => ({
              path: entry.path,
              type: entry.type,
              rsc: entry.rsc,
              api: entry.api,
              supabase: entry.supabase,
              status: entry.status,
              failed: entry.failed ?? null,
              serverTiming: entry.serverTiming ?? null,
            }))
          )
        );
      }
      capture = null;
    }
  }
  await context.close();
}

await browser.close();

const aggregate = [];
for (const viewport of viewports) {
  for (const route of selectedRoutes) {
    const rows = samples.filter(
      (sample) => sample.viewport === viewport.width && sample.route === route.name
    );
    const numericMedian = (key) => {
      const values = rows.map((row) => row[key]).filter((value) => typeof value === "number");
      return values.length > 0 ? rounded(median(values)) : null;
    };
    aggregate.push({
      viewport: viewport.width,
      route: route.name,
      feedbackMedian: numericMedian("feedback"),
      rscStartMedian: numericMedian("rscStart"),
      firstCommitMedian: numericMedian("firstCommit"),
      fucMedian: numericMedian("fuc"),
      settleMedian: numericMedian("settled"),
      requestMedian: numericMedian("requests"),
      rscMedian: numericMedian("rsc"),
      apiMedian: numericMedian("api"),
      supabaseMedian: numericMedian("supabase"),
      duplicateMedian: numericMedian("duplicates"),
      abortedMedian: numericMedian("aborted"),
      reactCommitMedian: numericMedian("commits"),
      payloadBytesMedian: numericMedian("payloadBytes"),
      slowestRequestMedian: numericMedian("slowestMs"),
      slowestPath: [...rows].sort((a, b) => b.slowestMs - a.slowestMs)[0]?.slowestPath ?? null,
      serverTiming: rows.flatMap((row) => row.serverTiming).slice(0, 3),
    });
  }
}

const result = {
  aggregate,
  totals: { consoleErrors, pageErrors, non2xx, samples: samples.length },
};

if (process.env.HH_PROFILE_COMPACT === "1") {
  console.log(
    [
      "viewport\troute\tfeedback\trscStart\tcommitAt\tFUC\tsettle\trequests\tRSC\tAPI\tSupabase\tdupes\taborts\tcommits\tpayload\tslowest",
      ...aggregate.map((row) =>
        [
          row.viewport,
          row.route,
          row.feedbackMedian,
          row.rscStartMedian,
          row.firstCommitMedian,
          row.fucMedian,
          row.settleMedian,
          row.requestMedian,
          row.rscMedian,
          row.apiMedian,
          row.supabaseMedian,
          row.duplicateMedian,
          row.abortedMedian,
          row.reactCommitMedian,
          row.payloadBytesMedian,
          `${row.slowestRequestMedian}:${row.slowestPath ?? ""}`,
        ].join("\t")
      ),
      `totals\t${JSON.stringify(result.totals)}`,
    ].join("\n")
  );
} else {
  console.log(JSON.stringify(result, null, 2));
}
