import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

describe("Bills server-rendered client boundary", () => {
  it.each([
    "src/app/bills/bills-list-client.tsx",
    "src/app/bills/new/new-bill-client.tsx",
    "src/app/bills/[id]/edit/edit-bill-client.tsx",
  ])("keeps %s out of the async database module graph", (file) => {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const runtimeImports = source.statements
      .filter(ts.isImportDeclaration)
      .filter((node) => !node.importClause?.isTypeOnly)
      .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
    expect(runtimeImports).not.toContain("@/lib/data");
    expect(runtimeImports).not.toContain("@/lib/ap-bills-db");
    expect(runtimeImports).not.toContain("@/lib/supabase");
  });
});

it("preserves bill classifications through existing exports", async () => {
  const domain = await import("@/lib/ap-bill-domain");
  const db = await import("@/lib/ap-bills-db");
  expect(domain.AP_BILL_TYPES).toEqual([
    "Vendor",
    "Labor",
    "Overhead",
    "Utility",
    "Permit",
    "Equipment",
    "Other",
  ]);
  expect(domain.AP_BILL_STATUSES).toEqual(["Draft", "Pending", "Partially Paid", "Paid", "Void"]);
  expect(db.AP_BILL_TYPES).toBe(domain.AP_BILL_TYPES);
  expect(db.AP_BILL_STATUSES).toBe(domain.AP_BILL_STATUSES);
});
