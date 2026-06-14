import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "LOCAL-WORKER-WORKTAB-OT-QA-DELETE-ME";
const RUN = Date.now();
const ids = {
  worker: randomUUID(),
  project: randomUUID(),
  mayFirstFull: randomUUID(),
  maySecondOt: randomUUID(),
  mayThirdFull: randomUUID(),
  aprilFull: randomUUID(),
};
const workerName = `${PREFIX} Worker ${RUN}`;
const projectName = `${PREFIX} Project ${RUN}`;

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  assertE2EBaseUrlSafeForMutations(BASE, "worker Work tab collapse browser E2E mutation");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
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

async function deleteByIds(
  client: SupabaseClient,
  table: string,
  column: string,
  idsToDelete: string[]
) {
  if (idsToDelete.length === 0) return;
  const { error } = await client.from(table).delete().in(column, idsToDelete);
  if (error) throw new Error(`Failed to cleanup ${table}.${column}: ${error.message}`);
}

async function cleanup(client: SupabaseClient): Promise<void> {
  await deleteByIds(client, "worker_payments", "worker_id", [ids.worker]);
  await deleteByIds(client, "worker_reimbursements", "worker_id", [ids.worker]);
  await deleteByIds(client, "worker_advances", "worker_id", [ids.worker]);
  await deleteByIds(client, "worker_receipts", "worker_id", [ids.worker]);
  await deleteByIds(client, "labor_entries", "worker_id", [ids.worker]);
  await deleteByIds(client, "worker_rate_history", "worker_id", [ids.worker]);
  await deleteByIds(client, "labor_workers", "id", [ids.worker]);
  await deleteByIds(client, "workers", "id", [ids.worker]);
  await deleteByIds(client, "projects", "id", [ids.project]);
}

