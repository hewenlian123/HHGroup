import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const ROLLBACKS = path.join(ROOT, "supabase", "rollbacks");
const LEGACY_RELATION = /project_closeout_(?:punch|warranty|completion)/;

function canonicalMigrationFile(): string {
  const matches = readdirSync(MIGRATIONS).filter((file) =>
    file.endsWith("_canonical_closeout_reconciliation.sql")
  );
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

describe("canonical Closeout migration contract", () => {
  it("defines every canonical invariant and the atomic service-only RPC", () => {
    const sql = readFileSync(path.join(MIGRATIONS, canonicalMigrationFile()), "utf8");

    expect(sql).toMatch(/alter column project_id set not null/gi);
    expect(sql).toMatch(/unique\s*\(project_id\)/i);
    expect(sql).toMatch(/position integer/i);
    expect(sql).toMatch(/alter column punch_list_id set not null/i);
    expect(sql).toMatch(/alter column position set not null/i);
    expect(sql).toMatch(/check\s*\(position >= 0\)/i);
    expect(sql).toMatch(/unique\s*\(punch_list_id, position\)/i);
    expect(sql).toMatch(/alter column status set default 'pending'/i);
    expect(sql).toMatch(/alter column status set not null/i);
    expect(sql).toMatch(/status in \('pending', 'done'\)/i);
    expect(sql).toMatch(/create or replace function public\.replace_final_punch_list/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/set lock_timeout = '5s'/i);
    expect(sql).toMatch(/set statement_timeout = '15s'/i);
    expect(sql).toMatch(
      /revoke execute on function public\.replace_final_punch_list[\s\S]+from public/i
    );
    expect(sql).toMatch(
      /revoke execute on function public\.replace_final_punch_list[\s\S]+from anon/i
    );
    expect(sql).toMatch(
      /revoke execute on function public\.replace_final_punch_list[\s\S]+from authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.replace_final_punch_list[\s\S]+to service_role/i
    );
  });

  it("drops empty legacy tables fail closed and never recreates them in rollback", () => {
    const migration = canonicalMigrationFile();
    const sql = readFileSync(path.join(MIGRATIONS, migration), "utf8");
    const rollback = readFileSync(
      path.join(ROLLBACKS, migration.replace(".sql", ".rollback.sql")),
      "utf8"
    );

    expect(sql).toMatch(/legacy Closeout table .* contains data/i);
    expect(sql).toMatch(/unexpected dependency/i);
    expect(sql).toMatch(/drop table(?: if exists)? public\.project_closeout_punch/i);
    expect(sql).toMatch(/drop table(?: if exists)? public\.project_closeout_warranty/i);
    expect(sql).toMatch(/drop table(?: if exists)? public\.project_closeout_completion/i);
    expect(rollback).not.toMatch(/create\s+table[\s\S]+project_closeout_/i);
    expect(rollback).not.toMatch(/drop\s+(?:table|column)/i);
  });

  it("removes legacy relations from active source and the Project PDF expansion", () => {
    const activeFiles = [
      "src/lib/project-closeout-db.ts",
      "src/lib/projects-db.ts",
      "src/lib/data/index.ts",
      "src/app/api/projects/[id]/closeout/punch/route.ts",
      "src/app/api/projects/[id]/closeout/warranty/route.ts",
      "src/app/api/projects/[id]/closeout/completion/route.ts",
      "src/app/api/projects/[id]/tab/route.ts",
      "src/app/projects/[id]/page.tsx",
      "src/app/projects/[id]/project-closeout-tab.tsx",
      "src/app/api/projects/[id]/closeout/generate-punch-pdf/route.ts",
      "src/app/api/projects/[id]/closeout/generate-completion-pdf/route.ts",
      "supabase/migrations/20260802055949_project_pdf_documents_expand.sql",
    ];

    for (const file of activeFiles) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(LEGACY_RELATION);
    }

    const pdfMigration = readFileSync(
      path.join(MIGRATIONS, "20260802055949_project_pdf_documents_expand.sql"),
      "utf8"
    );
    expect(pdfMigration).toContain("public.final_punch_lists");
    expect(pdfMigration).toContain("public.final_punch_list_items");
    expect(pdfMigration).toContain("public.completion_certificates");
  });
});
