import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const ROLLBACKS = join(ROOT, "supabase", "rollbacks");

function sourceWithSuffix(directory: string, suffix: string): { file: string; sql: string } {
  const file = readdirSync(directory).find((candidate) => candidate.endsWith(suffix)) ?? "";
  return {
    file,
    sql: file ? readFileSync(join(directory, file), "utf8") : "",
  };
}

describe("Project PDF documents expand migration contract", () => {
  it("adds every canonical document field defensively in a new ordered migration", () => {
    const { file, sql } = sourceWithSuffix(MIGRATIONS, "_project_pdf_documents_expand.sql");
    const maxPrevious = readdirSync(MIGRATIONS)
      .filter((candidate) => /^\d{12,14}_/.test(candidate) && candidate !== file)
      .sort()
      .at(-1);

    expect(file).toMatch(/^\d{14}_project_pdf_documents_expand\.sql$/);
    expect(file > (maxPrevious ?? "")).toBe(true);
    for (const [column, type] of [
      ["file_name", "text"],
      ["file_path", "text"],
      ["file_type", "text"],
      ["mime_type", "text"],
      ["size_bytes", "bigint"],
      ["related_module", "text"],
      ["related_id", "uuid"],
      ["uploaded_by", "text"],
      ["uploaded_at", "timestamptz"],
      ["notes", "text"],
    ] as const) {
      expect(sql).toMatch(
        new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\s+${type}`, "i")
      );
    }
    expect(sql).toMatch(/raise exception[\s\S]*incompatible/i);
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(sql).not.toMatch(/drop\s+table/i);
  });

  it("backfills safely, validates canonical values, and normalizes the project foreign key", () => {
    const { sql } = sourceWithSuffix(MIGRATIONS, "_project_pdf_documents_expand.sql");

    expect(sql).toMatch(/update\s+public\.documents/i);
    expect(sql).toMatch(/file_path\s*=\s*coalesce[\s\S]*file_url/i);
    expect(sql).toMatch(/file_name\s*=\s*coalesce[\s\S]*name/i);
    expect(sql).toMatch(/uploaded_at\s*=\s*coalesce[\s\S]*created_at/i);
    expect(sql).toMatch(/documents_size_bytes_nonnegative/i);
    expect(sql).toMatch(/size_bytes\s+is\s+null\s+or\s+size_bytes\s*>=\s*0/i);
    expect(sql).toMatch(/documents_file_type_check/i);
    for (const fileType of [
      "Contract",
      "Estimate",
      "Invoice",
      "Receipt",
      "Subcontract",
      "Permit",
      "Photo",
      "Daily Log",
      "Other",
    ]) {
      expect(sql).toContain(`'${fileType}'`);
    }
    expect(sql).toMatch(/foreign key\s*\(project_id\)[\s\S]*on delete set null/i);
    expect(sql).toMatch(/validate constraint documents_project_id_fkey/i);
  });

  it("creates the reviewed indexes and aborts before duplicate file paths can be accepted", () => {
    const { sql } = sourceWithSuffix(MIGRATIONS, "_project_pdf_documents_expand.sql");

    for (const index of [
      "idx_documents_project_id",
      "idx_documents_file_type",
      "idx_documents_related",
      "idx_documents_uploaded_at",
      "idx_documents_file_name_lower",
    ]) {
      expect(sql).toContain(index);
    }
    expect(sql).toMatch(
      /create unique index if not exists ux_documents_file_path_not_null[\s\S]*where file_path is not null/i
    );
    expect(sql).toMatch(/group by file_path[\s\S]*having count\(\*\)\s*>\s*1/i);
    expect(sql).toMatch(/raise exception[\s\S]*duplicate/i);
  });

  it("creates a private attachments bucket without new Storage policies or restrictions", () => {
    const { sql } = sourceWithSuffix(MIGRATIONS, "_project_pdf_documents_expand.sql");

    expect(sql).toMatch(/insert into storage\.buckets/i);
    expect(sql).toMatch(/values\s*\(\s*'attachments'\s*,\s*'attachments'\s*,\s*false/i);
    expect(sql).toMatch(/on conflict\s*\(id\)[\s\S]*public\s*=\s*false/i);
    expect(sql).not.toMatch(/create policy[\s\S]*storage\.objects/i);
    expect(sql).not.toMatch(/allowed_mime_types|file_size_limit/i);
    expect(sql).not.toMatch(/delete\s+from\s+storage\.(objects|buckets)/i);
  });

  it("keeps document compatibility access while explicitly denying admin and assistant mutation keys", () => {
    const { sql } = sourceWithSuffix(MIGRATIONS, "_project_pdf_documents_expand.sql");

    expect(sql).toMatch(/where\s+role\s+in\s*\(\s*'admin'\s*,\s*'assistant'\s*\)/i);
    expect(sql).toMatch(/projects\.update[\s\S]*false/i);
    expect(sql).toMatch(/finance\.manage[\s\S]*false/i);
    expect(sql).not.toMatch(/drop policy[\s\S]*on public\.documents/i);
    expect(sql).not.toMatch(/revoke[\s\S]*on (table )?public\.documents[\s\S]*from anon/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.documents/i);
  });

  it("grants service-role read access to every hardened route dependency", () => {
    const { sql } = sourceWithSuffix(MIGRATIONS, "_project_pdf_documents_expand.sql");

    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete[\s\S]*public\.documents[\s\S]*service_role/i
    );
    for (const table of [
      "project_material_selections",
      "material_catalog",
      "project_closeout_completion",
      "project_closeout_punch",
      "invoices",
      "invoice_items",
      "invoice_payments",
      "project_change_orders",
      "subcontract_bills",
      "labor_entries",
      "expense_lines",
      "expenses",
      "commissions",
      "project_commissions",
    ]) {
      expect(sql).toMatch(
        new RegExp(`grant\\s+select[\\s\\S]*public\\.${table}[\\s\\S]*service_role`, "i")
      );
    }
  });

  it("provides a guarded, non-destructive rollback that retains the expand state", () => {
    const { file, sql } = sourceWithSuffix(ROLLBACKS, "_project_pdf_documents_expand.rollback.sql");

    expect(file).toMatch(/^\d{14}_project_pdf_documents_expand\.rollback\.sql$/);
    expect(sql).toMatch(/\bbegin\s*;/i);
    expect(sql).toContain("current_setting('hh.rollback_confirmation', true)");
    expect(sql).toContain("ROLLBACK_PROJECT_PDF_DOCUMENTS_EXPAND");
    expect(sql).toMatch(/raise exception/i);
    expect(sql).not.toMatch(/\bcommit\s*;/i);
    expect(sql).not.toMatch(/drop\s+(column|table|index)/i);
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).not.toMatch(/public\s*=\s*true/i);
    expect(sql).not.toMatch(/create policy[\s\S]*to anon/i);

    const rollbackCheck = readFileSync(join(ROOT, "scripts", "check-rollback-sql.mjs"), "utf8");
    expect(rollbackCheck).toContain(file);
    expect(rollbackCheck).toContain("ROLLBACK_PROJECT_PDF_DOCUMENTS_EXPAND");
  });

  it("registers a local-only transaction probe for legacy upgrade and repeat execution", () => {
    const scriptPath = join(ROOT, "scripts", "check-project-pdf-expand-migration.mjs");
    expect(existsSync(scriptPath), "local migration probe must exist").toBe(true);
    const script = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(script).toContain("127.0.0.1");
    expect(script).toContain('port !== "54322"');
    expect(script).toMatch(/sql\.begin/i);
    expect(script).toMatch(/project_pdf_documents_expand\.sql/i);
    expect(script.match(/transaction\.unsafe\(migrationSql\)/g)).toHaveLength(2);
    expect(script).toContain("LEGACY_PROJECT_ID");
    expect(script).toContain("LEGACY_DOCUMENT_ID");
    expect(packageJson.scripts?.["check:project-pdf-expand-migration"]).toBe(
      "node scripts/check-project-pdf-expand-migration.mjs"
    );
  });
});
