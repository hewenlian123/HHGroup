import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("system health schema-check request amplification", () => {
  it("reuses one internal schema read after authorization instead of issuing a nested API request", () => {
    const healthRoute = source("src/app/api/system-health/route.ts");
    const schemaRoute = source("src/app/api/schema-check/route.ts");

    expect(healthRoute).toContain('from "@/lib/schema-check"');
    expect(healthRoute).toMatch(/const guard = await requireSupabaseOwnerOrAdmin\(request\)/);
    expect(healthRoute).toMatch(/await runSchemaCheck\(\)/);
    expect(healthRoute).not.toMatch(/fetch\([^\n]*\/api\/schema-check/);

    expect(schemaRoute).toContain('from "@/lib/schema-check"');
    expect(schemaRoute).toMatch(/const guard = await requireAuthenticatedUser\(request\)/);
    expect(schemaRoute).toMatch(/await runSchemaCheck\(/);
  });
});
