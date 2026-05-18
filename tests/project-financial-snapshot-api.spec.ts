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

function snapshotComparisonBody(projectId: string) {
  return {
    ok: true,
    comparison: {
      projectId,
      oldCanonicalProfit: {
        revenue: 1000,
        actualCost: 0,
        profit: 1000,
        margin: 1,
        budget: 1000,
        approvedChangeOrders: 0,
        laborCost: 0,
        expenseCost: 0,
        subcontractCost: 0,
      },
      oldProjectCostDashboard: {
        breakdown: { totalCost: 0, materials: 0, labor: 0, bills: 0, other: 0 },
        spentTotal: 0,
        profit: 1000,
        margin: 1,
        revenue: 1000,
      },
      newSnapshot: {
        projectId,
        contractValue: 1000,
        approvedChangeOrders: 0,
        revisedContractValue: 1000,
        billedAmount: 975,
        paidAmount: 400,
        openAR: 575,
        actualCost: 7321.5,
        expenseCost: 2031.25,
        laborCost: 4890,
        reimbursementCost: 400.25,
        subcontractCost: 0,
        apCost: 0,
        grossProfit: -6321.5,
        grossMargin: -6.3215,
        cashCollected: 400,
        cashOut: 0,
        cashPosition: 400,
        warnings: [
          {
            code: "ap_bills_not_mapped",
            severity: "warning",
            message: "AP bills are not included yet.",
          },
          {
            code: "reimbursement_not_finalized",
            severity: "warning",
            message: "Some reimbursements are not finalized.",
          },
        ],
        diagnostics: {
          expenseLinesLoaded: 2,
          expenseHeaderFallbackCount: 0,
          excludedExpenseCount: 0,
          changeOrdersLoaded: 0,
          approvedChangeOrdersCount: 0,
          reimbursementDedupedCount: 0,
          missingSchemaWarnings: ["ap_bills_not_mapped"],
        },
      },
      differences: [],
      warnings: [
        {
          code: "ap_bills_not_mapped",
          severity: "warning",
          message: "AP bills are not included yet.",
        },
        {
          code: "reimbursement_not_finalized",
          severity: "warning",
          message: "Some reimbursements are not finalized.",
        },
      ],
      diagnostics: {
        expenseLinesLoaded: 2,
        expenseHeaderFallbackCount: 0,
        excludedExpenseCount: 0,
        changeOrdersLoaded: 0,
        approvedChangeOrdersCount: 0,
        reimbursementDedupedCount: 0,
        missingSchemaWarnings: ["ap_bills_not_mapped"],
      },
    },
  };
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

  test("project cost tab shows snapshot-backed cost and AR fields", async ({ browser }) => {
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
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(snapshotComparisonBody(projectId)),
        });
      });

      await page.goto(`/projects/${projectId}?tab=cost`, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { name: /\[E2E\] Snapshot API/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("snapshot-cost-actual")).toContainText("$7,321.50");
      await expect(page.getByTestId("snapshot-cost-expense")).toContainText("$2,031.25");
      await expect(page.getByTestId("snapshot-cost-labor")).toContainText("$4,890");
      await expect(page.getByTestId("snapshot-cost-reimbursement")).toContainText("$400.25");
      await expect(page.getByTestId("snapshot-ar-billed")).toContainText("$975");
      await expect(page.getByTestId("snapshot-ar-paid")).toContainText("$400");
      await expect(page.getByTestId("snapshot-ar-open")).toContainText("$575");
      await expect(page.getByText("AP/subcontract mapping is not final yet.")).toBeVisible();
      await expect(page.getByText("Some reimbursements still need final review.")).toBeVisible();
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toHaveCount(0);
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
      await expect(page.getByTestId("snapshot-cost-status")).toContainText(
        "Using legacy cost data"
      );
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toBeVisible();
      await expect(page.getByText("Financial snapshot comparison unavailable.")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });
});
