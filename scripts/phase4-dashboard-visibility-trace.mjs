import { chromium } from "@playwright/test";

const baseURL = process.env.HH_PROFILE_BASE_URL ?? "http://127.0.0.1:3000";
const storageState = process.env.HH_PROFILE_STORAGE_STATE ?? "/private/tmp/hh-phase4-owner.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState,
});
await context.addInitScript(() => {
  const hook = {
    supportsFiber: true,
    inject() {
      return 1;
    },
    onCommitFiberRoot() {
      window.__hhPhase4ReactCommits = (window.__hhPhase4ReactCommits ?? 0) + 1;
    },
    onCommitFiberUnmount() {},
  };
  Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    configurable: true,
    value: hook,
  });
});
const page = await context.newPage();
const requests = [];

page.on("request", (request) => {
  requests.push({
    url: new URL(request.url()).pathname,
    at: performance.now(),
    rsc: request.url().includes("_rsc=") || request.headers().rsc === "1",
  });
});

await page.goto(`${baseURL}/projects`, { waitUntil: "networkidle" });
const link = page.locator('a[href="/dashboard"]:visible').first();
await link.waitFor({ state: "visible" });

if (process.env.HH_TRACE_OBSERVER === "1") {
  await page.evaluate(() => {
    window.__hhTraceObserver = new MutationObserver(() => undefined);
    window.__hhTraceObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

const startedAt = performance.now();
let clickResolvedAt = null;
const clickPromise = link.click().then(() => {
  clickResolvedAt = performance.now() - startedAt;
});
const samples = [];

for (let index = 0; index < 50; index += 1) {
  const state = await page.evaluate(() => {
    const target = document.querySelector('main [aria-label="HH Command Center"]');
    const main = document.querySelector("main");
    if (!(target instanceof HTMLElement)) {
      return {
        href: location.pathname,
        present: false,
        mainText: main?.textContent?.trim().slice(0, 80) ?? null,
      };
    }
    const style = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    return {
      href: location.pathname,
      present: true,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      mainText: main?.textContent?.trim().slice(0, 80) ?? null,
    };
  });
  samples.push({ at: Number((performance.now() - startedAt).toFixed(1)), ...state });
  if (state.present && state.width > 0 && state.height > 0 && clickResolvedAt != null) break;
  await page.waitForTimeout(20);
}

await clickPromise;
console.log(
  JSON.stringify(
    {
      clickResolvedAt: Number(clickResolvedAt.toFixed(1)),
      samples,
      requests: requests.map((request) => ({
        ...request,
        at: Number((request.at - startedAt).toFixed(1)),
      })),
    },
    null,
    2
  )
);

await browser.close();
