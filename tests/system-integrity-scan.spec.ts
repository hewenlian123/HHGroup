import { expect, test, type APIRequestContext } from "@playwright/test";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildSystemIntegrityScanReport,
  type SystemIntegrityReadClient,
  type UnknownRow,
} from "../src/lib/system-integrity-scan";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const TEST_HEADERS = {
  ...LOCKED_HEADERS,
  "x-hh-test-auth-bypass": "1",
};

const OWNER_PIN = "1234";
const ALLOWLISTED_TEST_CUSTOMER_ID = "e7b425ed-7ea0-4597-8eff-b006c33229b1";

function memoryIntegrityReadClient(
  rowsByTable: Record<string, UnknownRow[]>
): SystemIntegrityReadClient {
  return {
    from(table: string) {
      return {
        select(_columns?: string, options?: { count?: "exact" | "planned" | "estimated" }) {
          const rows = rowsByTable[table] ?? [];
          const result = (data: UnknownRow[]) => ({
            data,
            error: null,
            count: options?.count === "exact" ? data.length : null,
          });
          return {
            limit(count: number) {
              return Promise.resolve(result(rows.slice(0, count)));
            },
            in(column: string, values: string[]) {
              return Promise.resolve(
                result(rows.filter((row) => values.includes(String(row[column] ?? ""))))
              );
            },
            then<TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              return Promise.resolve(result(rows)).then(onfulfilled, onrejected);
            },
          };
        },
      };
    },
  } as unknown as SystemIntegrityReadClient;
}

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

  test("keeps the exact retained Test Customer as info without contributing to warning status", async () => {
    const report = await buildSystemIntegrityScanReport(
      memoryIntegrityReadClient({
        customers: [{ id: ALLOWLISTED_TEST_CUSTOMER_ID, name: "Test Customer" }],
      })
    );

    expect(report.status).toBe("pass");
    expect(report.summary.totalIssues).toBe(0);
    const markerIssues =
      report.sections.find((section) => section.id === "test-marker-data")?.issues ?? [];
    expect(markerIssues).toEqual([
      expect.objectContaining({
        severity: "info",
        table: "customers",
        id: ALLOWLISTED_TEST_CUSTOMER_ID,
        classification: "intentionally_retained",
        autoFixAvailable: false,
        recommendedAction: "Retained by exact-ID allowlist; review periodically.",
      }),
    ]);
    expect(markerIssues[0]?.evidence).toEqual(
      expect.objectContaining({
        labels: ["allowlisted_retained_row"],
      })
    );
  });

  test("does not pattern-allowlist other Test Customer rows", async () => {
    const customerId = randomUUID();
    const report = await buildSystemIntegrityScanReport(
      memoryIntegrityReadClient({
        customers: [{ id: customerId, name: "Test Customer" }],
      })
    );

    expect(report.status).toBe("warning");
    expect(report.summary.totalIssues).toBe(1);
    expect(report.summary.medium).toBe(1);
    const markerIssues =
      report.sections.find((section) => section.id === "test-marker-data")?.issues ?? [];
    expect(markerIssues).toEqual([
      expect.objectContaining({
        severity: "medium",
        table: "customers",
        id: customerId,
        category: "test_marker",
        autoFixAvailable: false,
      }),
    ]);
    expect(markerIssues[0]?.classification).toBeUndefined();
  });

  test("labels worker receipt, reimbursement, and generated expense markers as reversal-policy warnings", async () => {
    const projectId = "project-real";
    const workerId = "worker-real";
    const reimbursementId = "reimbursement-marker";
    const receiptId = "receipt-marker";
    const expenseId = "expense-marker";
    const report = await buildSystemIntegrityScanReport(
      memoryIntegrityReadClient({
        projects: [{ id: projectId, name: "99-403 Paihi St- Aiea" }],
        worker_reimbursements: [
          {
            id: reimbursementId,
            project_id: projectId,
            worker_id: workerId,
            vendor: "Test Vendor",
            description: "Test Vendor · Other",
            status: "paid",
            paid_at: "2026-05-09T21:01:30.212Z",
          },
        ],
        worker_receipts: [
          {
            id: receiptId,
            project_id: projectId,
            worker_id: workerId,
            vendor: "Test Vendor",
            reimbursement_id: reimbursementId,
            status: "Approved",
          },
        ],
        expenses: [
          {
            id: expenseId,
            project_id: projectId,
            worker_id: workerId,
            vendor: "Test Vendor",
            notes: "Test Vendor · Other",
            source: "worker_reimbursement",
            source_id: reimbursementId,
            status: "paid",
          },
        ],
        expense_lines: [{ id: "expense-line", expense_id: expenseId, project_id: projectId }],
      })
    );

    const issues = report.sections.flatMap((section) => section.issues);
    const reimbursementIssue = issues.find(
      (issue) => issue.table === "worker_reimbursements" && issue.id === reimbursementId
    );
    expect(reimbursementIssue).toEqual(
      expect.objectContaining({
        severity: "medium",
        classification: "requires_reversal_policy",
        autoFixAvailable: false,
      })
    );
    expect(reimbursementIssue?.evidence.labels).toEqual(
      expect.arrayContaining([
        "requires_reversal_policy",
        "linked_real_project",
        "paid_reimbursement",
        "linked_worker_receipt",
        "affects_worker_balance",
        "affects_project_actual_cost",
      ])
    );

    const receiptIssues = issues.filter(
      (issue) => issue.table === "worker_receipts" && issue.id === receiptId
    );
    expect(receiptIssues.length).toBeGreaterThanOrEqual(2);
    expect(receiptIssues[0]?.classification).toBe("requires_reversal_policy");
    expect(receiptIssues[0]?.evidence.labels).toEqual(
      expect.arrayContaining([
        "requires_reversal_policy",
        "linked_worker_reimbursement",
        "linked_real_project",
      ])
    );

    const expenseIssue = issues.find(
      (issue) => issue.table === "expenses" && issue.id === expenseId
    );
    expect(expenseIssue).toEqual(
      expect.objectContaining({
        classification: "requires_reversal_policy",
        autoFixAvailable: false,
      })
    );
    expect(expenseIssue?.evidence.labels).toEqual(
      expect.arrayContaining([
        "requires_reversal_policy",
        "generated_expense",
        "linked_worker_reimbursement",
        "linked_real_project",
        "affects_project_actual_cost",
      ])
    );
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
                    severity: "info",
                    category: "test_marker",
                    table: "customers",
                    id: ALLOWLISTED_TEST_CUSTOMER_ID,
                    classification: "intentionally_retained",
                    message: "Exact allowlisted test marker retained in customers.",
                    evidence: {
                      fields: [{ field: "name", value: "Test Customer" }],
                      labels: ["allowlisted_retained_row"],
                    },
                    recommendedAction: "Retained by exact-ID allowlist; review periodically.",
                    autoFixAvailable: false,
                  },
                  {
                    severity: "medium",
                    category: "test_marker",
                    table: "worker_reimbursements",
                    id: "reimbursement-marker",
                    classification: "requires_reversal_policy",
                    message:
                      "Strong test marker text found in worker reimbursement; financial reversal policy required.",
                    evidence: {
                      fields: [{ field: "vendor", value: "Test Vendor" }],
                      labels: [
                        "requires_reversal_policy",
                        "linked_real_project",
                        "paid_reimbursement",
                      ],
                    },
                    recommendedAction:
                      "Do not hard-delete paid worker reimbursement data. Review a financial reversal policy before cleanup.",
                    autoFixAvailable: false,
                  },
                ],
              },
            ],
          }),
        });
      });

      await page.goto("/system-health", { waitUntil: "domcontentloaded" });
      const scannerSection = page
        .locator("details")
        .filter({ hasText: "System Integrity Scanner" })
        .first();
      await expect(
        scannerSection.getByText("System Integrity Scanner", { exact: true })
      ).toBeVisible({ timeout: 30_000 });
      await expect(scannerSection.getByText("Status: Warning")).toBeVisible();
      await expect(scannerSection.getByText("Read-only scan")).toBeVisible();
      await expect(scannerSection.getByText("Auto-fix disabled")).toBeVisible();
      await expect(
        scannerSection.getByText("No cleanup actions are available from this panel.")
      ).toBeVisible();
      await expect(
        scannerSection.getByText("1 issue(s)").filter({ visible: true }).first()
      ).toBeVisible();
      await expect(scannerSection.getByText("Total issues", { exact: true })).toBeVisible();
      await expect(scannerSection.getByText("Critical", { exact: true })).toBeVisible();
      await expect(scannerSection.getByText("High", { exact: true })).toBeVisible();
      await expect(scannerSection.getByText("Medium", { exact: true })).toBeVisible();
      await expect(scannerSection.getByText("Low", { exact: true })).toBeVisible();
      await expect(scannerSection.getByText("Generated", { exact: true })).toBeVisible();
      await expect(scannerSection.getByText("Top 10 issues")).toBeVisible();
      await expect(
        scannerSection
          .getByText(`customers / ${ALLOWLISTED_TEST_CUSTOMER_ID}`)
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(
        scannerSection
          .getByText("Allowlisted retained row", { exact: false })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(
        scannerSection
          .getByText("worker_reimbursements / reimbursement-marker")
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(
        scannerSection
          .getByText("Requires reversal policy", { exact: false })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(
        scannerSection
          .getByText("Linked to real project", { exact: false })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(
        scannerSection
          .getByText("Paid reimbursement", { exact: false })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(
        scannerSection.getByText("Auto fix").filter({ visible: true }).first()
      ).toBeVisible();
      await expect(
        scannerSection.getByText("Disabled").filter({ visible: true }).first()
      ).toBeVisible();
      await expect(scannerSection.getByRole("button", { name: /delete|fix|cleanup/i })).toHaveCount(
        0
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
