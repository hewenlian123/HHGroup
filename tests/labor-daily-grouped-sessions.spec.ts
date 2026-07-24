import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "LOCAL-LABOR-GROUP-QA-DELETE-ME";
const RUN = Date.now();
const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

function currentMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function monthDate(day: number): string {
  return `${currentMonth()}-${String(day).padStart(2, "0")}`;
}

function compactDateLabel(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1)
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const ids = {
  worker: randomUUID(),
  projectA: randomUUID(),
  projectB: randomUUID(),
  splitMorning: randomUUID(),
  splitAfternoon: randomUUID(),
  morningOnly: randomUUID(),
  fullDay: randomUUID(),
  fullDayOt: randomUUID(),
};

const dates = {
  split: monthDate(3),
  morningOnly: monthDate(4),
  fullDay: monthDate(5),
  fullDayOt: monthDate(6),
};

const workerName = `${PREFIX} Worker ${RUN}`;
const projectAName = `${PREFIX} Project A ${RUN}`;
const projectBName = `${PREFIX} Project B ${RUN}`;

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient {
  loadE2EProcessEnv();
  assertE2EBaseUrlSafeForMutations(BASE, "labor grouped sessions browser E2E mutation");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Grouped labor sessions test requires local Supabase URL and service role key."
    );
  }
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function deleteByIds(
  client: SupabaseClient,
  table: string,
  column: string,
  values: string[]
): Promise<void> {
  if (values.length === 0) return;
  const { error } = await client.from(table).delete().in(column, values);
  if (error) throw new Error(`Failed to cleanup ${table}.${column}: ${error.message}`);
}

async function markerIds(
  client: SupabaseClient
): Promise<{ workerIds: string[]; projectIds: string[] }> {
  const { data: workers, error: workersError } = await client
    .from("workers")
    .select("id")
    .like("name", `${PREFIX}%`);
  if (workersError) throw new Error(`Failed to find marker workers: ${workersError.message}`);

  const { data: projects, error: projectsError } = await client
    .from("projects")
    .select("id")
    .like("name", `${PREFIX}%`);
  if (projectsError) throw new Error(`Failed to find marker projects: ${projectsError.message}`);

  return {
    workerIds: (workers ?? []).map((row) => String(row.id)).filter(Boolean),
    projectIds: (projects ?? []).map((row) => String(row.id)).filter(Boolean),
  };
}

async function cleanup(client: SupabaseClient): Promise<void> {
  const { workerIds, projectIds } = await markerIds(client);
  await deleteByIds(client, "labor_entries", "worker_id", workerIds);
  await deleteByIds(client, "labor_entries", "project_id", projectIds);
  await deleteByIds(client, "labor_workers", "id", workerIds);
  await deleteByIds(client, "workers", "id", workerIds);
  await deleteByIds(client, "projects", "id", projectIds);
}

async function markerCounts(
  client: SupabaseClient
): Promise<{ workers: number; projects: number; laborEntries: number }> {
  const { workerIds, projectIds } = await markerIds(client);
  const laborIds = new Set<string>();
  if (workerIds.length > 0) {
    const { data, error } = await client
      .from("labor_entries")
      .select("id")
      .in("worker_id", workerIds);
    if (error) throw new Error(`Failed to count marker worker entries: ${error.message}`);
    for (const row of data ?? []) laborIds.add(String(row.id));
  }
  if (projectIds.length > 0) {
    const { data, error } = await client
      .from("labor_entries")
      .select("id")
      .in("project_id", projectIds);
    if (error) throw new Error(`Failed to count marker project entries: ${error.message}`);
    for (const row of data ?? []) laborIds.add(String(row.id));
  }
  return {
    workers: workerIds.length,
    projects: projectIds.length,
    laborEntries: laborIds.size,
  };
}

