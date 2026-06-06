import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

function hashTestPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, 210_000, 32, "sha256");
  return {
    hash: hash.toString("base64url"),
    salt: salt.toString("base64url"),
  };
}

async function seedTestLoginPin(pin = "1234"): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Boundary tests require NEXT_PUBLIC_SUPABASE_URL and service role key.");
  }

  const { hash, salt } = hashTestPin(pin);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.from("app_security_settings").upsert(
    {
      key: "login_pin",
      pin_hash: hash,
      pin_salt: salt,
      session_version: 1,
      updated_by: "playwright",
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`Failed to seed login PIN: ${error.message}`);
}

function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Boundary tests require NEXT_PUBLIC_SUPABASE_URL and service role key.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isoDateOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function compactDateLabel(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1)
  );
}

async function expectJsonMessage(
  response: { json(): Promise<unknown> },
  pattern: RegExp
): Promise<void> {
  const body = (await response.json()) as { message?: unknown };
  expect(String(body.message ?? "")).toMatch(pattern);
}

const DAILY_ENTRY_FULL_FLOW_PREFIX = "LOCAL-DAILY-ENTRY-FLOW-DELETE-ME";

async function cleanupDailyEntryFullFlowData(db: SupabaseClient): Promise<void> {
  const { data: workerRows, error: workersError } = await db
    .from("workers")
    .select("id")
    .like("name", `${DAILY_ENTRY_FULL_FLOW_PREFIX}%`);
  if (workersError)
    throw new Error(`Failed to find daily entry flow workers: ${workersError.message}`);

  const { data: projectRows, error: projectsError } = await db
    .from("projects")
    .select("id")
    .like("name", `${DAILY_ENTRY_FULL_FLOW_PREFIX}%`);
  if (projectsError) {
    throw new Error(`Failed to find daily entry flow projects: ${projectsError.message}`);
  }

  const workerIds = (workerRows ?? []).map((row) => String(row.id)).filter(Boolean);
  const projectIds = (projectRows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (workerIds.length > 0) {
    const { error } = await db.from("labor_entries").delete().in("worker_id", workerIds);
    if (error)
      throw new Error(`Failed to delete daily entry flow worker entries: ${error.message}`);
  }
  if (projectIds.length > 0) {
    const { error } = await db.from("labor_entries").delete().in("project_id", projectIds);
    if (error)
      throw new Error(`Failed to delete daily entry flow project entries: ${error.message}`);
  }
  if (workerIds.length > 0) {
    const { error: laborWorkersError } = await db
      .from("labor_workers")
      .delete()
      .in("id", workerIds);
    if (laborWorkersError) {
      throw new Error(
        `Failed to delete daily entry flow labor workers: ${laborWorkersError.message}`
      );
    }
    const { error: workersDeleteError } = await db.from("workers").delete().in("id", workerIds);
    if (workersDeleteError) {
      throw new Error(`Failed to delete daily entry flow workers: ${workersDeleteError.message}`);
    }
  }
  if (projectIds.length > 0) {
    const { error } = await db.from("projects").delete().in("id", projectIds);
    if (error) throw new Error(`Failed to delete daily entry flow projects: ${error.message}`);
  }
}

async function dailyEntryFullFlowCounts(
  db: SupabaseClient
): Promise<{ workers: number; projects: number; laborEntries: number }> {
  const { data: workerRows, error: workersError } = await db
    .from("workers")
    .select("id")
    .like("name", `${DAILY_ENTRY_FULL_FLOW_PREFIX}%`);
  if (workersError)
    throw new Error(`Failed to count daily entry flow workers: ${workersError.message}`);

  const { data: projectRows, error: projectsError } = await db
    .from("projects")
    .select("id")
    .like("name", `${DAILY_ENTRY_FULL_FLOW_PREFIX}%`);
  if (projectsError) {
    throw new Error(`Failed to count daily entry flow projects: ${projectsError.message}`);
  }

  const workerIds = (workerRows ?? []).map((row) => String(row.id)).filter(Boolean);
  const projectIds = (projectRows ?? []).map((row) => String(row.id)).filter(Boolean);
  let laborEntryIds = new Set<string>();
  if (workerIds.length > 0) {
    const { data, error } = await db.from("labor_entries").select("id").in("worker_id", workerIds);
    if (error) throw new Error(`Failed to count daily entry flow worker entries: ${error.message}`);
    for (const row of data ?? []) laborEntryIds.add(String(row.id));
  }
  if (projectIds.length > 0) {
    const { data, error } = await db
      .from("labor_entries")
      .select("id")
      .in("project_id", projectIds);
    if (error)
      throw new Error(`Failed to count daily entry flow project entries: ${error.message}`);
    for (const row of data ?? []) laborEntryIds.add(String(row.id));
  }
  return {
    workers: workerIds.length,
    projects: projectIds.length,
    laborEntries: laborEntryIds.size,
  };
}

test.describe("bank and labor server API boundary", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin("1234");
  });

  test.afterEach(async () => {
    await seedTestLoginPin("1234");
  });

  test("owner no-login mode can reach bank and labor server APIs", async ({ request }) => {
    for (const path of [
      "/api/financial/bank-transactions?view=summary",
      "/api/financial/bank-transactions?view=reconcile",
      "/api/labor/entries",
      "/api/labor/payments",
      "/api/labor/worker-payments",
      "/api/labor/payroll-summary?fromDate=2026-05-01&toDate=2026-05-31",
      "/api/worker-reimbursements",
      "/api/worker-reimbursements/balances",
    ]) {
      const response = await request.get(path, { headers: LOCKED_HEADERS });
      expect(response.status(), `GET ${path}`).toBeLessThan(500);
      expect(response.status(), `GET ${path}`).not.toBe(401);
      expect(response.status(), `GET ${path}`).not.toBe(403);
    }

    const patchResponse = await request.patch("/api/labor/entries", {
      headers: LOCKED_HEADERS,
      data: { action: "submit", ids: ["00000000-0000-0000-0000-000000000000"] },
    });
    expect(patchResponse.status()).not.toBe(401);
    expect(patchResponse.status()).not.toBe(403);
  });

  test("PIN session can read bank and labor server APIs but cannot bypass destructive routes", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });

    const loginResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "1234" },
    });
    expect(loginResponse.status()).toBe(200);

    for (const path of [
      "/api/financial/bank-transactions?view=summary",
      "/api/financial/bank-transactions?view=reconcile",
      "/api/labor/entries",
      "/api/labor/payments",
      "/api/labor/worker-payments",
      "/api/labor/payroll-summary?fromDate=2026-05-01&toDate=2026-05-31",
      "/api/worker-reimbursements",
      "/api/worker-reimbursements/balances",
    ]) {
      const response = await context.request.get(path);
      expect(response.status(), `GET ${path}`).toBeLessThan(500);
      expect(response.status(), `GET ${path}`).not.toBe(401);
      expect(response.status(), `GET ${path}`).not.toBe(403);
    }

    const wipeResponse = await context.request.post("/api/production/wipe-database", {
      data: {},
    });
    expect(wipeResponse.status()).toBe(403);
    await context.close();
  });

  test("PIN session can load bank and labor pages through guarded server APIs", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const loginResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "1234" },
    });
    expect(loginResponse.status()).toBe(200);

    await page.goto("/financial/bank");
    await expect(page.getByRole("heading", { name: "Bank Reconcile" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.route(
      /\/rest\/v1\/(?:labor_entries|labor_payments|worker_payments)(?:\?|$)/,
      async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: "permission denied for table blocked_by_boundary_test",
          }),
        });
      }
    );

    await page.goto("/labor");
    await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.goto("/labor/entries");
    await expect(page.getByRole("heading", { name: "Daily Entries" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.goto("/labor/payments");
    await expect(page.getByRole("heading", { name: "Worker Payments" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.goto("/labor/worker-balances");
    await expect(page.getByRole("heading", { name: "Worker Balances" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.route(
      /\/rest\/v1\/(?:worker_reimbursements|worker_advances)(?:\?|$)/,
      async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: "permission denied for table blocked_by_boundary_test",
          }),
        });
      }
    );

    await page.goto("/labor/payroll");
    await expect(page.getByRole("heading", { name: "Payroll Summary" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);
    await expect(page.getByText("Total Earned")).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/labor/reimbursements");
    await expect(page.getByRole("heading", { name: "Worker Reimbursements" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await context.close();
  });

  test("guarded labor API rejects duplicate worker date sessions across projects", async ({
    browser,
  }) => {
    const db = serviceRoleClient();
    const tag = `duplicate-session-${Date.now()}`;
    const { data: projects, error: projectsError } = await db
      .from("projects")
      .insert([
        { name: `[E2E] Duplicate Session A ${tag}`, status: "Active", budget: 0, spent: 0 },
        { name: `[E2E] Duplicate Session B ${tag}`, status: "Active", budget: 0, spent: 0 },
      ])
      .select("id");
    expect(projectsError).toBeNull();
    expect(projects?.length).toBe(2);

    const { data: worker, error: workerError } = await db
      .from("workers")
      .insert({
        name: `[E2E] Duplicate Guard Worker ${tag}`,
        half_day_rate: 100,
        daily_rate: 200,
        status: "active",
      })
      .select("id")
      .single();
    expect(workerError).toBeNull();

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    try {
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const fullDayDate = isoDateOffset(-20);
      const firstFullDayResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![0]!.id,
          workDate: fullDayDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: true }],
        },
      });
      expect(firstFullDayResponse.status()).toBe(200);

      const duplicateFullDayResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![1]!.id,
          workDate: fullDayDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: true }],
        },
      });
      expect(duplicateFullDayResponse.status()).toBe(409);
      await expectJsonMessage(duplicateFullDayResponse, /already has.*date\/session/i);

      const fullDayJoinedResponse = await context.request.get(
        `/api/labor/entries?view=joined&workerId=${encodeURIComponent(
          worker!.id
        )}&dateFrom=${encodeURIComponent(fullDayDate)}&dateTo=${encodeURIComponent(fullDayDate)}`
      );
      expect(fullDayJoinedResponse.status()).toBe(200);
      const fullDayJoinedBody = (await fullDayJoinedResponse.json()) as {
        entries?: Array<{ cost_amount?: number | null }>;
      };
      expect(fullDayJoinedBody.entries ?? []).toHaveLength(1);
      expect(
        (fullDayJoinedBody.entries ?? []).reduce(
          (sum, entry) => sum + (Number(entry.cost_amount) || 0),
          0
        )
      ).toBe(200);

      const page = await context.newPage();
      await page.goto(
        `/labor?workerId=${encodeURIComponent(worker!.id)}&month=${encodeURIComponent(
          fullDayDate.slice(0, 7)
        )}`
      );
      await expect(page.getByRole("button", { name: /Add Entry/i }).first()).toBeVisible({
        timeout: 30_000,
      });
      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      const fullDayDialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(fullDayDialog).toBeVisible({ timeout: 30_000 });
      await fullDayDialog.locator('input[type="date"]').fill(fullDayDate);
      const fullDayWorkerRow = fullDayDialog
        .getByRole("row")
        .filter({ hasText: `[E2E] Duplicate Guard Worker ${tag}` })
        .first();
      await expect(fullDayWorkerRow).toContainText(/Already has full day/i, { timeout: 30_000 });
      await expect(fullDayWorkerRow.getByRole("button", { name: "AM" })).toBeDisabled();
      await expect(fullDayWorkerRow.getByRole("button", { name: "PM" })).toBeDisabled();
      const viewExistingEntry = fullDayWorkerRow.getByRole("link", { name: /^View$/i });
      await expect(viewExistingEntry).toBeVisible();
      await viewExistingEntry.click();
      await expect(page).toHaveURL(
        new RegExp(
          `/labor\\?(?=.*workerId=${worker!.id})(?=.*month=${fullDayDate.slice(0, 7)})(?=.*entryId=)`
        ),
        { timeout: 30_000 }
      );

      const splitSessionDate = isoDateOffset(-19);
      const morningResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![0]!.id,
          workDate: splitSessionDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: false }],
        },
      });
      expect(morningResponse.status()).toBe(200);

      const duplicateMorningResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![1]!.id,
          workDate: splitSessionDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: false }],
        },
      });
      expect(duplicateMorningResponse.status()).toBe(409);
      await expectJsonMessage(duplicateMorningResponse, /already has.*date\/session/i);

      const afternoonResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![1]!.id,
          workDate: splitSessionDate,
          rows: [{ workerId: worker!.id, morning: false, afternoon: true }],
        },
      });
      expect(afternoonResponse.status()).toBe(200);

      const splitJoinedResponse = await context.request.get(
        `/api/labor/entries?view=joined&workerId=${encodeURIComponent(
          worker!.id
        )}&dateFrom=${encodeURIComponent(splitSessionDate)}&dateTo=${encodeURIComponent(
          splitSessionDate
        )}`
      );
      expect(splitJoinedResponse.status()).toBe(200);
      const splitJoinedBody = (await splitJoinedResponse.json()) as {
        entries?: Array<{ cost_amount?: number | null }>;
      };
      expect(splitJoinedBody.entries ?? []).toHaveLength(2);
      expect(
        (splitJoinedBody.entries ?? []).reduce(
          (sum, entry) => sum + (Number(entry.cost_amount) || 0),
          0
        )
      ).toBe(200);

      const duplicateRequestDate = isoDateOffset(-18);
      const duplicateRequestResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![0]!.id,
          workDate: duplicateRequestDate,
          rows: [
            { workerId: worker!.id, morning: true, afternoon: false },
            { workerId: worker!.id, morning: true, afternoon: false },
          ],
        },
      });
      expect(duplicateRequestResponse.status()).toBe(409);
      await expectJsonMessage(duplicateRequestResponse, /already has.*date\/session/i);

      const duplicateRequestJoinedResponse = await context.request.get(
        `/api/labor/entries?view=joined&workerId=${encodeURIComponent(
          worker!.id
        )}&dateFrom=${encodeURIComponent(duplicateRequestDate)}&dateTo=${encodeURIComponent(
          duplicateRequestDate
        )}`
      );
      expect(duplicateRequestJoinedResponse.status()).toBe(200);
      const duplicateRequestJoinedBody = (await duplicateRequestJoinedResponse.json()) as {
        entries?: Array<unknown>;
      };
      expect(duplicateRequestJoinedBody.entries ?? []).toHaveLength(0);

      const hiddenDate = isoDateOffset(-17);
      const { error: hiddenInsertError } = await db.from("labor_entries").insert({
        worker_id: worker!.id,
        project_id: projects![0]!.id,
        work_date: hiddenDate,
        cost_amount: 200,
        status: "cancelled",
        morning: true,
        afternoon: true,
        notes: "hidden duplicate guard regression",
      });
      expect(hiddenInsertError).toBeNull();

      await page.goto(
        `/labor?workerId=${encodeURIComponent(worker!.id)}&month=${encodeURIComponent(
          hiddenDate.slice(0, 7)
        )}`
      );
      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      const hiddenDialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(hiddenDialog).toBeVisible({ timeout: 30_000 });
      await hiddenDialog.locator('input[type="date"]').fill(hiddenDate);
      const hiddenWorkerRow = hiddenDialog
        .getByRole("row")
        .filter({ hasText: `[E2E] Duplicate Guard Worker ${tag}` })
        .first();
      await expect(hiddenWorkerRow).toBeVisible({ timeout: 30_000 });
      await expect(hiddenWorkerRow).not.toContainText(/already/i);
      await expect(hiddenWorkerRow.getByRole("button", { name: "AM" })).toBeEnabled();
      await expect(hiddenWorkerRow.getByRole("button", { name: "PM" })).toBeEnabled();
      await page.keyboard.press("Escape");

      const createOverHiddenResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: projects![1]!.id,
          workDate: hiddenDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: true }],
        },
      });
      expect(createOverHiddenResponse.status()).toBe(200);

      const hiddenDateResponse = await context.request.get(
        `/api/labor/entries?date=${encodeURIComponent(hiddenDate)}`
      );
      expect(hiddenDateResponse.status()).toBe(200);
      const hiddenDateBody = (await hiddenDateResponse.json()) as {
        entries?: Array<{
          status?: string | null;
          worker_id?: string;
          morning?: boolean;
          afternoon?: boolean;
        }>;
      };
      const visibleEntriesForWorker = (hiddenDateBody.entries ?? []).filter(
        (entry) => entry.worker_id === worker!.id
      );
      expect(visibleEntriesForWorker).toHaveLength(1);
      expect(String(visibleEntriesForWorker[0]?.status ?? "").toLowerCase()).not.toBe("cancelled");
      expect(visibleEntriesForWorker[0]).toMatchObject({ morning: true, afternoon: true });
    } finally {
      if (worker?.id) {
        await db.from("labor_entries").delete().eq("worker_id", worker.id);
        await db.from("labor_workers").delete().eq("id", worker.id);
        await db.from("workers").delete().eq("id", worker.id);
      }
      if (projects?.length) {
        await db
          .from("projects")
          .delete()
          .in(
            "id",
            projects.map((project) => project.id)
          );
      }
      await context.close();
    }
  });

  test("Add Daily Entry clears unsaved worker selections when date changes", async ({
    browser,
  }) => {
    const db = serviceRoleClient();
    const tag = `daily-date-reset-${Date.now()}`;
    const workerName = `[E2E] Daily Date Reset Worker ${tag}`;
    const dateA = isoDateOffset(-16);
    const dateB = isoDateOffset(-15);
    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ name: `[E2E] Daily Date Reset ${tag}`, status: "Active", budget: 0, spent: 0 })
      .select("id")
      .single();
    expect(projectError).toBeNull();

    const { data: worker, error: workerError } = await db
      .from("workers")
      .insert({
        name: workerName,
        half_day_rate: 100,
        daily_rate: 200,
        status: "active",
      })
      .select("id")
      .single();
    expect(workerError).toBeNull();

    const { data: existingDateB, error: existingDateBError } = await db
      .from("labor_entries")
      .insert({
        worker_id: worker!.id,
        project_id: project!.id,
        work_date: dateB,
        hours: 0.5,
        cost_amount: 100,
        status: "Draft",
        morning: true,
        afternoon: false,
        notes: `${tag} existing date b`,
      })
      .select("id")
      .single();
    expect(existingDateBError).toBeNull();

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    try {
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      const waitForLaborOptionsForDate = (date: string) =>
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "GET" &&
            url.pathname === "/api/labor/entries" &&
            url.searchParams.get("date") === date &&
            response.ok()
          );
        });
      await page.goto(
        `/labor?workerId=${encodeURIComponent(worker!.id)}&month=${dateA.slice(0, 7)}`
      );
      await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible({
        timeout: 30_000,
      });
      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      const projectSelect = dialog.locator("select").first();
      const dateInput = dialog.locator('input[type="date"]');
      const optionalInputs = dialog.locator('input[placeholder="Optional"]');
      const costCodeInput = optionalInputs.nth(0);
      const notesInput = optionalInputs.nth(1);

      await projectSelect.selectOption(project!.id);
      const dateAOptionsResponse = waitForLaborOptionsForDate(dateA);
      await dateInput.fill(dateA);
      await dateAOptionsResponse;
      await costCodeInput.fill(`CC-${tag}`);
      await notesInput.fill(`notes ${tag}`);
      await expect(projectSelect).toHaveValue(project!.id);
      await expect(dateInput).toHaveValue(dateA);
      await dialog.getByRole("button", { name: /^Save$/i }).click();
      await expect(dialog.getByText("Select at least one worker with AM or PM.")).toBeVisible();

      let workerRow = dialog.getByRole("row").filter({ hasText: workerName }).first();
      await expect(workerRow).toBeVisible({ timeout: 30_000 });
      await workerRow.getByRole("button", { name: "AM" }).click();
      await expect(workerRow).toContainText("$100.00");
      await workerRow.getByRole("button", { name: "PM" }).click();
      await workerRow.getByLabel(`Overtime hours for ${workerName}`).fill("1.5");
      await workerRow.getByLabel(`Overtime fixed amount for ${workerName}`).fill("60");
      await expect(workerRow).toContainText("$200.00");

      const dateBOptionsResponse = waitForLaborOptionsForDate(dateB);
      await dateInput.fill(dateB);
      await dateBOptionsResponse;
      await expect(dateInput).toHaveValue(dateB);
      workerRow = dialog.getByRole("row").filter({ hasText: workerName }).first();
      await expect(workerRow).toContainText("AM already entered", { timeout: 30_000 });
      await expect(workerRow.getByRole("button", { name: "AM" })).toBeDisabled();
      await expect(workerRow.getByRole("button", { name: "PM" })).toBeEnabled();
      await expect(workerRow.getByLabel(`Overtime hours for ${workerName}`)).toHaveValue("");
      await expect(workerRow.getByLabel(`Overtime fixed amount for ${workerName}`)).toHaveValue("");
      await expect(workerRow).not.toContainText("$200.00");
      await expect(workerRow).toContainText("—");
      await expect(dialog.getByText("Select at least one worker with AM or PM.")).toHaveCount(0);
      await expect(projectSelect).toHaveValue(project!.id);
      await expect(costCodeInput).toHaveValue(`CC-${tag}`);
      await expect(notesInput).toHaveValue(`notes ${tag}`);

      await dialog.getByRole("button", { name: /^Save$/i }).click();
      await expect(dialog.getByText("Select at least one worker with AM or PM.")).toBeVisible();

      const { data: savedRows, error: savedRowsError } = await db
        .from("labor_entries")
        .select("id, work_date, morning, afternoon, notes")
        .eq("worker_id", worker!.id)
        .in("work_date", [dateA, dateB])
        .order("work_date");
      expect(savedRowsError).toBeNull();
      expect(savedRows ?? []).toHaveLength(1);
      expect(savedRows?.[0]).toMatchObject({
        id: existingDateB!.id,
        work_date: dateB,
        morning: true,
        afternoon: false,
      });
    } finally {
      if (worker?.id) await db.from("labor_entries").delete().eq("worker_id", worker.id);
      if (project?.id) await db.from("projects").delete().eq("id", project.id);
      if (worker?.id) {
        await db.from("labor_workers").delete().eq("id", worker.id);
        await db.from("workers").delete().eq("id", worker.id);
      }
      await context.close();
    }
  });

  test("Add Daily Entry searches workers and sorts daily rates with project recent first", async ({
    browser,
  }) => {
    const db = serviceRoleClient();
    const tag = `daily-worker-search-${Date.now()}`;
    const workerAName = `[E2E] Search Worker A ${tag}`;
    const workerBName = `[E2E] Search Worker B ${tag}`;
    const workerCName = `[E2E] Search Worker C ${tag}`;
    const workDate = isoDateOffset(-14);
    const recentDate = isoDateOffset(-30);
    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ name: `[E2E] Search Project ${tag}`, status: "Active", budget: 0, spent: 0 })
      .select("id")
      .single();
    expect(projectError).toBeNull();

    const { data: workers, error: workersError } = await db
      .from("workers")
      .insert([
        { name: workerAName, half_day_rate: 100, daily_rate: 200, status: "active" },
        { name: workerBName, half_day_rate: 145, daily_rate: 290, status: "active" },
        { name: workerCName, half_day_rate: 125, daily_rate: 250, status: "active" },
      ])
      .select("id,name,daily_rate");
    expect(workersError).toBeNull();
    expect(workers ?? []).toHaveLength(3);

    const workerA = workers!.find((worker) => worker.name === workerAName)!;
    const workerC = workers!.find((worker) => worker.name === workerCName)!;
    const { error: laborWorkerSyncError } = await db.from("labor_workers").upsert(
      workers!.map((worker) => ({ id: worker.id, name: worker.name })),
      { onConflict: "id" }
    );
    expect(laborWorkerSyncError).toBeNull();

    const { error: recentEntryError } = await db.from("labor_entries").insert([
      {
        worker_id: workerA.id,
        project_id: project!.id,
        work_date: recentDate,
        hours: 1,
        cost_amount: 200,
        status: "Draft",
        morning: true,
        afternoon: true,
        notes: `${tag} recent worker a`,
      },
      {
        worker_id: workerC.id,
        project_id: project!.id,
        work_date: recentDate,
        hours: 1,
        cost_amount: 250,
        status: "Draft",
        morning: true,
        afternoon: true,
        notes: `${tag} recent worker c`,
      },
    ]);
    expect(recentEntryError).toBeNull();

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    try {
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.goto(`/labor?month=${workDate.slice(0, 7)}`);
      await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible({
        timeout: 30_000,
      });
      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await dialog.locator('input[type="date"]').fill(workDate);

      const projectSelect = dialog.locator("select").first();
      const searchInput = dialog.getByLabel("Search workers");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(tag.toUpperCase());
      await expect(dialog.getByText("3 workers")).toBeVisible();
      await expect(dialog.getByRole("row").filter({ hasText: tag })).toHaveCount(3);
      await expect(dialog.getByRole("row").filter({ hasText: workerBName })).toContainText(
        "$290/day"
      );
      await expect(dialog.getByRole("row").filter({ hasText: workerCName })).toContainText(
        "$250/day"
      );
      await expect(dialog.getByRole("row").filter({ hasText: workerAName })).toContainText(
        "$200/day"
      );
      await expect
        .poll(async () =>
          dialog
            .getByRole("row")
            .filter({ hasText: tag })
            .evaluateAll((rows) => rows.map((row) => row.textContent ?? ""))
        )
        .toEqual([
          expect.stringContaining(workerBName),
          expect.stringContaining(workerCName),
          expect.stringContaining(workerAName),
        ]);

      await searchInput.fill("missing worker result");
      await expect(dialog.getByText("0 workers")).toBeVisible();
      await expect(dialog.getByText("No workers found")).toBeVisible();

      await searchInput.fill("");
      await projectSelect.selectOption(project!.id);
      await expect
        .poll(async () =>
          dialog
            .getByRole("row")
            .evaluateAll((rows) => rows.slice(1, 3).map((row) => row.textContent ?? ""))
        )
        .toEqual([expect.stringContaining(workerCName), expect.stringContaining(workerAName)]);

      await searchInput.fill(tag);
      await expect
        .poll(async () =>
          dialog
            .getByRole("row")
            .filter({ hasText: tag })
            .evaluateAll((rows) => rows.map((row) => row.textContent ?? ""))
        )
        .toEqual([
          expect.stringContaining(workerBName),
          expect.stringContaining(workerCName),
          expect.stringContaining(workerAName),
        ]);

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(searchInput).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          )
        )
        .toBe(true);
    } finally {
      const workerIds = (workers ?? []).map((worker) => worker.id);
      if (workerIds.length) {
        await db.from("labor_entries").delete().in("worker_id", workerIds);
        await db.from("labor_workers").delete().in("id", workerIds);
        await db.from("workers").delete().in("id", workerIds);
      }
      if (project?.id) await db.from("projects").delete().eq("id", project.id);
      await context.close();
    }
  });

  test("Add Daily Entry full local flow covers search reset save duplicates recent and mobile", async ({
    browser,
  }) => {
    const db = serviceRoleClient();
    await cleanupDailyEntryFullFlowData(db);

    const projectName = `${DAILY_ENTRY_FULL_FLOW_PREFIX} Project`;
    const workerAName = `${DAILY_ENTRY_FULL_FLOW_PREFIX} A`;
    const workerBName = `${DAILY_ENTRY_FULL_FLOW_PREFIX} B`;
    const workerCName = `${DAILY_ENTRY_FULL_FLOW_PREFIX} C`;
    const dateA = isoDateOffset(-13);
    const dateB = isoDateOffset(-12);
    const hiddenDate = isoDateOffset(-11);
    const mobileDate = isoDateOffset(-10);

    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ name: projectName, status: "Active", budget: 0, spent: 0 })
      .select("id,name")
      .single();
    expect(projectError).toBeNull();

    const { data: workers, error: workersError } = await db
      .from("workers")
      .insert([
        { name: workerAName, half_day_rate: 100, daily_rate: 200, status: "active" },
        { name: workerBName, half_day_rate: 145, daily_rate: 290, status: "active" },
        { name: workerCName, half_day_rate: 125, daily_rate: 250, status: "active" },
      ])
      .select("id,name,daily_rate");
    expect(workersError).toBeNull();
    expect(workers ?? []).toHaveLength(3);

    const workerA = workers!.find((worker) => worker.name === workerAName)!;
    const workerB = workers!.find((worker) => worker.name === workerBName)!;
    const workerC = workers!.find((worker) => worker.name === workerCName)!;
    const workerIds = [workerA.id, workerB.id, workerC.id];
    const { error: laborWorkerSyncError } = await db.from("labor_workers").upsert(
      workers!.map((worker) => ({ id: worker.id, name: worker.name })),
      { onConflict: "id" }
    );
    expect(laborWorkerSyncError).toBeNull();

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    try {
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      const waitForLaborOptionsForDate = (date: string) =>
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "GET" &&
            url.pathname === "/api/labor/entries" &&
            url.searchParams.get("date") === date &&
            response.ok()
          );
        });
      await page.goto(`/labor?month=${dateA.slice(0, 7)}`);
      await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible({
        timeout: 30_000,
      });
      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      let dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      let projectSelect = dialog.locator("select").first();
      let dateInput = dialog.locator('input[type="date"]');
      let searchInput = dialog.getByLabel("Search workers");
      const optionalInputs = dialog.locator('input[placeholder="Optional"]');
      const costCodeInput = optionalInputs.nth(0);
      const notesInput = optionalInputs.nth(1);
      await expect(searchInput).toBeVisible();
      await expect(dialog.getByText(/\d+ workers/)).toBeVisible();

      await expect
        .poll(async () =>
          dialog.getByRole("row").evaluateAll(
            (rows, names) => {
              const textRows = rows.map((row) => row.textContent ?? "");
              const [bName, cName, aName] = names as string[];
              const bIndex = textRows.findIndex((text) => text.includes(bName));
              const cIndex = textRows.findIndex((text) => text.includes(cName));
              const aIndex = textRows.findIndex((text) => text.includes(aName));
              return (
                bIndex >= 0 && cIndex >= 0 && aIndex >= 0 && bIndex < cIndex && cIndex < aIndex
              );
            },
            [workerBName, workerCName, workerAName]
          )
        )
        .toBe(true);

      await searchInput.fill(DAILY_ENTRY_FULL_FLOW_PREFIX.toLowerCase());
      await expect(dialog.getByText("3 workers")).toBeVisible();
      await expect(
        dialog.getByRole("row").filter({ hasText: DAILY_ENTRY_FULL_FLOW_PREFIX })
      ).toHaveCount(3);
      await expect
        .poll(async () =>
          dialog
            .getByRole("row")
            .filter({ hasText: DAILY_ENTRY_FULL_FLOW_PREFIX })
            .evaluateAll((rows) => rows.map((row) => row.textContent ?? ""))
        )
        .toEqual([
          expect.stringContaining(workerBName),
          expect.stringContaining(workerCName),
          expect.stringContaining(workerAName),
        ]);
      await expect(dialog.getByRole("row").filter({ hasText: workerBName })).toContainText(
        "$290/day"
      );
      await expect(dialog.getByRole("row").filter({ hasText: workerCName })).toContainText(
        "$250/day"
      );
      await expect(dialog.getByRole("row").filter({ hasText: workerAName })).toContainText(
        "$200/day"
      );

      await searchInput.fill("no matching worker");
      await expect(dialog.getByText("0 workers")).toBeVisible();
      await expect(dialog.getByText("No workers found")).toBeVisible();
      await searchInput.fill(DAILY_ENTRY_FULL_FLOW_PREFIX);

      await projectSelect.selectOption(project!.id);
      const dateAOptionsResponse = waitForLaborOptionsForDate(dateA);
      await dateInput.fill(dateA);
      await dateAOptionsResponse;
      await costCodeInput.fill("FLOW-COST-CODE");
      await notesInput.fill("flow notes stay after date change");
      await expect(projectSelect).toHaveValue(project!.id);
      await expect(dateInput).toHaveValue(dateA);

      let workerBRow = dialog.getByRole("row").filter({ hasText: workerBName }).first();
      let workerCRow = dialog.getByRole("row").filter({ hasText: workerCName }).first();
      await workerBRow.getByRole("button", { name: "AM" }).click();
      await expect(workerBRow).toContainText("$145.00");
      await workerBRow.getByRole("button", { name: "PM" }).click();
      await expect(workerBRow).toContainText("$290.00");
      await workerBRow.getByLabel(`Overtime hours for ${workerBName}`).fill("1.5");
      await workerBRow.getByLabel(`Overtime fixed amount for ${workerBName}`).fill("60");
      await expect(workerBRow).toContainText("$290.00");

      const dateBOptionsResponse = waitForLaborOptionsForDate(dateB);
      await dateInput.fill(dateB);
      await dateBOptionsResponse;
      await expect(dateInput).toHaveValue(dateB);
      workerBRow = dialog.getByRole("row").filter({ hasText: workerBName }).first();
      workerCRow = dialog.getByRole("row").filter({ hasText: workerCName }).first();
      await expect(workerBRow.getByLabel(`Overtime hours for ${workerBName}`)).toHaveValue("");
      await expect(workerBRow.getByLabel(`Overtime fixed amount for ${workerBName}`)).toHaveValue(
        ""
      );
      await expect(workerBRow).not.toContainText("$290.00");
      await expect(workerBRow).toContainText("—");
      await expect(projectSelect).toHaveValue(project!.id);
      await expect(costCodeInput).toHaveValue("FLOW-COST-CODE");
      await expect(notesInput).toHaveValue("flow notes stay after date change");

      await workerBRow.getByRole("button", { name: "AM" }).click();
      await expect(workerBRow).toContainText("$145.00");
      await workerBRow.getByRole("button", { name: "PM" }).click();
      await expect(workerBRow).toContainText("$290.00");
      await workerCRow.getByRole("button", { name: "AM" }).click();
      await expect(workerCRow).toContainText("$125.00");

      await dialog.getByRole("button", { name: /^Save$/i }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect(page.getByText(/Entries saved|Entry saved successfully/i).first()).toBeVisible({
        timeout: 30_000,
      });

      const { data: savedRows, error: savedRowsError } = await db
        .from("labor_entries")
        .select(
          "id,worker_id,project_id,work_date,hours,cost_amount,morning,afternoon,cost_code,notes,daily_rate_snapshot,amount_snapshot,labor_cost_snapshot"
        )
        .eq("project_id", project!.id)
        .eq("work_date", dateB)
        .order("cost_amount", { ascending: false });
      expect(savedRowsError).toBeNull();
      expect(savedRows ?? []).toHaveLength(2);
      const savedB = savedRows!.find((entry) => entry.worker_id === workerB.id)!;
      const savedC = savedRows!.find((entry) => entry.worker_id === workerC.id)!;
      expect(Number(savedB.cost_amount)).toBeCloseTo(290, 2);
      expect(Number(savedB.daily_rate_snapshot)).toBeCloseTo(290, 2);
      expect(Number(savedB.amount_snapshot)).toBeCloseTo(290, 2);
      expect(Number(savedB.labor_cost_snapshot)).toBeCloseTo(290, 2);
      expect(savedB).toMatchObject({ morning: true, afternoon: true, cost_code: "FLOW-COST-CODE" });
      expect(Number(savedC.cost_amount)).toBeCloseTo(125, 2);
      expect(Number(savedC.daily_rate_snapshot)).toBeCloseTo(250, 2);
      expect(Number(savedC.amount_snapshot)).toBeCloseTo(125, 2);
      expect(Number(savedC.labor_cost_snapshot)).toBeCloseTo(125, 2);
      expect(savedC).toMatchObject({
        morning: true,
        afternoon: false,
        cost_code: "FLOW-COST-CODE",
      });

      const duplicateResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: project!.id,
          workDate: dateB,
          rows: [{ workerId: workerB.id, morning: true, afternoon: true }],
        },
      });
      expect(duplicateResponse.status()).toBe(409);
      await expectJsonMessage(duplicateResponse, /already has.*date\/session/i);

      await page.goto(`/labor?month=${dateB.slice(0, 7)}&project_id=${project!.id}`);
      await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible({
        timeout: 30_000,
      });
      const dailyEntries = page.locator("section").filter({ hasText: /Daily entries/i });
      const dateRow = dailyEntries
        .getByRole("button")
        .filter({ hasText: compactDateLabel(dateB) })
        .first();
      await expect(dateRow).toContainText("$415.00", { timeout: 30_000 });
      await dateRow.click();
      await expect(dailyEntries).toContainText(workerBName);
      await expect(dailyEntries).toContainText("$290.00");
      await expect(dailyEntries).toContainText(workerCName);
      await expect(dailyEntries).toContainText("$125.00");

      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      projectSelect = dialog.locator("select").first();
      dateInput = dialog.locator('input[type="date"]');
      searchInput = dialog.getByLabel("Search workers");
      await dateInput.fill(dateB);
      await projectSelect.selectOption(project!.id);
      await searchInput.fill("");
      await expect
        .poll(async () =>
          dialog
            .getByRole("row")
            .evaluateAll((rows) => rows.slice(1, 3).map((row) => row.textContent ?? ""))
        )
        .toEqual([expect.stringContaining(workerBName), expect.stringContaining(workerCName)]);

      await searchInput.fill(DAILY_ENTRY_FULL_FLOW_PREFIX);
      workerBRow = dialog.getByRole("row").filter({ hasText: workerBName }).first();
      workerCRow = dialog.getByRole("row").filter({ hasText: workerCName }).first();
      await expect(workerBRow).toContainText("Already has full day", { timeout: 30_000 });
      await expect(workerBRow.getByRole("button", { name: "AM" })).toBeDisabled();
      await expect(workerBRow.getByRole("button", { name: "PM" })).toBeDisabled();
      await expect(workerBRow.getByRole("link", { name: /^View$/i })).toBeVisible();
      await expect(workerCRow).toContainText("AM already entered");
      await expect(workerCRow.getByRole("button", { name: "AM" })).toBeDisabled();
      await expect(workerCRow.getByRole("button", { name: "PM" })).toBeEnabled();
      await expect(workerCRow.getByRole("link", { name: /^View$/i })).toBeVisible();
      await workerBRow.getByRole("link", { name: /^View$/i }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/labor\\?(?=.*workerId=${workerB.id})(?=.*month=${dateB.slice(0, 7)})(?=.*entryId=${savedB.id})`
        ),
        { timeout: 30_000 }
      );

      const { error: cancelledInsertError } = await db.from("labor_entries").insert({
        worker_id: workerA.id,
        project_id: project!.id,
        work_date: hiddenDate,
        hours: 1,
        cost_amount: 200,
        status: "cancelled",
        morning: true,
        afternoon: true,
        notes: `${DAILY_ENTRY_FULL_FLOW_PREFIX} cancelled row should not block`,
      });
      expect(cancelledInsertError).toBeNull();

      await page.goto(`/labor?month=${hiddenDate.slice(0, 7)}`);
      await page
        .getByRole("button", { name: /Add Entry/i })
        .first()
        .click();
      dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      const hiddenDateOptionsResponse = waitForLaborOptionsForDate(hiddenDate);
      await dialog.locator('input[type="date"]').fill(hiddenDate);
      await hiddenDateOptionsResponse;
      await dialog.locator("select").first().selectOption(project!.id);
      searchInput = dialog.getByLabel("Search workers");
      await searchInput.fill(workerAName);
      const workerARow = dialog.getByRole("row").filter({ hasText: workerAName }).first();
      await expect(workerARow).toBeVisible({ timeout: 30_000 });
      await expect(workerARow).not.toContainText(/already/i);
      await expect(workerARow.getByRole("button", { name: "AM" })).toBeEnabled();
      await expect(workerARow.getByRole("button", { name: "PM" })).toBeEnabled();
      await workerARow.getByRole("button", { name: "AM" }).click();
      await expect(workerARow).toContainText("$100.00");
      await page.keyboard.press("Escape");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/labor?addDaily=1");
      dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      const mobileDateOptionsResponse = waitForLaborOptionsForDate(mobileDate);
      await dialog.locator('input[type="date"]').fill(mobileDate);
      await mobileDateOptionsResponse;
      await dialog.locator("select").first().selectOption(project!.id);
      searchInput = dialog.getByLabel("Search workers");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(workerAName);
      const mobileWorkerRow = dialog.getByRole("row").filter({ hasText: workerAName }).first();
      await expect(mobileWorkerRow).toBeVisible({ timeout: 30_000 });
      await mobileWorkerRow.getByRole("button", { name: "AM" }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          )
        )
        .toBe(true);
      await expect(mobileWorkerRow.getByRole("button", { name: "PM" })).toBeVisible();
    } finally {
      await context.close();
      await cleanupDailyEntryFullFlowData(db);
      const counts = await dailyEntryFullFlowCounts(db);
      expect(counts).toEqual({ workers: 0, projects: 0, laborEntries: 0 });
    }
  });

  test("PIN session can create edit and delete time entries through guarded labor API", async ({
    browser,
  }) => {
    const db = serviceRoleClient();
    const tag = `rls-${Date.now()}`;
    const workerName = `[E2E] Time Worker ${tag}`;
    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ name: `[E2E] Time Entries ${tag}`, status: "Active", budget: 0, spent: 0 })
      .select("id")
      .single();
    expect(projectError).toBeNull();

    const { data: worker, error: workerError } = await db
      .from("workers")
      .insert({
        name: workerName,
        half_day_rate: 100,
        daily_rate: 100,
        status: "active",
      })
      .select("id")
      .single();
    expect(workerError).toBeNull();

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const entryIds: string[] = [];
    try {
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const overtimeCreateDate = isoDateOffset(0);
      const createWithOvertimeResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: project!.id,
          workDate: overtimeCreateDate,
          rows: [
            {
              workerId: worker!.id,
              morning: true,
              afternoon: false,
              otHours: 1.5,
              otAmount: 60,
            },
          ],
        },
      });
      expect(createWithOvertimeResponse.status()).toBe(200);
      const createWithOvertimeBody = (await createWithOvertimeResponse.json()) as {
        entries?: Array<{ id?: string }>;
      };
      const overtimeEntryId = createWithOvertimeBody.entries?.[0]?.id;
      expect(overtimeEntryId).toBeTruthy();
      entryIds.push(overtimeEntryId!);

      const { data: createdWithOvertime, error: createdWithOvertimeError } = await db
        .from("labor_entries")
        .select("id, notes, cost_amount, labor_cost_snapshot")
        .eq("id", overtimeEntryId!)
        .maybeSingle();
      expect(createdWithOvertimeError).toBeNull();
      expect(createdWithOvertime?.notes).toContain("ot_hours=1.5");
      expect(createdWithOvertime?.notes).toContain("ot_amount=60");
      expect(Number(createdWithOvertime?.cost_amount)).toBe(50);
      expect(Number(createdWithOvertime?.labor_cost_snapshot)).toBe(50);
      expect(Number.isFinite(Number(createdWithOvertime?.cost_amount))).toBe(true);
      expect(Number.isFinite(Number(createdWithOvertime?.labor_cost_snapshot))).toBe(true);

      const plainWorkDate = isoDateOffset(-3);
      const createPlainResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: project!.id,
          workDate: plainWorkDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: true }],
        },
      });
      expect(createPlainResponse.status()).toBe(200);
      const createPlainBody = (await createPlainResponse.json()) as {
        entries?: Array<{ id?: string }>;
      };
      const plainEntryId = createPlainBody.entries?.[0]?.id;
      expect(plainEntryId).toBeTruthy();
      entryIds.push(plainEntryId!);

      const workDate = isoDateOffset(-1);
      const createResponse = await context.request.post("/api/labor/entries", {
        data: {
          projectId: project!.id,
          workDate,
          rows: [{ workerId: worker!.id, morning: true, afternoon: false, otHours: 0 }],
        },
      });
      expect(createResponse.status()).toBe(200);
      const createBody = (await createResponse.json()) as { entries?: Array<{ id?: string }> };
      const entryId = createBody.entries?.[0]?.id;
      expect(entryId).toBeTruthy();
      entryIds.push(entryId!);

      const editResponse = await context.request.patch("/api/labor/entries", {
        data: {
          mode: "session-entry",
          id: entryId,
          workerId: worker!.id,
          workDate,
          projectId: project!.id,
          session: "full_day",
          costAmount: 100,
          hours: 1,
          overtimeHours: 2,
          overtimeAmount: 60,
          notes: "boundary edit",
        },
      });
      expect(editResponse.status()).toBe(200);

      const { data: editedEntry, error: editedEntryError } = await db
        .from("labor_entries")
        .select("id, notes, cost_amount, labor_cost_snapshot")
        .eq("id", entryId!)
        .maybeSingle();
      expect(editedEntryError).toBeNull();
      expect(editedEntry?.notes).toContain("boundary edit");
      expect(editedEntry?.notes).toContain("ot_hours=2");
      expect(editedEntry?.notes).toContain("ot_amount=60");
      expect(Number(editedEntry?.cost_amount)).toBe(100);
      expect(Number(editedEntry?.labor_cost_snapshot)).toBe(100);
      expect(Number.isFinite(Number(editedEntry?.labor_cost_snapshot))).toBe(true);

      const joinedResponse = await context.request.get(
        `/api/labor/entries?view=joined&workerId=${encodeURIComponent(
          worker!.id
        )}&dateFrom=${encodeURIComponent(workDate)}&dateTo=${encodeURIComponent(workDate)}`
      );
      expect(joinedResponse.status()).toBe(200);
      const joinedBody = (await joinedResponse.json()) as {
        entries?: Array<{
          id?: string;
          overtime_hours?: number;
          overtime_amount?: number;
          cost_amount?: number | null;
        }>;
      };
      const joinedEntry = joinedBody.entries?.find((entry) => entry.id === entryId);
      expect(joinedEntry?.overtime_hours).toBe(2);
      expect(joinedEntry?.overtime_amount).toBe(60);
      expect(Number.isFinite(Number(joinedEntry?.cost_amount))).toBe(true);

      const defaultGetResponse = await context.request.get(
        `/api/labor/entries?date=${encodeURIComponent(workDate)}`
      );
      expect(defaultGetResponse.status()).toBe(200);
      const defaultGetBody = (await defaultGetResponse.json()) as {
        entries?: Array<{ id?: string; overtime_hours?: number; overtime_amount?: number }>;
      };
      expect(defaultGetBody.entries?.find((entry) => entry.id === entryId)?.overtime_hours).toBe(2);
      expect(defaultGetBody.entries?.find((entry) => entry.id === entryId)?.overtime_amount).toBe(
        60
      );

      const payrollResponse = await context.request.get(
        `/api/labor/payroll-summary?fromDate=${encodeURIComponent(
          workDate
        )}&toDate=${encodeURIComponent(overtimeCreateDate)}`
      );
      expect(payrollResponse.status()).toBeLessThan(500);

      const workerBalanceResponse = await context.request.get("/api/labor/worker-balances");
      expect(workerBalanceResponse.status()).toBeLessThan(500);

      const page = await context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/labor/entries");
      await expect(page.getByRole("heading", { name: "Daily Entries" })).toBeVisible();
      await page.getByLabel("Search entries").fill("boundary edit");
      await expect(page.getByText("boundary edit").first()).toBeVisible();
      await page.getByRole("button", { name: "Edit" }).first().click();
      const dialog = page.getByRole("dialog", { name: /Edit entry/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Overtime Hours")).toBeVisible();
      await expect(dialog.getByLabel("Overtime Hours")).toHaveValue("2");
      await expect(dialog.getByLabel("Overtime Fixed Amount")).toBeVisible();
      await expect(dialog.getByLabel("Overtime Fixed Amount")).toHaveValue("60");
      await expect(page.getByText(/ot_hours=|ot_amount=/)).toHaveCount(0);
      await page.close();

      const laborPage = await context.newPage();
      await laborPage.goto("/labor");
      await expect(laborPage.getByRole("heading", { name: "Daily Labor" })).toBeVisible();
      await laborPage.locator("select").nth(0).selectOption(plainWorkDate.slice(0, 7));
      await expect(laborPage.locator(`select option[value="${worker!.id}"]`)).toHaveCount(1, {
        timeout: 30_000,
      });
      await laborPage.locator("select").nth(2).selectOption(worker!.id);

      const dailyEntries = laborPage.locator("section").filter({ hasText: /Daily entries/i });
      const dailyEntryDateRow = dailyEntries.getByRole("button").filter({ hasText: /entries/i });
      await expect(dailyEntryDateRow.first()).toBeVisible({ timeout: 30_000 });
      await dailyEntryDateRow.first().click();
      const laborEditButton = dailyEntries.locator('button[aria-label="Edit"]').first();
      await expect(laborEditButton).toBeVisible();
      const laborDialog = laborPage.getByRole("dialog").filter({ hasText: "Edit Entry" });
      await laborEditButton.click({ force: true });
      if (!(await laborDialog.isVisible({ timeout: 1000 }).catch(() => false))) {
        await laborEditButton.evaluate((node) => (node as HTMLButtonElement).click());
      }
      await expect(laborDialog).toBeVisible({ timeout: 10_000 });
      await expect(laborDialog.getByTestId("labor-edit-session")).toHaveValue("full_day");
      await expect(laborDialog.getByLabel("Overtime Hours")).toHaveCount(0);
      await expect(laborDialog.getByLabel("Overtime Fixed Amount")).toHaveCount(0);
      await expect(laborDialog.getByTestId("labor-edit-advanced-toggle")).toHaveAttribute(
        "aria-expanded",
        "false"
      );
      await expect(laborDialog.getByLabel("Override Entry Amount")).toHaveCount(0);

      await laborDialog.getByTestId("labor-edit-session").selectOption("morning");
      await expect(laborDialog.getByLabel("Overtime Hours")).toHaveCount(0);
      await laborDialog.getByTestId("labor-edit-session").selectOption("overtime");
      await expect(laborDialog.getByLabel("Overtime Hours")).toBeVisible();
      await expect(laborDialog.getByLabel("Overtime Fixed Amount")).toBeVisible();
      await laborDialog.getByLabel("Overtime Hours").fill("2");
      await laborDialog.getByLabel("Overtime Fixed Amount").fill("60");
      await expect(laborPage.getByText(/ot_hours=|ot_amount=/)).toHaveCount(0);
      await laborDialog.getByRole("button", { name: /^Save Changes$/i }).click();
      await expect(laborDialog).toBeHidden({ timeout: 30_000 });

      await expect(laborEditButton).toBeVisible({ timeout: 30_000 });
      await laborEditButton.click({ force: true });
      if (!(await laborDialog.isVisible({ timeout: 1000 }).catch(() => false))) {
        await laborEditButton.evaluate((node) => (node as HTMLButtonElement).click());
      }
      await expect(laborDialog).toBeVisible({ timeout: 10_000 });
      await expect(laborDialog.getByTestId("labor-edit-session")).toHaveValue("overtime");
      await expect(laborDialog.getByLabel("Overtime Hours")).toHaveValue("2");
      await expect(laborDialog.getByLabel("Overtime Fixed Amount")).toHaveValue("60");
      await laborPage.setViewportSize({ width: 390, height: 844 });
      await expect(laborDialog).toBeVisible();
      await expect(laborDialog.getByLabel("Overtime Hours")).toBeVisible();
      await expect(laborDialog.getByLabel("Overtime Fixed Amount")).toBeVisible();
      const noMobileOverflow = await laborPage.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      );
      expect(noMobileOverflow).toBe(true);
      await laborPage.close();

      for (const id of entryIds) {
        const deleteResponse = await context.request.delete(
          `/api/labor/entries?id=${encodeURIComponent(id)}`
        );
        expect(deleteResponse.status()).toBe(200);
      }
    } finally {
      if (entryIds.length > 0) await db.from("labor_entries").delete().in("id", entryIds);
      if (project?.id) await db.from("projects").delete().eq("id", project.id);
      if (worker?.id) {
        await db.from("labor_workers").delete().eq("id", worker.id);
        await db.from("workers").delete().eq("id", worker.id);
      }
      await context.close();
    }
  });
});
