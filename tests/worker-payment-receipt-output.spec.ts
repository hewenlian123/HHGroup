import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MARKER = "LOCAL-RECEIPT-GROUP-A4-DELETE-ME";
const RUN_ID = Date.now();
const WORKER_ID = randomUUID();
const MAIN_PROJECT_ID = randomUUID();
const OTHER_PROJECT_ID = randomUUID();
const PAYMENT_ID = randomUUID();
const WORKER_NAME = `${MARKER} Worker ${RUN_ID}`;
const MAIN_PROJECT_NAME = "673 Kihapai St";
const OTHER_PROJECT_NAME = `${MARKER} Other Project ${RUN_ID}`;
const PAYMENT_TOTAL = 850;

const LABOR_ROWS = [
  {
    id: randomUUID(),
    date: "2026-06-01",
    projectId: MAIN_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-02",
    projectId: MAIN_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-03",
    projectId: MAIN_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-04",
    projectId: MAIN_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-05",
    projectId: MAIN_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-06",
    projectId: OTHER_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-08",
    projectId: MAIN_PROJECT_ID,
    amount: 100,
    am: true,
    pm: true,
  },
  {
    id: randomUUID(),
    date: "2026-06-09",
    projectId: MAIN_PROJECT_ID,
    amount: 50,
    am: true,
    pm: false,
  },
  {
    id: randomUUID(),
    date: "2026-06-10",
    projectId: MAIN_PROJECT_ID,
    amount: 50,
    am: true,
    pm: false,
  },
  {
    id: randomUUID(),
    date: "2026-06-10",
    projectId: MAIN_PROJECT_ID,
    amount: 50,
    am: false,
    pm: true,
  },
] as const;

const EXPECTED_LABOR_TABLE = [
  ["Jun 01–Jun 05, 2026", MAIN_PROJECT_NAME, "5 days", "$500.00"],
  ["Jun 06, 2026", OTHER_PROJECT_NAME, "Full day", "$100.00"],
  ["Jun 08, 2026", MAIN_PROJECT_NAME, "Full day", "$100.00"],
  ["Jun 09–Jun 10, 2026", MAIN_PROJECT_NAME, "2 AM sessions", "$100.00"],
  ["Jun 10, 2026", MAIN_PROJECT_NAME, "Half day (PM)", "$50.00"],
] as const;

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  assertE2EBaseUrlSafeForMutations(BASE, "worker payment receipt output smoke");
  return createClient(url, key);
}

async function insertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[]
): Promise<void> {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).insert(payload);
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to seed ${table}: ${last || "unknown error"}`);
}

async function upsertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[],
  onConflict = "id"
): Promise<void> {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).upsert(payload, { onConflict });
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to seed ${table}: ${last || "unknown error"}`);
}

async function cleanupRows(client: SupabaseClient): Promise<void> {
  await client.from("worker_reimbursements").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_advances").delete().eq("worker_id", WORKER_ID);
  await client.from("labor_entries").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_payments").delete().eq("worker_id", WORKER_ID);
  await client.from("labor_workers").delete().eq("id", WORKER_ID);
  await client.from("workers").delete().eq("id", WORKER_ID);
  await client.from("projects").delete().in("id", [MAIN_PROJECT_ID, OTHER_PROJECT_ID]);
}

async function verifyCleanup(client: SupabaseClient): Promise<void> {
  const checks = [
    client.from("labor_entries").select("id").eq("worker_id", WORKER_ID),
    client.from("worker_payments").select("id").eq("worker_id", WORKER_ID),
    client.from("worker_reimbursements").select("id").eq("worker_id", WORKER_ID),
    client.from("worker_advances").select("id").eq("worker_id", WORKER_ID),
    client.from("labor_workers").select("id").eq("id", WORKER_ID),
    client.from("workers").select("id").eq("id", WORKER_ID),
    client.from("projects").select("id").in("id", [MAIN_PROJECT_ID, OTHER_PROJECT_ID]),
  ];
  const results = await Promise.all(checks);
  for (const result of results) {
    if (result.error) throw new Error(`Cleanup verification failed: ${result.error.message}`);
    expect(result.data ?? []).toHaveLength(0);
  }
}

