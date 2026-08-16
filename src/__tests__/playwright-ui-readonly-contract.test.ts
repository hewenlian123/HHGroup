import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runSchemaAutoRepair } from "@/lib/ensure-schema-auto-repair";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("UI-readonly Playwright contract", () => {
  it("isolates UI browser verification from setup, teardown, repair, and browser writes", () => {
    expect(existsSync(join(root, "playwright.ui.config.ts"))).toBe(true);
    expect(existsSync(join(root, "tests/ui-readonly/fixture.ts"))).toBe(true);
    expect(existsSync(join(root, "tests/ui-readonly/receipt-inbox-scroll.spec.ts"))).toBe(true);

    const config = source("playwright.ui.config.ts");
    const fixture = source("tests/ui-readonly/fixture.ts");
    const spec = source("tests/ui-readonly/receipt-inbox-scroll.spec.ts");
    const repair = source("src/lib/ensure-schema-auto-repair.ts");

    expect(config).not.toContain("globalSetup");
    expect(config).not.toContain("globalTeardown");
    expect(config).toContain("E2E_UI_READONLY");
    expect(config).toContain("E2E_UI_STORAGE_STATE");
    expect(config).toContain("isLocalUiBase");
    expect(fixture).toContain("UI_READONLY_METHODS");
    expect(fixture).toContain("route.abort");
    expect(spec).not.toContain("loginAsE2EOwner");
    expect(spec).not.toContain("createClient");
    expect(repair).toContain('process.env.E2E_UI_READONLY === "1"');
  });

  it("hard-stops schema repair in the UI-readonly process", async () => {
    const previousReadonly = process.env.E2E_UI_READONLY;
    const previousDatabaseUrl = process.env.DATABASE_URL;

    process.env.E2E_UI_READONLY = "1";
    process.env.DATABASE_URL = "postgresql://must-not-connect";

    try {
      await expect(runSchemaAutoRepair()).resolves.toMatchObject({
        ok: false,
        hasDatabaseUrl: true,
        message: "Schema auto-repair is disabled for E2E_UI_READONLY browser verification.",
      });
    } finally {
      if (previousReadonly === undefined) delete process.env.E2E_UI_READONLY;
      else process.env.E2E_UI_READONLY = previousReadonly;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});
