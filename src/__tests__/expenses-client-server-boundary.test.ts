import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Expenses server-initial client boundary", () => {
  it("keeps Supabase/data modules behind lazy runtime boundaries", () => {
    const client = source("src/app/financial/expenses/expenses-client.tsx");
    const runtimeImports = client.replace(/^import type .*;$/gm, "");

    expect(runtimeImports).not.toMatch(/from\s+["']@\/lib\/(?:data|supabase|expenses-db)["']/);
    expect(client).toContain('import("@/lib/data")');
    expect(client).toContain('import("@/lib/supabase")');
    expect(client).toMatch(/const UploadReceiptsQueueModal = dynamic\(/);
  });
});
