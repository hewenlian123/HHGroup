import { test, expect, type Page, type Request } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loginAsE2EOwner, gotoWithE2EAuth } from "./e2e-auth-owner";

test.use({ actionTimeout: 15000 });
const performanceEvidence = new WeakMap<Page, unknown>();
const browserDiagnostics = new WeakMap<Page, { errors: string[]; console: string[] }>();
test.beforeEach(async ({ page }) => {
  const diagnostics = { errors: [] as string[], console: [] as string[] };
  browserDiagnostics.set(page, diagnostics);
  page.on("pageerror", (error) => diagnostics.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.console.push(message.text());
  });
});
test.afterEach(async ({ page }, info) => {
  const diagnostics = browserDiagnostics.get(page)!;
  if (performanceEvidence.has(page))
    await info.attach("performance-partial", {
      body: JSON.stringify(performanceEvidence.get(page)),
      contentType: "application/json",
    });
  await info.attach("browser-diagnostics", {
    body: JSON.stringify(diagnostics),
    contentType: "application/json",
  });
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.console).toEqual([]);
});

const project = "11111111-1111-1111-1111-111111111111";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
function localDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(["localhost", "127.0.0.1"]).toContain(new URL(url).hostname);
  return createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
test("Measure Expense Operations critical interactions and responsive Review", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  localDb();
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.E2E_BASE_URL!).hostname);
  await page.setViewportSize({ width: 1440, height: 900 });
  const { getE2EOwnerCredentials } = await import("./e2e-auth-owner");
  await loginAsE2EOwner(page, "/financial/inbox");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  expect((await client.auth.signInWithPassword(await getE2EOwnerCredentials())).error).toBeNull();
  const paymentAccount = await client
    .from("payment_accounts")
    .select("id")
    .eq("name", "Cash")
    .single();
  expect(paymentAccount.error).toBeNull();
  expect(paymentAccount.data?.id).toBeTruthy();
  const prefix = `PW PERF ${randomUUID().slice(0, 6)}`;
  const ids: string[] = [];
  for (let i = 0; i < 22; i++) {
    const created = await client.rpc("create_expense_atomic", {
      p_idempotency_key: randomUUID(),
      p_payload: {
        expenseDate: "2026-09-14",
        vendorName: `${prefix} ${i}`,
        paymentMethod: "Cash",
        paymentAccountId: paymentAccount.data!.id,
        sourceType: "company",
        status: "needs_review",
        groups: [
          { projectId: project, lines: [{ projectId: project, category: "Other", amount: 6.66 }] },
        ],
      },
    });
    expect(created.error).toBeNull();
    ids.push(created.data.expense_id);
  }
  const metrics: Record<string, number[]> = {
    rowSelect: [],
    nextExpense: [],
    approveAndNext: [],
    ledgerQuickLook: [],
    intakePagination: [],
    evidenceSwitch: [],
  };
  const requests: Array<{
    method: string;
    path: string;
    resource: string;
    sample: string;
    durationMs?: number;
    responseBodyBytes?: number;
    outcome?: "finished" | "failed";
    failure?: string;
  }> = [];
  const pending: Promise<void>[] = [];
  let sample = "setup";
  const requestEntries = new WeakMap<Request, (typeof requests)[number]>();
  page.on("request", (r) => {
    const entry = {
      method: r.method(),
      path: new URL(r.url()).pathname,
      resource: r.resourceType(),
      sample,
    };
    requests.push(entry);
    requestEntries.set(r, entry);
  });
  page.on("requestfailed", (r) => {
    const entry = requestEntries.get(r);
    if (entry) Object.assign(entry, { outcome: "failed", failure: r.failure()?.errorText });
  });
  page.on("requestfinished", (r) => {
    const entry = requestEntries.get(r);
    if (!entry) return;
    Object.assign(entry, { outcome: "finished", durationMs: r.timing().responseEnd });
    pending.push(
      r
        .sizes()
        .then((sizes) => {
          entry.responseBodyBytes = sizes.responseBodySize;
        })
        .catch((error) => {
          entry.failure = String(error);
        })
    );
  });
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(5000);
    const observations = {
      shifts: [] as { value: number; recentInput: boolean; time: number }[],
      longTasks: [] as { duration: number; time: number }[],
      scrollCalls: [] as { time: number; tag: string; behavior: string; stack: string }[],
    };
    Object.assign(window, { __expensePerf: observations });
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
      observations.scrollCalls.push({
        time: performance.now(),
        tag: this.getAttribute("data-expense-id") ?? this.id ?? this.tagName,
        behavior: typeof options === "object" ? (options.behavior ?? "auto") : "auto",
        stack: new Error().stack ?? "",
      });
      return scrollIntoView.call(this, options);
    };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
        observations.shifts.push({
          value: shift.value,
          recentInput: shift.hadRecentInput,
          time: e.startTime,
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        observations.longTasks.push({ duration: e.duration, time: e.startTime });
    }).observe({ type: "longtask", buffered: true });
  });
  const profiles: unknown[] = [];
  const browserTimings: Record<string, number[]> = {};
  performanceEvidence.set(page, {
    metrics,
    browserTimings,
    requests,
    profiles,
    fixture: { prefix, expenseIds: ids, retainedForCertification: true },
  });
  async function measure(key: string, action: () => Promise<void>, ready: () => Promise<void>) {
    sample = `${key}:${metrics[key].length + 1}`;
    const requestStart = requests.length;
    await page.evaluate((key) => {
      const vendor = () =>
        document.querySelector<HTMLInputElement>("#edit-expense-vendor-input")?.value;
      const evidence = () =>
        document.querySelector<HTMLImageElement>("[data-attachment-preview-modal] img");
      const pagination = () =>
        document.querySelector('nav[aria-label="Intake pagination"]')?.textContent;
      const initial = {
        vendor: vendor(),
        image: evidence()?.src,
        url: location.href,
        pagination: pagination(),
      };
      let clicked = 0;
      document.addEventListener(
        "click",
        () => {
          clicked = performance.now();
        },
        { capture: true, once: true }
      );
      const painted = new Promise<number>((resolve) => {
        const tick = () => {
          const changed =
            key === "evidenceSwitch"
              ? evidence()?.src !== initial.image &&
                evidence()?.complete &&
                !!evidence()?.naturalWidth
              : key === "intakePagination"
                ? pagination() !== initial.pagination
                : key === "ledgerQuickLook"
                  ? location.href !== initial.url &&
                    !!document.querySelector('[aria-label="Review and audit"]') &&
                    !document
                      .querySelector('[aria-label="Review and audit"]')
                      ?.textContent?.includes("Loading…")
                  : vendor() !== initial.vendor;
          if (clicked && changed)
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(performance.now() - clicked))
            );
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      Object.assign(window, { __expensePainted: painted });
    }, key);
    const start = await page.evaluate(() => performance.now());
    await action();
    await ready();
    const browserDuration = await page.evaluate(
      () => (window as unknown as { __expensePainted: Promise<number> }).__expensePainted
    );
    (browserTimings[key] ??= []).push(browserDuration);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    const duration = (await page.evaluate(() => performance.now())) - start;
    metrics[key].push(duration);
    const browser = await page.evaluate((since) => {
      const observations = (
        window as unknown as {
          __expensePerf: {
            shifts: { value: number; recentInput: boolean; time: number }[];
            longTasks: { duration: number; time: number }[];
            scrollCalls: { time: number; tag: string; behavior: string; stack: string }[];
          };
        }
      ).__expensePerf;
      return {
        shifts: observations.shifts.filter((e) => e.time >= since),
        scrollCalls: observations.scrollCalls.filter((e) => e.time >= since),
        longTasks: observations.longTasks.filter((e) => e.time >= since),
        resources: performance
          .getEntriesByType("resource")
          .filter((e) => e.startTime >= since)
          .map((e) => {
            const r = e as PerformanceResourceTiming;
            return {
              path: new URL(r.name).pathname,
              type: r.initiatorType,
              duration: r.duration,
              transferBytes: r.transferSize,
              decodedBytes: r.decodedBodySize,
            };
          }),
      };
    }, start);
    profiles.push({ sample, duration, browserDuration, ...browser });
    expect(
      requests.slice(requestStart).filter((r) => r.resource === "document"),
      `${sample} must not reload the document`
    ).toEqual([]);
    sample = "between-interactions";
  }
  await gotoWithE2EAuth(page, "/financial/inbox?date_kind=all");
  await page.getByLabel("Search expenses", { exact: true }).filter({ visible: true }).fill(prefix);
  await page.locator(`[data-expense-id="${ids[0]}"]`).first().click();
  await page
    .locator("#expense-inspection-attachments input[type=file]")
    .first()
    .setInputFiles([
      { name: "cert-evidence-front.png", mimeType: "image/png", buffer: png },
      { name: "cert-evidence-back.png", mimeType: "image/png", buffer: png },
    ]);
  await expect(page.getByText("2 receipts attached", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Full view", exact: true }).click();
  const viewer = page.locator("[data-attachment-preview-modal]");
  await expect(viewer).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const before = await viewer.locator("img").first().getAttribute("src");
    await measure(
      "evidenceSwitch",
      () =>
        viewer
          .getByRole("button", {
            name: i % 2 ? "Previous attachment" : "Next attachment",
            exact: true,
          })
          .click(),
      async () => {
        await expect(viewer.locator("img").first()).not.toHaveAttribute("src", before!);
        await expect
          .poll(() =>
            viewer
              .locator("img")
              .first()
              .evaluate(
                (img) =>
                  (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0
              )
          )
          .toBe(true);
      }
    );
  }
  await viewer.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(`[data-expense-id="${ids[1]}"]`).first().click();
  await expect(page.locator("#edit-expense-vendor-input")).toHaveValue(`${prefix} 1`);
  for (let i = 0; i < 20; i++)
    await measure(
      "rowSelect",
      () =>
        page
          .locator(`[data-expense-id="${ids[i % 2]}"]`)
          .first()
          .click(),
      () => expect(page.locator("#edit-expense-vendor-input")).toHaveValue(`${prefix} ${i % 2}`)
    );
  for (let i = 0; i < 20; i++) {
    const before = await page.locator("#edit-expense-vendor-input").inputValue();
    await measure(
      "nextExpense",
      () =>
        page
          .getByRole("button", { name: i % 2 ? "Previous" : "Next", exact: true })
          .last()
          .click(),
      () => expect(page.locator("#edit-expense-vendor-input")).not.toHaveValue(before)
    );
  }
  expect(
    requests.filter((r) =>
      ids.slice(1).some((id) => r.path === `/api/financial/expenses/${id}/receipts`)
    ),
    "Receipt-free expenses must not inherit the preceding expense evidence"
  ).toEqual([]);
  console.log(
    "LOCAL READ METRICS",
    JSON.stringify({ automation: metrics, browser: browserTimings })
  );
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("region", {
        name: viewport.width >= 1200 ? "Receipt preview" : "Receipt Evidence",
        exact: true,
      })
    ).toBeVisible();
    await expect(page.locator("[data-expense-approval-action]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: info.outputPath(`review-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let i = 0; i < 20; i++) {
    await page.locator(`[data-expense-id="${ids[i]}"]`).first().click();
    await expect(page.locator("#edit-expense-vendor-input")).toHaveValue(`${prefix} ${i}`);
    const before = await page.locator("#edit-expense-vendor-input").inputValue();
    await measure(
      "approveAndNext",
      async () => {
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/expenses/${ids[i]}/operations`) &&
            r.request().method() === "POST"
        );
        await page.locator("[data-expense-approval-action]").click();
        const result = await response;
        expect(result.ok(), await result.text()).toBe(true);
      },
      () => expect(page.locator("#edit-expense-vendor-input")).not.toHaveValue(before)
    );
  }
  await gotoWithE2EAuth(page, "/financial/expenses?date_kind=all");
  await page.getByLabel("Search expenses", { exact: true }).filter({ visible: true }).fill(prefix);
  for (let i = 0; i < 20; i++)
    await measure(
      "ledgerQuickLook",
      () =>
        page
          .locator(`[data-expense-id="${ids[i % 2]}"]`)
          .first()
          .click(),
      async () => {
        await expect(page).toHaveURL(new RegExp(ids[i % 2]));
        await expect(page.getByRole("region", { name: "Review and audit" })).toBeVisible();
      }
    );
  const imported = await page.request.post("/api/financial/bank-transactions", {
    data: {
      action: "import",
      rows: Array.from({ length: 51 }, (_, i) => ({
        date: "2026-09-14",
        description: `${prefix} bank ${i}`,
        amount: -10 - i,
      })),
    },
  });
  expect(imported.ok(), await imported.text()).toBe(true);
  expect((await imported.json()).imported).toBe(51);
  await gotoWithE2EAuth(page, "/financial/expenses/intake?source=bank&size=25");
  for (let i = 0; i < 20; i++)
    await measure(
      "intakePagination",
      () =>
        page
          .getByRole("navigation", { name: "Intake pagination" })
          .getByRole("link", { name: i % 2 ? "Previous" : "Next", exact: true })
          .click(),
      () => expect(page.getByText(new RegExp(`^Page ${i % 2 ? 1 : 2} of`))).toBeVisible()
    );
  // Streaming/cancelled responses are diagnostics, not readiness gates for the measured actions.
  let diagnosticTimeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(pending),
    new Promise<void>((resolve) => {
      diagnosticTimeout = setTimeout(resolve, 2000);
    }),
  ]);
  clearTimeout(diagnosticTimeout);
  const incompleteRequestDiagnostics = requests.filter(
    (request) =>
      !request.outcome ||
      (request.outcome === "finished" && request.responseBodyBytes === undefined)
  );
  const summary = Object.fromEntries(
    Object.entries(browserTimings).map(([key, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        key,
        {
          n: values.length,
          median: (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
          p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        },
      ];
    })
  );
  await info.attach("performance-local", {
    body: JSON.stringify({
      runtime:
        "localhost next dev; summary/browserTimings: captured click to changed state plus two animation frames; metrics: Playwright automation elapsed",
      summary,
      metrics,
      browserTimings,
      requests,
      incompleteRequestDiagnostics,
      profiles,
      fixture: { prefix, expenseIds: ids, bankRows: 51, retainedForCertification: true },
    }),
    contentType: "application/json",
  });
  console.log("LOCAL PERFORMANCE", JSON.stringify(summary));
  await client.auth.signOut();
});