async function seed(client: SupabaseClient): Promise<void> {
  await cleanup(client);

  const { error: projectsError } = await client.from("projects").insert([
    { id: ids.projectA, name: projectAName, status: "active", budget: 0, spent: 0 },
    { id: ids.projectB, name: projectBName, status: "active", budget: 0, spent: 0 },
  ]);
  if (projectsError) throw new Error(`Failed to seed projects: ${projectsError.message}`);

  const { error: workerError } = await client.from("workers").insert({
    id: ids.worker,
    name: workerName,
    role: "QA",
    phone: "555-0177",
    half_day_rate: 100,
    daily_rate: 200,
    status: "active",
    notes: PREFIX,
  });
  if (workerError) throw new Error(`Failed to seed worker: ${workerError.message}`);

  const { error: laborWorkerError } = await client.from("labor_workers").upsert(
    {
      id: ids.worker,
      name: workerName,
      active: true,
      rate: 200,
      type: "QA",
    },
    { onConflict: "id" }
  );
  if (laborWorkerError) throw new Error(`Failed to seed labor worker: ${laborWorkerError.message}`);

  const common = {
    worker_id: ids.worker,
    cost_code: "GROUP-QA",
    status: "Draft",
    daily_rate_snapshot: 200,
  };
  const { error: entriesError } = await client.from("labor_entries").insert([
    {
      ...common,
      id: ids.splitMorning,
      project_id: ids.projectA,
      work_date: dates.split,
      hours: 0.5,
      cost_amount: 100,
      morning: true,
      afternoon: false,
      notes: `${PREFIX} split morning session=morning`,
      days_worked: 0.5,
      amount_snapshot: 100,
      labor_cost_snapshot: 100,
    },
    {
      ...common,
      id: ids.splitAfternoon,
      project_id: ids.projectB,
      work_date: dates.split,
      hours: 0.5,
      cost_amount: 100,
      morning: false,
      afternoon: true,
      notes: `${PREFIX} split afternoon session=afternoon`,
      days_worked: 0.5,
      amount_snapshot: 100,
      labor_cost_snapshot: 100,
    },
    {
      ...common,
      id: ids.morningOnly,
      project_id: ids.projectA,
      work_date: dates.morningOnly,
      hours: 0.5,
      cost_amount: 100,
      morning: true,
      afternoon: false,
      notes: `${PREFIX} morning only session=morning`,
      days_worked: 0.5,
      amount_snapshot: 100,
      labor_cost_snapshot: 100,
    },
    {
      ...common,
      id: ids.fullDay,
      project_id: ids.projectA,
      work_date: dates.fullDay,
      hours: 1,
      cost_amount: 200,
      morning: true,
      afternoon: true,
      notes: `${PREFIX} full day session=full_day`,
      days_worked: 1,
      amount_snapshot: 200,
      labor_cost_snapshot: 200,
    },
    {
      ...common,
      id: ids.fullDayOt,
      project_id: ids.projectA,
      work_date: dates.fullDayOt,
      hours: 1,
      cost_amount: 250,
      morning: true,
      afternoon: true,
      notes: `${PREFIX} full day overtime session=full_day ot_amount=50`,
      days_worked: 1,
      amount_snapshot: 250,
      labor_cost_snapshot: 250,
    },
  ]);
  if (entriesError) throw new Error(`Failed to seed labor entries: ${entriesError.message}`);
}

async function laborEntries(client: SupabaseClient) {
  const { data, error } = await client
    .from("labor_entries")
    .select("id, project_id, work_date, cost_amount, notes, morning, afternoon")
    .eq("worker_id", ids.worker)
    .order("work_date", { ascending: true });
  if (error) throw new Error(`Failed to read marker labor entries: ${error.message}`);
  return data ?? [];
}

async function rawCostSum(client: SupabaseClient): Promise<number> {
  const rows = await laborEntries(client);
  return rows.reduce((sum, row) => sum + (Number(row.cost_amount) || 0), 0);
}

function dailyEntriesSection(page: Page) {
  return page.locator("section").filter({ hasText: /Daily entries/i });
}