async function seedRows(client: SupabaseClient): Promise<void> {
  await cleanupRows(client);

  await insertFirstSuccess(client, "projects", [
    {
      id: MAIN_PROJECT_ID,
      name: MAIN_PROJECT_NAME,
      status: "active",
      budget: 0,
      spent: 0,
      notes: MARKER,
    },
    { id: MAIN_PROJECT_ID, name: MAIN_PROJECT_NAME, status: "active" },
  ]);
  await insertFirstSuccess(client, "projects", [
    {
      id: OTHER_PROJECT_ID,
      name: OTHER_PROJECT_NAME,
      status: "active",
      budget: 0,
      spent: 0,
      notes: MARKER,
    },
    { id: OTHER_PROJECT_ID, name: OTHER_PROJECT_NAME, status: "active" },
  ]);
  await insertFirstSuccess(client, "workers", [
    {
      id: WORKER_ID,
      name: WORKER_NAME,
      role: "QA",
      daily_rate: 100,
      half_day_rate: 50,
      status: "active",
      notes: MARKER,
    },
    { id: WORKER_ID, name: WORKER_NAME, status: "active" },
  ]);
  await upsertFirstSuccess(client, "labor_workers", [
    { id: WORKER_ID, name: WORKER_NAME, active: true, rate: 100, type: "QA" },
    { id: WORKER_ID, name: WORKER_NAME },
  ]);
  await insertFirstSuccess(client, "worker_payments", [
    {
      id: PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: PAYMENT_TOTAL,
      amount: PAYMENT_TOTAL,
      payment_method: "E2E Cash",
      payment_date: "2026-06-12",
      note: MARKER,
      notes: MARKER,
      labor_entry_ids: LABOR_ROWS.map((row) => row.id),
    },
    {
      id: PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: PAYMENT_TOTAL,
      payment_method: "E2E Cash",
      payment_date: "2026-06-12",
      note: MARKER,
      labor_entry_ids: LABOR_ROWS.map((row) => row.id),
    },
  ]);

  for (const row of LABOR_ROWS) {
    await insertFirstSuccess(client, "labor_entries", [
      {
        id: row.id,
        worker_id: WORKER_ID,
        project_id: row.projectId,
        work_date: row.date,
        cost_code: "QA",
        cost_amount: row.amount,
        amount_snapshot: row.amount,
        labor_cost_snapshot: row.amount,
        daily_rate_snapshot: row.am && row.pm ? row.amount : row.amount * 2,
        days_worked: row.am && row.pm ? 1 : 0.5,
        hours: row.am && row.pm ? 8 : 4,
        status: "Approved",
        morning: row.am,
        afternoon: row.pm,
        worker_payment_id: PAYMENT_ID,
        notes: MARKER,
      },
      {
        id: row.id,
        worker_id: WORKER_ID,
        project_id: row.projectId,
        work_date: row.date,
        cost_amount: row.amount,
        status: "Approved",
        morning: row.am,
        afternoon: row.pm,
        worker_payment_id: PAYMENT_ID,
        notes: MARKER,
      },
    ]);
  }
}

async function laborTableRows(scope: Locator): Promise<string[][]> {
  return scope
    .locator(".receipt-table--labor tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll("td")).map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim()
        )
      )
    );
}

async function expectReceiptAmounts(scope: Locator): Promise<void> {
  await expect(scope.locator(".receipt-total-amount")).toHaveText("$850.00");
  await expect(scope.locator(".receipt-summary-row").filter({ hasText: "Subtotal" })).toContainText(
    "$850.00"
  );
  await expect(scope.locator(".receipt-summary-row").filter({ hasText: "Balance" })).toContainText(
    "$0.00"
  );
}

async function expectReceiptRows(scope: Locator): Promise<void> {
  expect(await laborTableRows(scope)).toEqual(EXPECTED_LABOR_TABLE);
  await expectReceiptAmounts(scope);
}

async function expectNoReceiptConsoleErrors(
  page: Page,
  errors: string[],
  pageErrors: string[]
): Promise<void> {
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
  expect(pageErrors).toEqual([]);
  expect(errors.filter((text) => !/favicon/i.test(text))).toEqual([]);
}

function pdfPageSizePoints(path: string): { width: number; height: number } {
  try {
    const out = execFileSync("pdfinfo", [path], { encoding: "utf8" });
    const m = out.match(/Page size:\s*([\d.]+)\s+x\s+([\d.]+)\s+pts/i);
    if (m) return { width: Number(m[1]), height: Number(m[2]) };
  } catch {
    // pdfinfo is not guaranteed on every developer machine; fall back to MediaBox parsing.
  }

  const raw = readFileSync(path, "latin1");
  const m = raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!m) throw new Error("Could not read PDF page size.");
  return { width: Number(m[1]), height: Number(m[2]) };
}

