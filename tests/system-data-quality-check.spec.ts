import { expect, test, type APIRequestContext } from "@playwright/test";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const OWNER_PIN = "1234";

type CompanyProfileSnapshot = {
  id: string;
  org_name: string | null;
  legal_name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("System data quality tests require local Supabase URL and service role key.");
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
      updated_by: "playwright-system-data-quality",
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

async function createDataQualityFixture(): Promise<{
  projectId: string;
  companyProfileId: string;
  previousCompanyProfile: CompanyProfileSnapshot | null;
}> {
  const db = serviceRoleClient();
  const projectId = randomUUID();
  const companyProfileId = randomUUID();

  const { error: projectError } = await db.from("projects").insert({
    id: projectId,
    name: `[E2E] Data Quality $1 Contract ${Date.now()}`,
    status: "active",
    budget: 1,
    contract_amount: null,
    spent: 0,
  });
  if (projectError)
    throw new Error(`Failed to create data quality project: ${projectError.message}`);

  const { data: existingProfile, error: existingProfileError } = await db
    .from("company_profile")
    .select("id,org_name,legal_name,address1,city,state,zip")
    .limit(1)
    .maybeSingle();
  if (existingProfileError) {
    throw new Error(`Failed to read company profile fixture: ${existingProfileError.message}`);
  }

  const profilePatch = {
    org_name: "[E2E] Data Quality Profile",
    legal_name: "[E2E] Data Quality Profile",
    address1: "E2E-ST",
    city: "Honolulu",
    state: "HI",
    zip: "E2E-ZIP",
  };
  const previousCompanyProfile = existingProfile as CompanyProfileSnapshot | null;
  const { error: profileError } = previousCompanyProfile
    ? await db.from("company_profile").update(profilePatch).eq("id", previousCompanyProfile.id)
    : await db.from("company_profile").insert({ id: companyProfileId, ...profilePatch });
  if (profileError)
    throw new Error(`Failed to create data quality profile: ${profileError.message}`);

  return {
    projectId,
    companyProfileId: previousCompanyProfile?.id ?? companyProfileId,
    previousCompanyProfile,
  };
}

async function cleanupDataQualityFixture(ids: {
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

test.describe("System data quality check", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin();
  });

  test.afterEach(async () => {
    await seedTestLoginPin();
  });

  test("returns sanitized Supabase data quality findings", async ({ browser }) => {
    const fixture = await createDataQualityFixture();
    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const response = await context.request.get("/api/system/data-quality-check");
      expect(response.status()).toBe(200);
      const text = await response.text();
      expectNoSecrets(text);

      const body = JSON.parse(text) as {
        summary?: {
          projectsChecked?: number;
          companyProfileChecked?: number;
          totalIssues?: number;
        };
        modules?: Array<{ module?: string; checked?: number }>;
        issues?: Array<{ issueCode?: string; severity?: string; link?: string }>;
      };
      expect(body.summary?.projectsChecked ?? 0).toBeGreaterThan(0);
      expect(body.summary?.companyProfileChecked ?? 0).toBeGreaterThan(0);
      expect(body.modules?.map((module) => module.module)).toEqual(
        expect.arrayContaining([
          "projects",
          "expenses",
          "invoices",
          "estimates",
          "labor",
          "reimbursements",
          "company-profile",
        ])
      );

      const codes = (body.issues ?? []).map((issue) => issue.issueCode);
      expect(codes).toContain("contract_value_placeholder");
      expect(codes).toContain("company_profile_e2e_marker");
      expect(text).not.toMatch(/public\.ap_bills|schema cache|Could not find/i);

      await context.close();
    } finally {
      await cleanupDataQualityFixture(fixture);
    }
  });

  test("System Health renders data quality panel and mocked critical number issue", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    try {
      await loginOwner(context.request);
      const page = await context.newPage();
      await page.route("**/api/system/data-quality-check", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            checkedAt: new Date().toISOString(),
            summary: {
              status: "critical",
              critical: 1,
              warning: 2,
              info: 0,
              totalIssues: 3,
              returnedIssues: 3,
              projectsChecked: 2,
              expensesChecked: 1,
              invoicesChecked: 1,
              estimatesChecked: 1,
              laborChecked: 0,
              reimbursementsChecked: 0,
              companyProfileChecked: 1,
            },
            modules: [
              {
                module: "invoices",
                label: "Invoices",
                checked: 1,
                critical: 1,
                warning: 0,
                info: 0,
                status: "critical",
              },
              {
                module: "estimates",
                label: "Estimates",
                checked: 1,
                critical: 0,
                warning: 1,
                info: 0,
                status: "warning",
              },
            ],
            issues: [
              {
                severity: "critical",
                module: "invoices",
                entityType: "invoice",
                entityId: "invoice-1",
                entityName: "INV-MOCK",
                issueCode: "invoice_paid_exceeds_total",
                message: "Invoice paid amount is greater than invoice total.",
                currentValue: 125,
                expectedValue: 100,
                recommendedAction: "Review invoice payments and void/reversal handling.",
                link: "/financial/invoices/invoice-1",
              },
              {
                severity: "warning",
                module: "estimates",
                entityType: "estimate",
                entityId: "estimate-1",
                entityName: "EST-0020",
                issueCode: "estimate_fractional_currency",
                message: "Estimate total has more than two decimal places.",
                currentValue: 0.014,
                recommendedAction: "Review estimate display paths for shared currency formatting.",
                link: "/estimates/estimate-1",
              },
              {
                severity: "warning",
                module: "projects",
                entityType: "project",
                entityId: "project-1",
                entityName: "Placeholder Project",
                issueCode: "contract_value_placeholder",
                message: "Contract value looks like a placeholder and needs manual cleanup.",
                currentValue: "budget=1, contract_amount=missing",
                recommendedAction: "Open Project Financial Review.",
                link: "/settings/project-financial-review",
              },
            ],
          }),
        });
      });

      await page.goto("/system-health", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Supabase Data / Number Check" })).toBeVisible(
        { timeout: 30_000 }
      );
      await expect(page.getByText("invoice_paid_exceeds_total")).toBeVisible();
      await expect(page.getByText("estimate_fractional_currency")).toBeVisible();
      await expect(page.getByText("contract_value_placeholder")).toBeVisible();

      await context.close();
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
