import { expect, test, type APIRequestContext } from "@playwright/test";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const OWNER_PIN = "1234";

type SystemQaBody = {
  ok?: boolean;
  summary?: {
    status?: string;
    critical?: number;
    warning?: number;
    pass?: number;
    total?: number;
  };
  sections?: Array<{
    id?: string;
    name?: string;
    status?: string;
    checks?: Array<{
      id?: string;
      name?: string;
      status?: string;
      category?: string;
      page?: string;
      message?: string;
      diagnosticCode?: string;
    }>;
  }>;
};

function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("System QA tests require local Supabase URL and service role key.");
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
      updated_by: "playwright-system-qa",
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

function allChecks(body: SystemQaBody) {
  return body.sections?.flatMap((section) => section.checks ?? []) ?? [];
}

type CompanyProfileSnapshot = {
  id: string;
  org_name: string | null;
  legal_name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

async function createQaFixture(): Promise<{
  projectId: string;
  companyProfileId: string;
  previousCompanyProfile: CompanyProfileSnapshot | null;
}> {
  const db = serviceRoleClient();
  const projectId = randomUUID();
  const companyProfileId = randomUUID();

  const { error: projectError } = await db.from("projects").insert({
    id: projectId,
    name: `[E2E] System QA $1 Contract ${Date.now()}`,
    status: "active",
    budget: 1,
    contract_amount: null,
    spent: 0,
  });
  if (projectError) throw new Error(`Failed to create QA project: ${projectError.message}`);

  const { data: existingProfile, error: existingProfileError } = await db
    .from("company_profile")
    .select("id,org_name,legal_name,address1,city,state,zip")
    .limit(1)
    .maybeSingle();
  if (existingProfileError) {
    throw new Error(`Failed to read company profile fixture: ${existingProfileError.message}`);
  }

  const profilePatch = {
    org_name: "[E2E] System QA Profile",
    legal_name: "[E2E] System QA Profile",
    address1: "E2E-ST",
    city: "Honolulu",
    state: "HI",
    zip: "E2E-ZIP",
  };
  const previousCompanyProfile = existingProfile as CompanyProfileSnapshot | null;
  const { error: profileError } = previousCompanyProfile
    ? await db.from("company_profile").update(profilePatch).eq("id", previousCompanyProfile.id)
    : await db.from("company_profile").insert({ id: companyProfileId, ...profilePatch });
  if (profileError) throw new Error(`Failed to create QA company profile: ${profileError.message}`);

  return {
    projectId,
    companyProfileId: previousCompanyProfile?.id ?? companyProfileId,
    previousCompanyProfile,
  };
}

async function cleanupQaFixture(ids: {
  projectId?: string;
  companyProfileId?: string;
  previousCompanyProfile?: CompanyProfileSnapshot | null;
}) {
  const db = serviceRoleClient();
  if (ids.projectId) {
    await db.from("projects").delete().eq("id", ids.projectId);
  }
  if (ids.previousCompanyProfile) {
    const { id, ...profilePatch } = ids.previousCompanyProfile;
    await db.from("company_profile").update(profilePatch).eq("id", id);
  } else if (ids.companyProfileId) {
    await db.from("company_profile").delete().eq("id", ids.companyProfileId);
  }
}

test.describe("System QA check", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin();
  });

  test.afterEach(async () => {
    await seedTestLoginPin();
  });

  test("returns sanitized QA findings in owner no-login mode", async ({ browser }) => {
    const fixture = await createQaFixture();
    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const response = await context.request.get("/api/system/qa-check");
      expect(response.status()).toBe(200);
      const text = await response.text();
      expectNoSecrets(text);

      const body = JSON.parse(text) as SystemQaBody;
      expect(body.summary?.total ?? 0).toBeGreaterThan(0);
      expect(body.sections?.map((section) => section.id)).toEqual(
        expect.arrayContaining([
          "pages",
          "destructive-safety",
          "schema",
          "company-profile",
          "financial",
          "preview",
          "mobile",
        ])
      );

      const checks = allChecks(body);
      const companyProfileMarkers = checks.filter(
        (check) => check.diagnosticCode === "company_profile_e2e_marker"
      );
      expect(companyProfileMarkers).toHaveLength(1);
      expect(companyProfileMarkers[0]?.category).toBe("dataCleanup");
      expect(companyProfileMarkers[0]?.message).toContain("Update in Settings");

      const contractReview = checks.find(
        (check) => check.diagnosticCode === "contract_value_review_needed"
      );
      expect(contractReview).toBeTruthy();
      expect(contractReview?.category).toBe("actionRequired");
      expect(contractReview?.message).toContain("need contract value review");
      expect(checks.some((check) => check.diagnosticCode === "contract_placeholder_values")).toBe(
        false
      );
      expect(checks.some((check) => check.diagnosticCode === "contract_suspicious_huge")).toBe(
        false
      );
      expect(checks.some((check) => check.diagnosticCode === "optional_schema_warning")).toBe(
        false
      );
      expect(text).not.toMatch(/public\.ap_bills|schema cache|Could not find/i);

      const destructive = body.sections?.find((section) => section.id === "destructive-safety");
      expect(destructive?.checks?.length ?? 0).toBeGreaterThan(0);
      expect(destructive?.checks?.every((check) => check.status === "pass")).toBe(true);
      expect(destructive?.checks?.map((check) => check.message).join("\n")).toContain(
        "GET is blocked safely"
      );

      await context.close();
    } finally {
      await cleanupQaFixture(fixture);
    }
  });

  test("System Health shows System QA panel for owner session", async ({ browser }) => {
    const fixture = await createQaFixture();
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    try {
      await loginOwner(context.request);
      const page = await context.newPage();

      await page.goto("/system-health", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("heading", { name: "System QA" })).toBeVisible();
      await expect(page.getByText("Needs attention")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Optional modules", { exact: true })).toBeVisible();
      await expect(
        page.getByText("AP Bills module is optional and not configured.").first()
      ).toBeVisible();

      await page.getByRole("button", { name: /Run System QA|Running QA/ }).click();
      await expect(page.getByText("Page availability and visible errors")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole("heading", { name: "Destructive action safety" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Schema and system health" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Financial data guardrails" })).toBeVisible();
    } finally {
      await context.close();
      await cleanupQaFixture(fixture);
    }
  });

  test("System Health tolerates partial QA and integrity responses", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    await loginOwner(context.request);
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.route("**/api/system/qa-check", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: new Date().toISOString(),
          mode: "production-safe",
          summary: {
            status: "warning",
            warning: 1,
          },
          sections: [
            {
              id: "partial",
              name: "Partial QA section",
              status: "warning",
            },
          ],
        }),
      });
    });
    await page.route("**/api/system/integrity", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
        }),
      });
    });

    await page.goto("/system-health", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "System QA" })).toBeVisible();
    await expect(page.getByText("Partial QA section")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Warnings", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Total checks", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);

    await context.close();
  });
});
