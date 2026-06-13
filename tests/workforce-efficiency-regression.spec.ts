import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MARKER = "LOCAL-WORKFORCE-EFFICIENCY-QA-DELETE-ME";
const LOCAL_SUPABASE_URL = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;

type CreatedRows = {
  workerId: string;
  projectId: string;
  laborEntryId: string;
  reimbursementId: string;
};

function localYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startConsoleWatch(page: Page) {
  const errors: string[] = [];
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") errors.push(message.text());
  };
  const onPageError = (error: Error) => errors.push(error.message);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    errors,
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    },
  };
}

function localSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  test.skip(!url || !key, "Supabase env is required for local Workforce regression.");
  test.skip(
    !LOCAL_SUPABASE_URL.test(url),
    "Workforce regression only runs against local Supabase."
  );
  return createClient(url, key);
}

async function cleanupRows(supabase: SupabaseClient, rows: Partial<CreatedRows>) {
  if (rows.reimbursementId) {
    await supabase.from("worker_reimbursements").delete().eq("id", rows.reimbursementId);
  }
  if (rows.laborEntryId) {
    await supabase.from("labor_entries").delete().eq("id", rows.laborEntryId);
  }
  if (rows.workerId) {
    await supabase.from("worker_payments").delete().eq("worker_id", rows.workerId);
    await supabase.from("worker_advances").delete().eq("worker_id", rows.workerId);
    await supabase.from("workers").delete().eq("id", rows.workerId);
  }
  if (rows.projectId) {
    await supabase.from("projects").delete().eq("id", rows.projectId);
  }
}

async function createRows(supabase: SupabaseClient): Promise<CreatedRows> {
  const stamp = Date.now();
  const workerName = `${MARKER} Worker ${stamp}`;
  const projectName = `${MARKER} Project ${stamp}`;
  const today = localYmd();

  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .insert({
      name: workerName,
      role: "QA",
      half_day_rate: 200,
      daily_rate: 200,
      status: "active",
      notes: MARKER,
    })
    .select("id")
    .single();
  if (workerError || !worker?.id) throw new Error(workerError?.message ?? "Worker insert failed.");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: projectName,
      status: "Active",
      budget: 0,
      spent: 0,
      client: MARKER,
    })
    .select("id")
    .single();
  if (projectError || !project?.id) {
    await cleanupRows(supabase, { workerId: worker.id });
    throw new Error(projectError?.message ?? "Project insert failed.");
  }

  const baseRows = { workerId: worker.id, projectId: project.id };
  const { data: laborEntry, error: laborError } = await supabase
    .from("labor_entries")
    .insert({
      worker_id: worker.id,
      project_id: project.id,
      work_date: today,
      cost_code: MARKER,
      cost_amount: 200,
      status: "approved",
      morning: true,
      afternoon: true,
      hours: 8,
      days_worked: 1,
      daily_rate_snapshot: 200,
      amount_snapshot: 200,
      labor_cost_snapshot: 200,
      notes: MARKER,
    })
    .select("id")
    .single();
  if (laborError || !laborEntry?.id) {
    await cleanupRows(supabase, baseRows);
    throw new Error(laborError?.message ?? "Labor entry insert failed.");
  }

  const { data: reimbursement, error: reimbursementError } = await supabase
    .from("worker_reimbursements")
    .insert({
      worker_id: worker.id,
      project_id: project.id,
      vendor: `${MARKER} Vendor`,
      amount: 48,
      description: MARKER,
      receipt_url: null,
      status: "paid",
      reimbursement_date: today,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (reimbursementError || !reimbursement?.id) {
    await cleanupRows(supabase, { ...baseRows, laborEntryId: laborEntry.id });
    throw new Error(reimbursementError?.message ?? "Reimbursement insert failed.");
  }

  return {
    ...baseRows,
    laborEntryId: laborEntry.id,
    reimbursementId: reimbursement.id,
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    Math.max(metrics.documentWidth, metrics.bodyWidth),
    `No horizontal overflow: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

async function visibleLocatorCount(locator: Locator): Promise<number> {
  return locator.evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      }).length
  );
}

async function expectVisibleText(page: Page, text: string | RegExp) {
  await expect
    .poll(() => visibleLocatorCount(page.getByText(text)), {
      message: `Expected visible text: ${String(text)}`,
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}

test.describe("Workforce efficiency regression", () => {
  test("paid reimbursements, shortcuts, returnTo, and mobile layout work locally", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const supabase = localSupabase();
    const created: Partial<CreatedRows> = {};
    const consoleWatch = startConsoleWatch(page);

    try {
      const rows = await createRows(supabase);
      Object.assign(created, rows);
      const workerName = await supabase
        .from("workers")
        .select("name")
        .eq("id", rows.workerId)
        .single()
        .then(({ data }) => data?.name ?? MARKER);

      await page.goto(`/workers/${rows.workerId}?tab=receipts`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("tab", { name: "Receipts & Reimbursements" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(`${MARKER} Vendor`).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/^paid/i).first()).toBeVisible();

      await page.goto("/reports/workforce?tab=reimbursements", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: /^Workforce Reports$/i })).toBeVisible({
        timeout: 30_000,
      });
      await expectVisibleText(page, `${MARKER} Vendor`);
      await expectVisibleText(page, /^Paid$/i);

      await page.goto("/reports/workforce?tab=payroll", { waitUntil: "domcontentloaded" });
      await expect(page.getByLabel("To", { exact: true })).toHaveValue(localYmd(), {
        timeout: 30_000,
      });
      await expect(page.getByRole("link", { name: `Open ${workerName}` })).toBeVisible({
        timeout: 30_000,
      });

      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: /Payroll Due/i }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("payroll");

      await page.goto("/reports/workforce", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: /Balances/i })
        .first()
        .click();
      await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("balances");

      await page.goto("/reports/workforce?tab=payroll", { waitUntil: "domcontentloaded" });
      const workerRowLink = page.getByRole("link", { name: `Open ${workerName}` });
      await expect(workerRowLink).toBeVisible({ timeout: 30_000 });
      await workerRowLink.click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/workers/${rows.workerId}`);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
        "/reports/workforce?tab=payroll"
      );
      await page.getByRole("link", { name: /Back to Workforce Payroll/i }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe("/reports/workforce");
      await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("payroll");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/reports/workforce?tab=reimbursements", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("tab", { name: /^Reimbursements$/i })).toBeVisible({
        timeout: 30_000,
      });
      await expectNoHorizontalOverflow(page);
    } finally {
      consoleWatch.stop();
      expect(consoleWatch.errors).toEqual([]);
      await cleanupRows(supabase, created);
    }
  });
});