async function openDate(page: Page, date: string) {
  const section = dailyEntriesSection(page);
  const button = section
    .getByRole("button")
    .filter({ hasText: compactDateLabel(date) })
    .first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const dateContainer = button.locator("xpath=..");
  const table = dateContainer.locator("table").filter({ hasText: "Total Pay" }).first();
  await expect(table).toBeVisible();
  return { section, button, table };
}

async function openDateMobile(page: Page, date: string) {
  const section = dailyEntriesSection(page);
  const button = section
    .getByRole("button")
    .filter({ hasText: compactDateLabel(date) })
    .first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  await expect(button).toHaveAttribute("aria-expanded", "true");
  return { section, button };
}

test.describe("Daily Labor grouped split sessions", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeAll(async () => {
    admin = envClient();
    await seed(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanup(admin);
  });

  test("groups Morning and Afternoon display rows while child edit/delete stays entry-specific", async ({
    browser,
  }) => {
    expect(admin).toBeTruthy();
    const client = admin!;
    expect(await rawCostSum(client)).toBe(750);

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    try {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
      });

      await page.goto(`${BASE}/labor?month=${currentMonth()}`);
      await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible({
        timeout: 30_000,
      });
      await page.locator("select").nth(2).selectOption(ids.worker);

      const split = await openDate(page, dates.split);
      await expect(split.button).toContainText("2 entries");
      await expect(split.button).toContainText(money(200));
      const groupToggle = split.section.getByRole("button", {
        name: new RegExp(`^Expand ${workerName} session details$`),
      });
      await expect(groupToggle).toBeVisible();
      const groupRow = split.table
        .locator("tbody tr")
        .filter({ hasText: workerName })
        .filter({ hasText: "Morning + Afternoon" })
        .first();
      await expect(groupRow).toContainText(workerName);
      await expect(groupRow).toContainText("2 Projects");
      await expect(groupRow).toContainText("Morning + Afternoon");
      await expect(groupRow).toContainText(money(200));
      await expect(groupRow).not.toContainText(projectAName);
      await expect(groupRow).not.toContainText(projectBName);

      await groupToggle.click();
      await expect(
        split.section.getByRole("button", { name: `Edit Morning entry for ${workerName}` })
      ).toBeVisible();
      await expect(
        split.section.getByRole("button", { name: `Delete Afternoon entry for ${workerName}` })
      ).toBeVisible();
      await expect(
        split.table
          .locator("tbody tr")
          .filter({ hasText: projectAName })
          .filter({ hasText: "Morning" })
      ).toContainText(money(100));
      await expect(
        split.table
          .locator("tbody tr")
          .filter({ hasText: projectBName })
          .filter({ hasText: "Afternoon" })
      ).toContainText(money(100));

      await page.screenshot({
        path: "test-results/labor-daily-grouped-sessions-expanded.png",
        fullPage: true,
      });

      const morningOnly = await openDate(page, dates.morningOnly);
      await expect(morningOnly.table.locator("tbody tr")).toHaveCount(1);
      await expect(morningOnly.table.locator("tbody tr").first()).toContainText("Morning");
      await expect(morningOnly.table.locator("tbody tr").first()).toContainText(money(100));
      await expect(morningOnly.table.locator('button[aria-label*="session details"]')).toHaveCount(
        0
      );

      const fullDay = await openDate(page, dates.fullDay);
      await expect(fullDay.table.locator("tbody tr")).toHaveCount(1);
      await expect(fullDay.table.locator("tbody tr").first()).toContainText("Full Day");
      await expect(fullDay.table.locator("tbody tr").first()).toContainText(money(200));
      await expect(fullDay.table.locator('button[aria-label*="session details"]')).toHaveCount(0);

      const fullDayOt = await openDate(page, dates.fullDayOt);
      await expect(fullDayOt.table.locator("tbody tr")).toHaveCount(1);
      await expect(fullDayOt.table.locator("tbody tr").first()).toContainText("Full Day + OT");
      await expect(fullDayOt.table.locator("tbody tr").first()).toContainText(money(250));
      await expect(fullDayOt.table.locator('button[aria-label*="session details"]')).toHaveCount(0);

      await openDate(page, dates.split);
      await split.section
        .getByRole("button", { name: `Edit Morning entry for ${workerName}` })
        .click();
      const editDialog = page.getByRole("dialog", { name: /Edit Entry/i });
      await expect(editDialog).toBeVisible({ timeout: 30_000 });
      await editDialog.getByLabel("Overtime Fixed Amount").fill("20");
      await expect(editDialog).toContainText("Total");
      await expect(editDialog).toContainText(money(120));
      await editDialog.getByRole("button", { name: /Save Changes/i }).click();
      await expect(editDialog).toBeHidden({ timeout: 30_000 });

      await expect
        .poll(async () => {
          const rows = await laborEntries(client);
          const morning = rows.find((row) => row.id === ids.splitMorning);
          const afternoon = rows.find((row) => row.id === ids.splitAfternoon);
          return {
            count: rows.length,
            morningAmount: Number(morning?.cost_amount ?? 0),
            morningNotes: String(morning?.notes ?? ""),
            afternoonAmount: Number(afternoon?.cost_amount ?? 0),
          };
        })
        .toEqual({
          count: 5,
          morningAmount: 120,
          morningNotes: expect.stringContaining("ot_amount=20"),
          afternoonAmount: 100,
        });

      const editedSplit = await openDate(page, dates.split);
      await expect(editedSplit.button).toContainText(money(220));
      await expect(
        editedSplit.table
          .locator("tbody tr")
          .filter({ hasText: "Morning + Afternoon" })
          .filter({ hasText: money(220) })
      ).toBeVisible();

      page.once("dialog", async (dialog) => {
        await dialog.accept();
      });
      await editedSplit.section
        .getByRole("button", { name: `Delete Afternoon entry for ${workerName}` })
        .click();
      await expect
        .poll(async () => {
          const rows = await laborEntries(client);
          return {
            count: rows.length,
            hasAfternoon: rows.some((row) => row.id === ids.splitAfternoon),
            hasMorning: rows.some((row) => row.id === ids.splitMorning),
            sum: rows.reduce((total, row) => total + (Number(row.cost_amount) || 0), 0),
          };
        })
        .toEqual({ count: 4, hasAfternoon: false, hasMorning: true, sum: 670 });

      const afterDelete = await openDate(page, dates.split);
      await expect(afterDelete.button).toContainText("1 entries");
      await expect(afterDelete.button).toContainText(money(120));
      await expect(afterDelete.table.locator("tbody tr")).toHaveCount(1);
      await expect(afterDelete.table.locator("tbody tr").first()).toContainText("Morning + OT");
      await expect(afterDelete.table.locator("tbody tr").first()).toContainText(money(120));
      await expect(afterDelete.table.locator('button[aria-label*="session details"]')).toHaveCount(
        0
      );

      await page.goto(`${BASE}/labor/worker-balances`);
      await expect(page.getByRole("heading", { name: "Worker Balances" })).toBeVisible({
        timeout: 30_000,
      });
      await page.goto(`${BASE}/labor/payroll`);
      await expect(page.getByRole("heading", { name: "Payroll Summary" })).toBeVisible({
        timeout: 30_000,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}/labor?month=${currentMonth()}`);
      await page.locator("select").nth(2).selectOption(ids.worker);
      const mobileSplit = await openDateMobile(page, dates.split);
      await expect(
        mobileSplit.section.locator(".md\\:hidden").getByText(workerName).first()
      ).toBeVisible();
      await expect(
        mobileSplit.section.getByRole("button", {
          name: new RegExp(`^Expand ${workerName} session details$`),
        })
      ).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          )
        )
        .toBe(true);

      expect(serverErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
