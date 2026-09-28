import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setupSpies = vi.hoisted(() => ({
  cleanupTestData: vi.fn(),
  ensureE2EPreservedSeed: vi.fn(),
  provisionE2EAuthUsersForRun: vi.fn(),
  purgeE2EReceiptQueueRows: vi.fn(),
  resetE2ESeedWorkerPayrollStateWithClient: vi.fn(),
  runSchemaAutoRepair: vi.fn(),
}));

const supabase = vi.hoisted(() => {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: "fixture-id" }, error: null });
  return { from: vi.fn(() => query) };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => supabase),
}));
vi.mock("../../tests/e2e-auth-owner", () => ({
  provisionE2EAuthUsersForRun: setupSpies.provisionE2EAuthUsersForRun,
}));
vi.mock("../../tests/e2e-cleanup-db", () => ({
  E2E_PRESERVED_CUSTOMER_ID: "customer-id",
  E2E_PRESERVED_ESTIMATE_ID: "estimate-id",
  E2E_PRESERVED_PROJECT_ID: "project-id",
  E2E_PRESERVED_WORKER_ID: "worker-id",
  cleanupTestData: setupSpies.cleanupTestData,
  purgeE2EReceiptQueueRows: setupSpies.purgeE2EReceiptQueueRows,
}));
vi.mock("../../tests/e2e-ensure-seed", () => ({
  ensureE2EPreservedSeed: setupSpies.ensureE2EPreservedSeed,
}));
vi.mock("../../tests/e2e-load-env", () => ({ loadE2EProcessEnv: vi.fn() }));
vi.mock("../../tests/e2e-reset-worker-payroll", () => ({
  resetE2ESeedWorkerPayrollStateWithClient: setupSpies.resetE2ESeedWorkerPayrollStateWithClient,
}));
vi.mock("../lib/ensure-schema-auto-repair", () => ({
  runSchemaAutoRepair: setupSpies.runSchemaAutoRepair,
}));

import globalSetup from "../../tests/global-setup";

describe("Playwright global Auth setup", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.E2E_SKIP_APP_WARMUP = "1";
    delete process.env.E2E_SKIP_DB_SEED;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local-service-role-key";
    setupSpies.cleanupTestData.mockReset().mockResolvedValue({ deleted: {}, warnings: [] });
    setupSpies.ensureE2EPreservedSeed.mockReset().mockResolvedValue(undefined);
    setupSpies.provisionE2EAuthUsersForRun.mockReset().mockResolvedValue(undefined);
    setupSpies.purgeE2EReceiptQueueRows.mockReset().mockResolvedValue(0);
    setupSpies.resetE2ESeedWorkerPayrollStateWithClient.mockReset().mockResolvedValue(undefined);
    setupSpies.runSchemaAutoRepair.mockReset().mockResolvedValue({
      hasDatabaseUrl: false,
      message: "not configured",
    });
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
  });

  it("resets durable E2E Auth credentials once before business-row setup", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await globalSetup({} as never);

    expect(setupSpies.provisionE2EAuthUsersForRun).toHaveBeenCalledOnce();
    expect(setupSpies.provisionE2EAuthUsersForRun.mock.invocationCallOrder[0]).toBeLessThan(
      setupSpies.cleanupTestData.mock.invocationCallOrder[0]
    );
  });
});
