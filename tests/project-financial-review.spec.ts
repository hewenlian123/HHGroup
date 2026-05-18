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
    throw new Error("Project financial review tests require Supabase URL and service role key.");
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
  const { error } = await serviceRoleClient().from("app_security_settings").upsert(
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

type TestProject = {
  id: string;
  name: string;
  budget: number | null;
  contractAmount?: number | null;
};

async function createProject(project: TestProject): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("projects")
    .insert({
      id: project.id,
      name: project.name,
      status: "active",
      budget: project.budget,
      contract_amount: project.contractAmount ?? null,
      spent: 0,
    });
  if (error) throw new Error(`Failed to create ${project.name}: ${error.message}`);
}

async function deleteProjects(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) return;
  await serviceRoleClient().from("projects").delete().in("id", projectIds);
}

test.describe("project financial review", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin("1234");
  });

  test.afterEach(async () => {
    await seedTestLoginPin("1234");
  });

  test("API requires auth and flags placeholder, suspicious, and mismatch contract values", async ({
    browser,
  }) => {
    const projects: TestProject[] = [
      {
        id: randomUUID(),
        name: `[E2E] Financial Review Placeholder ${Date.now()}`,
        budget: 1,
      },
      {
        id: randomUUID(),
        name: `[E2E] Financial Review Huge ${Date.now()}`,
        budget: 25_000_000,
      },
      {
        id: randomUUID(),
        name: `[E2E] Financial Review Mismatch ${Date.now()}`,
        budget: 500_000,
        contractAmount: 450_000,
      },
      {
        id: randomUUID(),
        name: `[E2E] Financial Review Safe ${Date.now()}`,
        budget: 240_000,
        contractAmount: 240_000,
      },
    ];
    const ids = projects.map((project) => project.id);

    try {
      await Promise.all(projects.map(createProject));

      const unauthContext = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const unauthResponse = await unauthContext.request.get("/api/projects/financial-review");
      expect(unauthResponse.status()).toBe(401);
      await unauthContext.close();

      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const response = await context.request.get("/api/projects/financial-review");
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        ok?: boolean;
        flaggedProjects?: Array<{
          id?: string;
          name?: string;
          issueCodes?: string[];
          confirmedProfitStatus?: string;
          detailHref?: string;
        }>;
      };
      expect(body.ok).toBe(true);
      const byName = new Map(body.flaggedProjects?.map((project) => [project.name, project]));

      expect(byName.get(projects[0].name)?.issueCodes).toContain("contract_value_placeholder");
      expect(byName.get(projects[1].name)?.issueCodes).toContain("contract_value_suspicious_huge");
      expect(byName.get(projects[2].name)?.issueCodes).toContain("budget_contract_mismatch");
      expect(byName.has(projects[3].name)).toBe(false);
      expect(byName.get(projects[0].name)?.confirmedProfitStatus).toBe("needs_review");
      expect(byName.get(projects[0].name)?.detailHref).toBe(`/projects/${projects[0].id}`);
      await context.close();
    } finally {
      await deleteProjects(ids);
    }
  });

  test("settings page lists flagged projects with links to project detail", async ({ browser }) => {
    const project: TestProject = {
      id: randomUUID(),
      name: `[E2E] Financial Review Page ${Date.now()}`,
      budget: 1,
    };

    try {
      await createProject(project);
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.goto("/settings/project-financial-review", { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { name: "Project Financial Review" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(project.name)).toBeVisible();
      await expect(page.getByText("$1 placeholder", { exact: true })).toBeVisible();
      await expect(page.getByText("Needs review")).toBeVisible();
      await expect(page.getByRole("link", { name: `Open ${project.name}` })).toHaveAttribute(
        "href",
        `/projects/${project.id}`
      );
      await expect(page.getByLabel("Settings sections")).toContainText("Project Financial Review");
      await context.close();
    } finally {
      await deleteProjects([project.id]);
    }
  });
});
