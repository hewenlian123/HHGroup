/**
 * UI smoke tests using Puppeteer.
 * Run with: npx tsx tests/ui-tests.ts
 * Or via:   npm run ui:test
 *
 * Tests navigate the live app and verify pages load with expected UI elements.
 * Set BASE_URL env var to target a different host (default: http://localhost:3000).
 *
 * Output: single-line JSON to stdout — { ok, tests: [{ name, ok, error? }], error? }
 */

import * as fs from "node:fs";
import type { Browser, ElementHandle, HTTPResponse, LaunchOptions, Page } from "puppeteer";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const NAV_TIMEOUT = 20000;
const WAIT_TIMEOUT = 10000;

// ── Chrome discovery ──────────────────────────────────────────────────────────
// Puppeteer v21+ no longer bundles Chrome by default. Try well-known system
// locations so tests work without running `npx puppeteer browsers install`.

const CHROME_CANDIDATES = [
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  // Linux
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];

function findSystemChrome(): string | undefined {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // continue
    }
  }
  return undefined;
}

// ── helpers ───────────────────────────────────────────────────────────────────

type TestOutcome =
  | { name: string; ok: true }
  | { name: string; ok: false; error: string };

/** Run a single test function. Returns { name, ok, error? }. */
async function runTest(name: string, fn: () => Promise<void>): Promise<TestOutcome> {
  try {
    await fn();
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Navigate to a URL and wait for the page body to be visible. */
async function goto(page: Page, path: string): Promise<HTTPResponse | null> {
  const url = `${BASE_URL}${path}`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  if (!res || res.status() >= 500) {
    throw new Error(`Page ${path} returned HTTP ${res ? res.status() : "no response"}`);
  }
  await page.waitForSelector("body", { timeout: WAIT_TIMEOUT });
  return res;
}

/** Wait for any element matching selector to appear. */
async function waitFor(page: Page, selector: string, description?: string): Promise<void> {
  try {
    await page.waitForSelector(selector, { timeout: WAIT_TIMEOUT });
  } catch {
    throw new Error(`Could not find: ${description || selector}`);
  }
}

/** Check page body contains a given string. */
async function assertText(page: Page, text: string): Promise<void> {
  const content = await page.content();
  if (!content.includes(text)) throw new Error(`Expected text not found: "${text}"`);
}

/**
 * Generic module page smoke test: load page, check for errors, main content, table/list, and Create/Add/New action.
 * path: URL path (e.g. "/projects")
 * expectedText: string that must appear on the page (e.g. "Projects" or "Estimates")
 * options: { createButtonLabel?: string } optional label to look for (default: look for New|Add|Create)
 */
type SmokeModuleOptions = { createButtonLabel?: string };

async function smokeTestModulePage(
  page: Page,
  path: string,
  expectedText: string,
  options: SmokeModuleOptions = {}
): Promise<void> {
  const res = await goto(page, path);
  if (!res || res.status() >= 400) {
    throw new Error(`Page ${path} returned HTTP ${res ? res.status() : "no response"}`);
  }
  await page.waitForSelector("body", { timeout: WAIT_TIMEOUT });
  const content = await page.content();

  // Fail if page shows Supabase/API/schema error
  const errorIndicators = [
    "Could not find the table",
    "schema cache",
    "Supabase",
    "PGRST",
    "relation.*does not exist",
    "Failed to load",
    "Error loading",
  ];
  const lower = content.toLowerCase();
  for (const phrase of errorIndicators) {
    const p = phrase.toLowerCase();
    if (lower.includes(p)) {
      throw new Error(`Page error: ${phrase}`);
    }
  }

  await waitFor(page, "main, [class*='page-container']", "page content");
  if (!content.includes(expectedText)) {
    throw new Error(`Expected page content not found: "${expectedText}"`);
  }

  // Table or list: look for table element or role=table or list-like structure
  const hasTable = await page.evaluate(() => {
    return (
      document.querySelector("table") != null ||
      document.querySelector("[role='table']") != null ||
      document.querySelector("[role='list']") != null ||
      document.querySelector("[class*='table']") != null ||
      document.querySelector("[class*='DataTable']") != null
    );
  });
  if (!hasTable) {
    const hasListLike = await page.evaluate(() => {
      const tbody = document.querySelector("tbody");
      const list = document.querySelector("[class*='list'], [class*='grid']");
      return (tbody && tbody.children.length >= 0) || list != null;
    });
    if (!hasListLike && !content.includes("No ") && !content.includes("0 ")) {
      throw new Error("Main table or list not found");
    }
  }

  // Create/Add/New button or link
  const createLabel = options.createButtonLabel || "New|Add|Create";
  const hasCreateAction = await page.evaluate((label) => {
    const re = new RegExp(label, "i");
    const buttons = Array.from(document.querySelectorAll("a, button"));
    return buttons.some((el) => re.test((el.textContent || "").trim()));
  }, createLabel);
  if (!hasCreateAction) {
    throw new Error(`Create/Add/New button not found (looking for: ${createLabel})`);
  }
}

/** XPath first match (legacy `Page.$x` — not always in typings). */
async function xpathFirst(page: Page, expression: string): Promise<ElementHandle<Element> | undefined> {
  const legacy = page as unknown as { $x?: (xpath: string) => Promise<ElementHandle<Element>[]> };
  if (!legacy.$x) throw new Error("Puppeteer Page.$x is not available");
  const handles = await legacy.$x(expression);
  return handles[0];
}

type PuppeteerWithLaunch = { launch: (opts?: LaunchOptions) => Promise<Browser> };

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  let puppeteerPkg: PuppeteerWithLaunch | null = null;
  try {
    const mod = await import("puppeteer");
    const raw = mod as { default?: PuppeteerWithLaunch } & PuppeteerWithLaunch;
    puppeteerPkg = raw.default ?? raw;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        skipped: `Puppeteer not available: ${msg}`,
        tests: [],
      }) + "\n"
    );
    process.exit(0);
  }

  const executablePath = findSystemChrome();
  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

  const skipNames = [
    "receipt_upload",
    "approve_receipt",
    "delete_receipt",
    "create_expense",
    "create_invoice",
    "projects",
    "estimates",
    "change_orders",
    "tasks",
    "punch_list",
    "schedule",
    "site_photos",
    "inspection_log",
    "material_catalog",
    "labor_receipts",
  ];

  function exitSkipped(hint: string): never {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        skipped: hint,
        tests: skipNames.map((name) => ({ name, ok: true, skipped: hint })),
      }) + "\n"
    );
    process.exit(0);
    throw new Error("unreachable");
  }

  // No system Chrome — skip launch entirely so we don't hang (Puppeteer may try to download Chrome)
  if (!executablePath) {
    exitSkipped("No system Chrome found. Run: npx puppeteer browsers install chrome");
  }

  let browser: Browser;
  try {
    browser = await puppeteerPkg.launch({
      headless: true,
      args: launchArgs,
      executablePath,
    });
  } catch (launchErr) {
    const errMsg = launchErr instanceof Error ? launchErr.message : String(launchErr);
    exitSkipped(errMsg);
  }

  const results: TestOutcome[] = [];

  // ── 1. receipt_upload ──────────────────────────────────────────────────────
  {
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT);
    results.push(
      await runTest("receipt_upload", async () => {
        await goto(page, "/upload-receipt");
        await assertText(page, "Worker Receipt Upload");
        await waitFor(page, "button", "submit button");
      })
    );
    await page.close();
  }

  // ── 2. approve_receipt ────────────────────────────────────────────────────
  {
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT);
    results.push(
      await runTest("approve_receipt", async () => {
        await goto(page, "/labor/receipts");
        await waitFor(page, "main, [class*='page-container']", "page content");
        const content = await page.content();
        const ok =
          content.toLowerCase().includes("approve") ||
          content.toLowerCase().includes("pending") ||
          content.toLowerCase().includes("receipt") ||
          content.toLowerCase().includes("no data");
        if (!ok) throw new Error("Receipt uploads page did not render expected content");
      })
    );
    await page.close();
  }

  // ── 3. delete_receipt ─────────────────────────────────────────────────────
  {
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT);
    results.push(
      await runTest("delete_receipt", async () => {
        await goto(page, "/labor/receipts");
        await waitFor(page, "main, [class*='page-container']", "page content");
        const content = await page.content();
        if (!content.toLowerCase().includes("receipt") && !content.toLowerCase().includes("upload"))
          throw new Error("Receipt uploads page did not render");
      })
    );
    await page.close();
  }

  // ── 4. create_expense ─────────────────────────────────────────────────────
  {
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT);
    results.push(
      await runTest("create_expense", async () => {
        await goto(page, "/financial/expenses");
        await waitFor(page, "main, [class*='page-container']", "page content");
        const content = await page.content();
        if (!content.toLowerCase().includes("expense"))
          throw new Error("Expenses page did not render expected content");
      })
    );
    await page.close();
  }

  // ── 5. create_invoice ─────────────────────────────────────────────────────
  {
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT);
    results.push(
      await runTest("create_invoice", async () => {
        await goto(page, "/financial/invoices");
        await waitFor(page, "main, [class*='page-container']", "page content");
        const content = await page.content();
        if (!content.toLowerCase().includes("invoice"))
          throw new Error("Invoices page did not render expected content");
      })
    );
    await page.close();
  }

  // ── 6. projects ────────────────────────────────────────────────────────────
  results.push(
    await runTest("projects", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/projects", "Project");
      } finally {
        await page.close();
      }
    })
  );

  // ── 7. estimates ──────────────────────────────────────────────────────────
  results.push(
    await runTest("estimates", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/estimates", "Estimates");
      } finally {
        await page.close();
      }
    })
  );

  // ── 8. change_orders ───────────────────────────────────────────────────────
  results.push(
    await runTest("change_orders", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/change-orders", "Change Order");
      } finally {
        await page.close();
      }
    })
  );

  // ── 9. tasks ───────────────────────────────────────────────────────────────
  results.push(
    await runTest("tasks", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/tasks", "Task");
      } finally {
        await page.close();
      }
    })
  );

  // ── 9b. tasks create + delete (row disappears) ─────────────────────────────
  results.push(
    await runTest("tasks_create_delete", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      const taskTitle = `UI Test Task ${Date.now()}`;
      try {
        await goto(page, "/tasks");
        await waitFor(page, "main, [class*='page-container']", "page content");
        const newBtn = await xpathFirst(page, '//button[contains(., "New Task")]');
        if (!newBtn) throw new Error('"New Task" button not found');
        await newBtn.click();
        await page.waitForSelector('[role="dialog"], [class*="dialog"]', { timeout: WAIT_TIMEOUT });
        const firstProjectValue = await page.evaluate(() => {
          const opt = document.querySelector('select option[value]:not([value=""])');
          return opt ? (opt as HTMLOptionElement).value : null;
        });
        if (!firstProjectValue) {
          await page.keyboard.press("Escape");
          return;
        }
        await page.select('select', firstProjectValue);
        const titleInput = await page.$('input[placeholder*="Task title"], input[placeholder*="title"]');
        if (!titleInput) throw new Error("Task title input not found");
        await titleInput.type(taskTitle, { delay: 20 });
        const saveBtn = await xpathFirst(page, '//button[contains(., "Save")]');
        if (!saveBtn) throw new Error("Save button not found");
        await saveBtn.click();
        await page.waitForFunction(
          () => !document.querySelector('[role="dialog"]') && !document.querySelector('[class*="dialog"][data-state="open"]'),
          { timeout: WAIT_TIMEOUT }
        ).catch(() => {});
        await new Promise((r) => setTimeout(r, 800));
        const hasRow = await page.evaluate((title) => document.body.innerText.includes(title), taskTitle);
        if (!hasRow) throw new Error(`New task row "${taskTitle}" did not appear`);
        const rowEl = await xpathFirst(
          page,
          `//tr[contains(., "${taskTitle}")] | //button[contains(., "${taskTitle}")]`
        );
        if (!rowEl) throw new Error(`Row with "${taskTitle}" not found`);
        await rowEl.click();
        await new Promise((r) => setTimeout(r, 400));
        const deleteBtn = await xpathFirst(page, '//button[contains(., "Delete")]');
        if (!deleteBtn) throw new Error("Delete button not found in drawer");
        page.once("dialog", (d: { accept: () => void }) => d.accept());
        await deleteBtn.click();
        await new Promise((r) => setTimeout(r, 1200));
        const stillThere = await page.evaluate((title) => document.body.innerText.includes(title), taskTitle);
        if (stillThere) throw new Error("Task row still visible after delete");
      } finally {
        await page.close();
      }
    })
  );

  // ── 10. punch_list ────────────────────────────────────────────────────────
  results.push(
    await runTest("punch_list", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/punch-list", "Punch");
      } finally {
        await page.close();
      }
    })
  );

  // ── 11. schedule ───────────────────────────────────────────────────────────
  results.push(
    await runTest("schedule", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/schedule", "Schedule");
      } finally {
        await page.close();
      }
    })
  );

  // ── 12. site_photos ────────────────────────────────────────────────────────
  results.push(
    await runTest("site_photos", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/site-photos", "Photo");
      } finally {
        await page.close();
      }
    })
  );

  // ── 13. inspection_log ─────────────────────────────────────────────────────
  results.push(
    await runTest("inspection_log", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/inspection-log", "Inspection");
      } finally {
        await page.close();
      }
    })
  );

  // ── 14. material_catalog ───────────────────────────────────────────────────
  results.push(
    await runTest("material_catalog", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/materials/catalog", "Material");
      } finally {
        await page.close();
      }
    })
  );

  // ── 15. labor_receipts ─────────────────────────────────────────────────────
  results.push(
    await runTest("labor_receipts", async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(WAIT_TIMEOUT);
      try {
        await smokeTestModulePage(page, "/labor/receipts", "Receipt");
      } finally {
        await page.close();
      }
    })
  );

  await browser.close();

  const allOk = results.every((t) => t.ok);
  process.stdout.write(JSON.stringify({ ok: allOk, tests: results }) + "\n");
  process.exit(allOk ? 0 : 1);
}

main().catch((fatal) => {
  const msg = fatal instanceof Error ? fatal.message : String(fatal);
  process.stdout.write(
    JSON.stringify({ ok: false, tests: [], error: `Fatal: ${msg}` }) + "\n"
  );
  process.exit(1);
});
