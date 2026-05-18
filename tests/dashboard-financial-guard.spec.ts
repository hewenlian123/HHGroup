import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};
const PRESERVED_SEED_PROJECT_ID = "11111111-1111-1111-1111-111111111111";

function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Dashboard financial guard tests require Supabase URL and service role key.");
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

async function getSeedProjectBudget(): Promise<number> {
  const { data, error } = await serviceRoleClient()
    .from("projects")
    .select("budget")
    .eq("id", PRESERVED_SEED_PROJECT_ID)
    .single();
  if (error) throw new Error(`Failed to read preserved seed project: ${error.message}`);
  return Number((data as { budget?: unknown }).budget ?? 0);
}

async function updateSeedProjectBudget(budget: number): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("projects")
    .update({ budget })
    .eq("id", PRESERVED_SEED_PROJECT_ID);
  if (error) throw new Error(`Failed to update preserved seed project: ${error.message}`);
}

test.describe("dashboard financial contract guard", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin("1234");
  });

  test.afterEach(async () => {
    await seedTestLoginPin("1234");
  });

  test("dashboard shows contract review count and owner rankings exclude unreliable contracts", async ({
    browser,
  }) => {
    const originalBudget = await getSeedProjectBudget();

    try {
      await updateSeedProjectBudget(1);

      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("link", { name: "Contract value review", exact: true })
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/projects need contract value review/i).first()).toBeVisible();

      await page.goto("/financial/owner", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Finance dashboard" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("link", { name: "Contract value review", exact: true })
      ).toBeVisible();
      const topProjects = page.getByTestId("owner-top-projects");
      await expect(topProjects).toBeVisible();
      await expect(topProjects).not.toContainText("[E2E] Seed — HH Unified");
      await expect(page.getByText(/projects need contract value review/i).first()).toBeVisible();
      await context.close();
    } finally {
      await updateSeedProjectBudget(originalBudget);
    }
  });
});
