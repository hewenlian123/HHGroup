import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Project financial snapshot API tests require Supabase URL and service role key."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hashTestPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, 210_000, 32, "sha256");
  return {
    hash: hash.toString("base64url"),
    salt: salt.toString("base64url"),
  };
}

async function seedTestLoginPin(pin = "1234"): Promise<void> {
  const { hash, salt } = hashTestPin(pin);
  const supabase = serviceRoleClient();
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

async function createProject(): Promise<string> {
  const supabase = serviceRoleClient();
  const id = randomUUID();
  const { error } = await supabase.from("projects").insert({
    id,
    name: `[E2E] Snapshot API ${id.slice(0, 8)}`,
    status: "active",
    budget: 1000,
    spent: 0,
  });
  if (error) throw new Error(`Failed to create test project: ${error.message}`);
  return id;
}

async function deleteProject(projectId: string): Promise<void> {
  const supabase = serviceRoleClient();
  await supabase.from("projects").delete().eq("id", projectId);
}

test.describe("project financial snapshot API", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin("1234");
  });

  test.afterEach(async () => {
    await seedTestLoginPin("1234");
  });

  test("requires auth and returns old vs new comparison for a PIN session", async ({ browser }) => {
    const projectId = await createProject();
    const path = `/api/projects/${projectId}/financial-snapshot`;

    try {
      const unauthContext = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const unauthResponse = await unauthContext.request.get(path);
      expect(unauthResponse.status()).toBe(401);
      await unauthContext.close();

      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const response = await context.request.get(path);
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        ok?: boolean;
        comparison?: {
          projectId?: string;
          newSnapshot?: { projectId?: string; revisedContractValue?: number };
          differences?: unknown[];
          warnings?: unknown[];
        };
      };

      expect(body.ok).toBe(true);
      expect(body.comparison?.projectId).toBe(projectId);
      expect(body.comparison?.newSnapshot?.projectId).toBe(projectId);
      expect(body.comparison?.newSnapshot?.revisedContractValue).toBe(1000);
      expect(Array.isArray(body.comparison?.differences)).toBe(true);
      expect(Array.isArray(body.comparison?.warnings)).toBe(true);
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("project cost tab only shows the comparison panel when explicitly requested", async ({
    browser,
  }) => {
    const projectId = await createProject();

    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.goto(`/projects/${projectId}?tab=cost`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: /\[E2E\] Snapshot API/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toHaveCount(0);

      await page.goto(`/projects/${projectId}?tab=cost&debugFinancial=1`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Internal comparison only")).toBeVisible();
      await expect(page.getByText("New snapshot actual cost")).toBeVisible();
      await expect(page.getByText("Current UI actual cost")).toBeVisible();
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("project cost tab survives financial snapshot comparison API failures", async ({
    browser,
  }) => {
    const projectId = await createProject();

    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.route(`**/api/projects/${projectId}/financial-snapshot`, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "Forced comparison failure" }),
        });
      });

      await page.goto(`/projects/${projectId}?tab=cost&debugFinancial=1`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page.getByRole("heading", { name: /\[E2E\] Snapshot API/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toBeVisible();
      await expect(page.getByText("Financial snapshot comparison unavailable.")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });
});
