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
    client: "E2E Client",
    client_name: "E2E Client",
    address: "123 E2E Snapshot Way",
    spent: 0,
  });
  if (error) throw new Error(`Failed to create test project: ${error.message}`);
  return id;
}

async function deleteProject(projectId: string): Promise<void> {
  const supabase = serviceRoleClient();
  await supabase.from("projects").delete().eq("id", projectId);
}

type SnapshotComparisonOverride = {
  contractValue?: number;
  revisedContractValue?: number;
  grossProfit?: number;
  grossMargin?: number;
  warnings?: Array<{ code: string; severity: "info" | "warning"; message: string }>;
};

function snapshotComparisonBody(projectId: string, override: SnapshotComparisonOverride = {}) {
  const contractValue = override.contractValue ?? 1000;
  const revisedContractValue = override.revisedContractValue ?? contractValue;
  const grossProfit = override.grossProfit ?? revisedContractValue - 7321.5;
  const grossMargin = override.grossMargin ?? grossProfit / revisedContractValue;
  const warnings = override.warnings ?? [
    {
      code: "ap_bills_not_mapped",
      severity: "warning" as const,
      message: "AP bills are not included yet.",
    },
    {
      code: "reimbursement_not_finalized",
      severity: "warning" as const,
      message: "Some reimbursements are not finalized.",
    },
  ];

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
        contractValue,
        approvedChangeOrders: 0,
        revisedContractValue,
        billedAmount: 975,
        paidAmount: 400,
        openAR: 575,
        actualCost: 7321.5,
        expenseCost: 2031.25,
        laborCost: 4890,
        reimbursementCost: 400.25,
        subcontractCost: 0,
        apCost: 0,
        grossProfit,
        grossMargin,
        cashCollected: 400,
        cashOut: 0,
        cashPosition: 400,
        warnings,
        diagnostics: {
          expenseLinesLoaded: 2,
          expenseHeaderFallbackCount: 0,
          excludedExpenseCount: 0,
          pendingExpenseCost: 125,
          pendingExpenseCount: 2,
          changeOrdersLoaded: 0,
          approvedChangeOrdersCount: 0,
          reimbursementDedupedCount: 0,
          pendingReimbursementCost: 200,
          pendingReimbursementCount: 1,
          committedReimbursementCost: 325,
          committedReimbursementCount: 2,
          subcontractCashOut: 0,
          openSubcontractAP: 0,
          openAP: 0,
          apCashOut: 0,
          apBillCount: 0,
          apDiagnosticsWarnings: [],
          missingSchemaWarnings: ["ap_bills_not_mapped"],
          pendingCostReviewWarnings: ["expense_status_pending", "reimbursement_committed_not_paid"],
        },
      },
      differences: [],
      warnings,
      diagnostics: {
        expenseLinesLoaded: 2,
        expenseHeaderFallbackCount: 0,
        excludedExpenseCount: 0,
        pendingExpenseCost: 125,
        pendingExpenseCount: 2,
        changeOrdersLoaded: 0,
        approvedChangeOrdersCount: 0,
        reimbursementDedupedCount: 0,
        pendingReimbursementCost: 200,
        pendingReimbursementCount: 1,
        committedReimbursementCost: 325,
        committedReimbursementCount: 2,
        subcontractCashOut: 0,
        openSubcontractAP: 0,
        openAP: 0,
        apCashOut: 0,
        apBillCount: 0,
        apDiagnosticsWarnings: [],
        missingSchemaWarnings: ["ap_bills_not_mapped"],
        pendingCostReviewWarnings: ["expense_status_pending", "reimbursement_committed_not_paid"],
      },
    },
  };
}

