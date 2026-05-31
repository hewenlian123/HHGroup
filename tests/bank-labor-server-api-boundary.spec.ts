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