test.describe("Worker payment receipt output", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    await seedRows(admin);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await cleanupRows(admin);
    await verifyCleanup(admin);
  });

  test("groups labor rows consistently in preview, print, and A4 PDF", async ({
    page,
  }, testInfo) => {
    test.skip(!admin, "Supabase service role env is not available.");

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const apiResponse = await page.request.get(
      `/api/labor/worker-payments/${encodeURIComponent(PAYMENT_ID)}/receipt-preview`
    );
    expect(
      apiResponse.ok(),
      `receipt-preview failed: ${apiResponse.status()} ${await apiResponse.text()}`
    ).toBe(true);
    const apiBody = (await apiResponse.json()) as {
      receipt?: {
        laborLines?: Array<{
          dateLabel?: string;
          projectName?: string | null;
          sessionLabel?: string;
          amount?: number;
        }>;
        laborSubtotal?: number;
        balance?: { remainingBalance?: number };
      } | null;
      payment?: { amount?: number };
    };
    expect(
      apiBody.receipt?.laborLines?.map((line) => [
        line.dateLabel,
        line.projectName,
        line.sessionLabel,
        `$${Number(line.amount ?? 0).toFixed(2)}`,
      ])
    ).toEqual(EXPECTED_LABOR_TABLE);
    expect(apiBody.receipt?.laborSubtotal).toBe(PAYMENT_TOTAL);
    expect(apiBody.payment?.amount).toBe(PAYMENT_TOTAL);
    expect(apiBody.receipt?.balance?.remainingBalance).toBe(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/reports/workforce?tab=payments`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Worker Payments" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Loading…").first()).not.toBeVisible({ timeout: 60_000 });

    await page.locator('input[aria-label="Search payments and workers"]:visible').fill(WORKER_NAME);
    const row = page.locator("tbody tr").filter({ hasText: WORKER_NAME }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });

    const previewDone = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/labor/worker-payments/${PAYMENT_ID}/receipt-preview`) &&
        res.request().method() === "GET",
      { timeout: 90_000 }
    );
    await row.getByRole("button", { name: `Actions for payment ${WORKER_NAME}` }).click();
    await page.getByRole("menuitem", { name: /^View receipt$/i }).click();
    const previewResponse = await previewDone;
    expect(previewResponse.ok()).toBe(true);

    const dialog = page.getByRole("dialog", { name: /Receipt preview/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("Loading receipt…")).not.toBeVisible({ timeout: 60_000 });
    await expectReceiptRows(dialog);

    const previewMetrics = await dialog.locator(".receipt-container").evaluate((el) => {
      const paper = el.getBoundingClientRect();
      const bottom = el.querySelector(".receipt-bottom")?.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        height: paper.height,
        minHeight: styles.minHeight,
        aspectRatio: styles.aspectRatio,
        trailingBlank: bottom ? paper.bottom - bottom.bottom : Number.NaN,
      };
    });
    expect(previewMetrics.height).toBeLessThan(700);
    expect(previewMetrics.trailingBlank).toBeLessThan(40);
    expect(previewMetrics.minHeight === "0px" || previewMetrics.minHeight === "auto").toBe(true);
    expect(previewMetrics.aspectRatio === "auto" || previewMetrics.aspectRatio === "normal").toBe(
      true
    );

    const pdfCaptureMetrics = await dialog.locator(".receipt-container").evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.add("receipt-pdf-capture");
      clone.style.position = "absolute";
      clone.style.left = "-10000px";
      clone.style.top = "0";
      document.body.appendChild(clone);
      try {
        const paper = clone.getBoundingClientRect();
        const bottom = clone.querySelector(".receipt-bottom")?.getBoundingClientRect();
        const styles = window.getComputedStyle(clone);
        return {
          minHeight: Number.parseFloat(styles.minHeight),
          display: styles.display,
          flexDirection: styles.flexDirection,
          trailingBlank: bottom ? paper.bottom - bottom.bottom : Number.NaN,
        };
      } finally {
        clone.remove();
      }
    });
    expect(pdfCaptureMetrics.minHeight).toBeGreaterThan(1000);
    expect(pdfCaptureMetrics.display).toBe("flex");
    expect(pdfCaptureMetrics.flexDirection).toBe("column");
    expect(pdfCaptureMetrics.trailingBlank).toBeLessThan(8);

    const pdfDownload = page.waitForEvent("download", { timeout: 120_000 });
    await dialog.getByRole("button", { name: /Download PDF/i }).click();
    const downloadedPdf = await pdfDownload;
    const pdfPath = testInfo.outputPath("worker-payment-receipt-a4.pdf");
    await downloadedPdf.saveAs(pdfPath);
    const size = pdfPageSizePoints(pdfPath);
    expect(size.width).toBeCloseTo(595.28, 1);
    expect(size.height).toBeCloseTo(841.89, 1);

    await page.evaluate(() => {
      window.print = () => {
        document.body.setAttribute("data-worker-receipt-print-called", "true");
      };
    });
    await dialog.getByRole("button", { name: /^Print$/i }).click();
    await expect(page.locator("html")).toHaveClass(/print-worker-receipt-preview/);
    await expect(page.locator("body")).toHaveAttribute("data-worker-receipt-print-called", "true");
    await page.emulateMedia({ media: "print" });
    await expectReceiptRows(dialog);

    const printMetrics = await dialog.locator(".receipt-container").evaluate((el) => {
      const paper = el.getBoundingClientRect();
      const bottom = el.querySelector(".receipt-bottom")?.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        minHeight: Number.parseFloat(styles.minHeight),
        display: styles.display,
        flexDirection: styles.flexDirection,
        trailingBlank: bottom ? paper.bottom - bottom.bottom : Number.NaN,
      };
    });
    expect(printMetrics.minHeight).toBeGreaterThan(1000);
    expect(printMetrics.display).toBe("flex");
    expect(printMetrics.flexDirection).toBe("column");
    expect(printMetrics.trailingBlank).toBeLessThan(8);
    await page.emulateMedia({ media: "screen" });

    await expectNoReceiptConsoleErrors(page, consoleErrors, pageErrors);
  });
});