function snapshotBatchBody(projectId: string, override: SnapshotComparisonOverride = {}) {
  return {
    ok: true,
    results: [
      {
        id: projectId,
        ok: true,
        comparison: snapshotComparisonBody(projectId, override).comparison,
      },
    ],
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

  test("returns old vs new comparison in owner no-login mode", async ({ browser }) => {
    const projectId = await createProject();
    const path = `/api/projects/${projectId}/financial-snapshot`;
    const batchPath = `/api/projects/financial-snapshots?ids=${projectId}`;

    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });

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

      const batchResponse = await context.request.get(batchPath);
      expect(batchResponse.status()).toBe(200);
      const batchBody = (await batchResponse.json()) as {
        ok?: boolean;
        results?: Array<{
          id?: string;
          ok?: boolean;
          comparison?: { newSnapshot?: { projectId?: string } };
        }>;
      };
      expect(batchBody.ok).toBe(true);
      expect(batchBody.results).toHaveLength(1);
      expect(batchBody.results?.[0]?.ok).toBe(true);
      expect(batchBody.results?.[0]?.id).toBe(projectId);
      expect(batchBody.results?.[0]?.comparison?.newSnapshot?.projectId).toBe(projectId);
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
      await expect(page.getByTestId("snapshot-profit-gross")).toContainText("-$6,321.50");
      await expect(page.getByTestId("snapshot-profit-margin")).toContainText("-632.2%");
      await expect(page.getByTestId("project-header-actual-cost")).toContainText("$7,322");
      await expect(page.getByTestId("project-header-profit")).toContainText("$6,322");
      await expect(page.getByTestId("project-header-margin")).toContainText("-632.2%");
      await expect(page.getByText("Confirmed Gross Profit").first()).toBeVisible();
      await expect(page.getByText("Confirmed Margin").first()).toBeVisible();
      await expect(
        page.getByText("Contract value needs review before profit can be shown.")
      ).toHaveCount(0);
      await expect(page.getByText("AP/subcontract mapping is not final yet.")).toBeVisible();
      await expect(page.getByText("Some reimbursements still need final review.")).toBeVisible();
      await expect(page.getByText("Pending review costs are not included.")).toBeVisible();
      await expect(page.getByText(/Pending review costs not included/)).toBeVisible();
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toHaveCount(0);
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("project header contract value follows the financial snapshot when project props are stale", async ({
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
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            snapshotComparisonBody(projectId, {
              contractValue: 568000,
              revisedContractValue: 568000,
              grossProfit: 560678.5,
              grossMargin: 560678.5 / 568000,
            })
          ),
        });
      });

      await page.goto(`/projects/${projectId}?tab=cost`, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { name: /\[E2E\] Snapshot API/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("project-header-contract-value")).toContainText("$568,000");
      await expect(page.getByTestId("project-header-contract-value")).not.toContainText("$1,000");
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("project edit saves contract value to budget and contract amount", async ({ browser }) => {
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

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.locator("#edit-project-budget").fill("250000");
      await expect(page.locator("#edit-project-budget")).toHaveValue("250,000");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Project updated")).toBeVisible({ timeout: 30_000 });

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: /\[E2E\] Snapshot API/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("project-header-contract-value")).toContainText("$250,000");

      const supabase = serviceRoleClient();
      const { data, error } = await supabase
        .from("projects")
        .select("budget,contract_amount")
        .eq("id", projectId)
        .single();
      expect(error).toBeNull();
      expect(Number(data?.budget)).toBe(250000);
      expect(Number(data?.contract_amount)).toBe(250000);
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("project cost tab hides snapshot profit when contract value needs review", async ({
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
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            snapshotComparisonBody(projectId, {
              contractValue: 1,
              revisedContractValue: 1,
              grossProfit: -7320.5,
              grossMargin: -7320.5,
            })
          ),
        });
      });

      await page.goto(`/projects/${projectId}?tab=cost`, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { name: /\[E2E\] Snapshot API/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("snapshot-cost-actual")).toContainText("$7,321.50");
      await expect(page.getByTestId("project-header-actual-cost")).toContainText("$7,322");
      await expect(page.getByTestId("project-header-profit")).toContainText("Needs review");
      await expect(page.getByTestId("project-header-margin")).toContainText("—");
      await expect(page.getByTestId("project-header-financial-warning")).toContainText(
        "Contract value needs review before profit can be shown."
      );
      await expect(
        page.getByText("Contract value needs review before profit can be shown.").first()
      ).toBeVisible();
      await expect(page.getByTestId("snapshot-profit-gross")).toHaveCount(0);
      await expect(page.getByTestId("snapshot-profit-margin")).toHaveCount(0);
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
      await expect(page.getByTestId("project-header-financial-warning")).toContainText(
        "Using legacy financial summary"
      );
      await expect(page.getByText("Financial Snapshot Comparison", { exact: true })).toBeVisible();
      await expect(page.getByText("Financial snapshot comparison unavailable.")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("projects list overlays snapshot actual cost and guarded profit", async ({ browser }) => {
    const projectId = await createProject();
    const projectName = `[E2E] Snapshot API ${projectId.slice(0, 8)}`;

    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.route("**/api/projects/financial-snapshots?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(snapshotBatchBody(projectId)),
        });
      });

      await page.goto("/projects", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("projects-list-search-desktop")).toBeVisible({
        timeout: 30_000,
      });
      await page.getByTestId("projects-list-search-desktop").fill(projectName);
      await expect(page.getByRole("link", { name: `Open project ${projectName}` })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("columnheader", { name: "Actual Cost" })).toBeVisible();
      await expect(page.getByTestId(`project-list-actual-cost-${projectId}`).first()).toContainText(
        "$7,322"
      );
      await expect(page.getByTestId(`project-list-profit-${projectId}`).first()).toContainText(
        "$6,322"
      );
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });

  test("projects list hides snapshot profit when contract value needs review", async ({
    browser,
  }) => {
    const projectId = await createProject();
    const projectName = `[E2E] Snapshot API ${projectId.slice(0, 8)}`;

    try {
      const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
      const loginResponse = await context.request.post("/api/auth/pin-login", {
        data: { pin: "1234" },
      });
      expect(loginResponse.status()).toBe(200);

      const page = await context.newPage();
      await page.route("**/api/projects/financial-snapshots?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            snapshotBatchBody(projectId, {
              contractValue: 1,
              revisedContractValue: 1,
              grossProfit: -7320.5,
              grossMargin: -7320.5,
            })
          ),
        });
      });

      await page.goto("/projects", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("projects-list-search-desktop")).toBeVisible({
        timeout: 30_000,
      });
      await page.getByTestId("projects-list-search-desktop").fill(projectName);
      await expect(page.getByRole("link", { name: `Open project ${projectName}` })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId(`project-list-actual-cost-${projectId}`).first()).toContainText(
        "$7,322"
      );
      await expect(page.getByTestId(`project-list-profit-${projectId}`).first()).toContainText(
        "Needs review"
      );
      await context.close();
    } finally {
      await deleteProject(projectId);
    }
  });
});
