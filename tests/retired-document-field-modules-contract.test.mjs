import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const RETIRED_ROUTE_DIRECTORIES = [
  "src/app/documents",
  "src/app/projects/documents",
  "src/app/site-photos",
  "src/app/inspection-log",
  "src/app/api/operations/site-photos",
  "src/app/api/operations/inspection-log",
];

function authoredSources(directory) {
  if (!existsSync(resolve(ROOT, directory))) return [];
  return readdirSync(resolve(ROOT, directory), { recursive: true })
    .filter(
      (path) => typeof path === "string" && [".ts", ".tsx", ".js", ".mjs"].includes(extname(path))
    )
    .map((path) => join(directory, path));
}

function source(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

test("retired Documents Center and field-module route trees are removed", () => {
  const existing = RETIRED_ROUTE_DIRECTORIES.filter((path) =>
    authoredSources(path).some((filePath) =>
      /\/(?:page|route|layout)\.[cm]?[jt]sx?$/.test(filePath)
    )
  );
  assert.deepEqual(existing, []);
});

test("active application source has no Site Photos or Inspection Log route/table references", () => {
  const paths = authoredSources("src").filter((path) => !path.includes("/__tests__/"));
  const retiredLiterals = [
    "/site-photos",
    "/inspection-log",
    '"site_photos"',
    "'site_photos'",
    '"inspection_log"',
    "'inspection_log'",
    '"inspection_logs"',
    "'inspection_logs'",
  ];
  const offenders = [];

  for (const path of paths) {
    const literal = retiredLiterals.find((candidate) => source(path).includes(candidate));
    if (literal) offenders.push({ path, literal });
  }

  assert.deepEqual(offenders, []);
});

test("DOCUMENTS navigation section and retired commands are absent", () => {
  const ia = source("src/lib/navigation/ia.ts");
  assert.doesNotMatch(ia, /key:\s*"DOCUMENTS"/);
  assert.doesNotMatch(ia, /href:\s*"\/(?:documents|site-photos|inspection-log)(?:"|\/)/);
  assert.doesNotMatch(ia, /Go to (?:Documents|Site Photos|Inspection Log)/);
});

test("shared project-file and PDF infrastructure is intentionally preserved", () => {
  for (const path of [
    "src/lib/documents-db.ts",
    "src/app/projects/[id]/documents/actions.ts",
    "src/app/projects/[id]/project-documents-tab.tsx",
    "src/components/documents/document-preview-modal.tsx",
    "src/components/documents/document-company-header.tsx",
  ]) {
    assert.ok(existsSync(resolve(ROOT, path)), `${path} must remain`);
  }

  assert.match(source("src/lib/documents-db.ts"), /\.from\("documents"\)/);
  assert.match(source("src/app/projects/[id]/project-documents-tab.tsx"), /Project Files/);
});

test("new migration retires only exclusive tables and fails closed without CASCADE", () => {
  const migrationDirectory = resolve(ROOT, "supabase/migrations");
  const migration = readdirSync(migrationDirectory)
    .filter((name) => /retire_site_photos_and_inspection_log\.sql$/.test(name))
    .sort()
    .at(-1);
  assert.ok(migration, "retirement migration must be created with Supabase CLI");

  const sql = source(join("supabase/migrations", migration));
  assert.doesNotMatch(sql, /\bcascade\b/i);
  for (const table of ["site_photos", "inspection_log", "inspection_logs"]) {
    assert.match(sql, new RegExp(`drop\\s+table\\s+if\\s+exists\\s+public\\.${table}\\b`, "i"));
  }
  assert.doesNotMatch(sql, /drop\s+table[^;]*public\.documents/i);
  assert.doesNotMatch(sql, /delete\s+from\s+storage\.(?:objects|buckets)/i);
  assert.doesNotMatch(sql, /drop\s+policy[^;]*attachments/i);
  assert.match(sql, /from\s+storage\.objects[\s\S]+site-photos\//i);
  assert.match(sql, /Storage API/i);
});
