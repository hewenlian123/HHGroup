import { expect, test, type APIRequestContext } from "@playwright/test";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const TEST_HEADERS = {
  ...LOCKED_HEADERS,
  "x-hh-test-auth-bypass": "1",
};

const OWNER_PIN = "1234";

function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "System integrity scanner tests require local Supabase URL and service role key."
    );
  }
  assertE2ESupabaseUrlSafeForMutations(url);
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

async function seedTestLoginPin(pin = OWNER_PIN): Promise<void> {
  const { hash, salt } = hashTestPin(pin);
  const { error } = await serviceRoleClient().from("app_security_settings").upsert(
    {
      key: "login_pin",
      pin_hash: hash,
      pin_salt: salt,
      session_version: 1,
      updated_by: "playwright-system-integrity-scan",
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`Failed to seed login PIN: ${error.message}`);
}

async function loginOwner(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/pin-login", {
    headers: LOCKED_HEADERS,
    data: { pin: OWNER_PIN },
  });
  expect(response.status()).toBe(200);
}

function configuredSecretValues(): string[] {
  return [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.HH_INTERNAL_ADMIN_SECRET,
    process.env.INTERNAL_ADMIN_SECRET,
    process.env.HH_PIN_SESSION_SECRET,
  ]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length >= 8);
}

function expectNoSecrets(responseText: string): void {
  for (const value of configuredSecretValues()) {
    expect(responseText).not.toContain(value);
  }
  expect(responseText).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+/i);
  expect(responseText).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  expect(responseText).not.toContain("HH_INTERNAL_ADMIN_SECRET=");
  expect(responseText).not.toContain("HH_PIN_SESSION_SECRET=");
  expect(responseText).not.toContain("pin_hash");
  expect(responseText).not.toContain("pin_salt");
}

async function createMarkerProjectFixture(): Promise<string> {
  const db = serviceRoleClient();
  const projectId = randomUUID();
  const { error } = await db.from("projects").insert({
    id: projectId,
    name: `[E2E] System Integrity TEST safe to delete ${Date.now()}`,
    status: "active",
    budget: 100,
    contract_amount: 100,
    spent: 0,
  });
  if (error) throw new Error(`Failed to create integrity marker project: ${error.message}`);
  return projectId;
}

async function cleanupMarkerProject(projectId: string): Promise<void> {
  await serviceRoleClient().from("projects").delete().eq("id", projectId);
}

test.describe("System integrity scanner", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin();
  });

  test("allows owner no-login read access under production safety lock", async ({ request }) => {
    const response = await request.get("/api/system/integrity-scan", {
      headers: LOCKED_HEADERS,
    });
    expect(response.status()).toBe(200);
    const text = await response.text();
    expectNoSecrets(text);
    expect(text).not.toMatch(/DELETE FROM|UPDATE public|INSERT INTO public|TRUNCATE|DROP public/i);
  });

  test("returns sanitized read-only marker findings", async ({ browser }) => {
    const projectId = await createMarkerProjectFixture();
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    try {
      const response = await context.request.get("/api/system/integrity-scan");
      expect(response.status()).toBe(200);
      const text = await response.text();
      expectNoSecrets(text);
      expect(text).not.toMatch(
        /DELETE FROM|UPDATE public|INSERT INTO public|TRUNCATE|DROP public/i
      );

      const body = JSON.parse(text) as {
        status?: string;
        generatedAt?: string;
        summary?: { totalIssues?: number; medium?: number };
        sections?: Array<{
          id?: string;
          issues?: Array<{
            table?: string;
            id?: string;
            category?: string;
            autoFixAvailable?: boolean;
          }>;
        }>;
      };

      expect(["pass", "warning", "fail"]).toContain(body.status);
      expect(body.generatedAt).toEqual(expect.any(String));
      expect(body.summary?.totalIssues ?? 0).toBeGreaterThan(0);
      const markerIssues =
        body.sections?.find((section) => section.id === "test-marker-data")?.issues ?? [];
      expect(markerIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: "projects",
            id: projectId,
            category: "test_marker",
            autoFixAvailable: false,
          }),
        ])
      );
    } finally {
      await context.close().catch(() => undefined);
      await cleanupMarkerProject(projectId);
    }
  });

  test("System Health renders the compact integrity scanner section", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    try {
      await loginOwner(context.request);
      const page = await context.newPage();
      await page.route("**/api/system/integrity-scan", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "warning",
            generatedAt: "2026-05-25T12:00:00.000Z",
            summary: { totalIssues: 1, critical: 0, high: 0, medium: 1, low: 0 },
            sections: [
              {
                id: "test-marker-data",
                title: "Test Marker Data",
                status: "warning",
                issues: [
                  {
                    severity: "medium",
                    category: "test_marker",
                    table: "projects",
                    id: "project-marker",
                    message: "Strong test marker text found in projects.",
                    evidence: { fields: [{ field: "name", value: "TEST safe to delete" }] },
                    recommendedAction: "Review this marker row through exact-ID cleanup.",
                    autoFixAvailable: false,
                  },
                ],
              },
            ],
          }),
        });
      });

      await page.goto("/system-health", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("System Integrity Scanner", { exact: true }).first()).toBeVisible(
        { timeout: 30_000 }
      );
      await expect(page.getByText("1 issue(s)").filter({ visible: true }).first()).toBeVisible();
      await expect(
        page.getByText("projects / project-marker").filter({ visible: true }).first()
      ).toBeVisible();
      await expect(page.getByText("Auto fix").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText("Disabled").filter({ visible: true }).first()).toBeVisible();
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