async function seedWorkerWork(client: SupabaseClient): Promise<void> {
  await cleanup(client);
  await insertFirstSuccess(client, "projects", [
    { id: ids.project, name: projectName, status: "active", budget: 0, spent: 0 },
    { id: ids.project, name: projectName, status: "active" },
  ]);
  await insertFirstSuccess(client, "workers", [
    {
      id: ids.worker,
      name: workerName,
      role: "QA",
      phone: "555-0199",
      half_day_rate: 100,
      daily_rate: 200,
      status: "active",
      notes: PREFIX,
    },
  ]);
  await upsertFirstSuccess(client, "labor_workers", [
    { id: ids.worker, name: workerName, active: true, rate: 200, type: "QA" },
    { id: ids.worker, name: workerName },
  ]);
  const laborRows = [
    {
      id: ids.mayThirdFull,
      worker_id: ids.worker,
      project_id: ids.project,
      work_date: "2026-05-03",
      hours: 1,
      cost_code: "QA",
      notes: `${PREFIX} may 03 full day_type=full_day`,
      cost_amount: 200,
      status: "Draft",
      daily_rate_snapshot: 200,
      days_worked: 1,
      amount_snapshot: 200,
      labor_cost_snapshot: 200,
    },
    {
      id: ids.maySecondOt,
      worker_id: ids.worker,
      project_id: ids.project,
      work_date: "2026-05-02",
      hours: 1,
      cost_code: "QA",
      notes: `${PREFIX} may 02 full overtime day_type=full_day ot_amount=200`,
      cost_amount: 400,
      status: "Draft",
      daily_rate_snapshot: 200,
      days_worked: 1,
      amount_snapshot: 400,
      labor_cost_snapshot: 400,
    },
    {
      id: ids.mayFirstFull,
      worker_id: ids.worker,
      project_id: ids.project,
      work_date: "2026-05-01",
      hours: 1,
      cost_code: "QA",
      notes: `${PREFIX} may 01 full day_type=full_day`,
      cost_amount: 200,
      status: "Draft",
      daily_rate_snapshot: 200,
      days_worked: 1,
      amount_snapshot: 200,
      labor_cost_snapshot: 200,
    },
    {
      id: ids.aprilFull,
      worker_id: ids.worker,
      project_id: ids.project,
      work_date: "2026-04-15",
      hours: 1,
      cost_code: "QA",
      notes: `${PREFIX} april full day_type=full_day`,
      cost_amount: 200,
      status: "Draft",
      morning: true,
      afternoon: true,
      days_worked: 1,
      daily_rate_snapshot: 200,
      amount_snapshot: 200,
      labor_cost_snapshot: 200,
    },
  ];
  for (const row of laborRows) {
    await insertFirstSuccess(client, "labor_entries", [row]);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Worker detail Work tab month collapse", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    await seedWorkerWork(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanup(admin);
  });

  test("groups time entries by month with safe snapshot totals and mobile cards", async ({
    page,
  }) => {
    test.skip(!admin, "Requires local E2E Supabase service role credentials.");

    await page.goto(`${BASE}/workers/${encodeURIComponent(ids.worker)}?tab=work`);
    await expect(page.getByRole("heading", { name: workerName })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("worker-work-month-groups")).toBeVisible({
      timeout: 30_000,
    });

    const may = page.getByTestId("worker-work-month-2026-05");
    const april = page.getByTestId("worker-work-month-2026-04");
    await expect(may).toBeVisible();
    await expect(april).toBeVisible();

    const mayToggle = may.getByRole("button", { name: /May 2026/i });
    const aprilToggle = april.getByRole("button", { name: /Apr 2026/i });
    await expect(mayToggle).toHaveAttribute("aria-expanded", "true");
    await expect(aprilToggle).toHaveAttribute("aria-expanded", "false");
    await expect(may).toContainText("3 days");
    await expect(may).toContainText("$800.00");
    await expect(may).toContainText("1 project");
    const mayRows = may.getByTestId("worker-work-entry-row");
    await expect(mayRows).toHaveCount(3);
    await expect(mayRows.nth(0).locator("td").nth(0)).toHaveText("May 01, 2026");
    await expect(mayRows.nth(0).locator("td").nth(2)).toHaveText("Full");
    await expect(mayRows.nth(0).locator("td").nth(3)).toHaveText("$200.00");
    await expect(mayRows.nth(1).locator("td").nth(0)).toHaveText("May 02, 2026");
    await expect(mayRows.nth(1).locator("td").nth(2)).toHaveText("Full + OT $200");
    await expect(mayRows.nth(1).locator("td").nth(3)).toHaveText("$400.00");
    await expect(mayRows.nth(2).locator("td").nth(0)).toHaveText("May 03, 2026");
    await expect(mayRows.nth(2).locator("td").nth(2)).toHaveText("Full");
    await expect(mayRows.nth(2).locator("td").nth(3)).toHaveText("$200.00");
    await expect(may).not.toContainText("$1,000.00");
    await expect(april.getByText(/Apr 15, 2026/i)).not.toBeVisible();

    await page.getByRole("button", { name: /^Expand all$/i }).click();
    await expect(aprilToggle).toHaveAttribute("aria-expanded", "true");
    await expect(april.getByText(/Apr 15, 2026/i)).toBeVisible();

    await page.getByRole("button", { name: /^Collapse all$/i }).click();
    await expect(mayToggle).toHaveAttribute("aria-expanded", "false");
    await expect(aprilToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("worker-work-entry-row")).toHaveCount(0);

    await page.goto(
      `${BASE}/workers/${encodeURIComponent(ids.worker)}?tab=work&entryId=${encodeURIComponent(
        ids.aprilFull
      )}`
    );
    await expect(page.getByTestId("worker-work-month-groups")).toBeVisible({
      timeout: 30_000,
    });
    await expect(aprilToggle).toHaveAttribute("aria-expanded", "true");
    await expect(april.getByText(/Apr 15, 2026/i)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/workers/${encodeURIComponent(ids.worker)}?tab=work`);
    await expect(page.getByTestId("worker-work-month-groups")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("worker-work-entry-card")).toHaveCount(3);
    await expect(page.getByTestId("worker-work-month-2026-05")).toContainText("3 days");
    await expect(
      page.getByTestId("worker-work-entry-card").filter({ hasText: "May 2" })
    ).toContainText("Full + OT $200");
    await expect(
      page.getByTestId("worker-work-entry-card").filter({ hasText: "May 2" })
    ).toContainText("$400.00");
    await expectNoHorizontalOverflow(page);
    const monthToggleHeight = await page
      .getByTestId("worker-work-month-2026-05")
      .getByRole("button", { name: /May 2026/i })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(monthToggleHeight).toBeGreaterThanOrEqual(44);
  });
});
