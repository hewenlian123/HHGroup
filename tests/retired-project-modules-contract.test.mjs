import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const RETIRED_ROUTE_DIRECTORIES = [
  "src/app/tasks",
  "src/app/punch-list",
  "src/app/schedule",
  "src/app/materials",
  "src/app/projects/schedule",
  "src/app/api/tasks",
  "src/app/api/materials",
  "src/app/api/operations/tasks",
  "src/app/api/operations/punch-list",
  "src/app/api/operations/schedule",
];

const RETIRED_ROUTE_LITERALS = ["/tasks", "/punch-list", "/schedule", "/materials"];
const RETIRED_TABLE_LITERALS = [
  "project_tasks",
  "project_schedule",
  "punch_list",
  "material_catalog",
  "project_material_selections",
  "material_selections",
  "material_selection_items",
  "project_closeout_punch",
  "final_punch_lists",
  "final_punch_list_items",
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

test("retired project-module route trees are removed", () => {
  const existing = RETIRED_ROUTE_DIRECTORIES.filter((path) =>
    authoredSources(path).some((filePath) =>
      /\/(?:page|route|layout)\.[cm]?[jt]sx?$/.test(filePath)
    )
  );
  assert.deepEqual(existing, []);
});

test("active application source has no retired route or table references", () => {
  const paths = authoredSources("src").filter((path) => !path.includes("/__tests__/"));
  const offenders = [];

  for (const path of paths) {
    const text = source(path);
    const route = RETIRED_ROUTE_LITERALS.find((literal) => text.includes(`"${literal}`));
    const table = RETIRED_TABLE_LITERALS.find(
      (literal) => text.includes(`"${literal}"`) || text.includes(`'${literal}'`)
    );
    if (route || table) offenders.push({ path, route, table });
  }

  assert.deepEqual(offenders, []);
});

test("Projects navigation contains only the four preserved modules", () => {
  const ia = source("src/lib/navigation/ia.ts");
  const projectsSection = ia.match(
    /key:\s*"PROJECTS"[\s\S]*?\n\s*},\n\s*{\n\s*key:\s*"FINANCIAL"/
  )?.[0];
  assert.ok(projectsSection, "Projects navigation section must exist");

  const labels = [...projectsSection.matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["PROJECTS", "Projects", "Estimates", "Change Orders", "Time Entries"]);
});

test("shared Closeout runtime uses the preserved canonical tables", () => {
  const closeout = source("src/lib/project-closeout-db.ts");
  const projects = source("src/lib/projects-db.ts");

  assert.match(closeout, /\.from\("warranties"\)/);
  assert.match(closeout, /\.from\("completion_certificates"\)/);
  assert.doesNotMatch(closeout, /project_closeout_(?:warranty|completion)/);
  assert.doesNotMatch(projects, /project_closeout_(?:warranty|completion)/);
});

test("a new non-cascade migration retires every module-exclusive table", () => {
  const migrationDirectory = resolve(ROOT, "supabase/migrations");
  const migration = readdirSync(migrationDirectory)
    .filter((name) => /retire_unused_project_modules\.sql$/.test(name))
    .sort()
    .at(-1);
  assert.ok(migration, "retirement migration must be created with Supabase CLI");

  const sql = source(join("supabase/migrations", migration));
  assert.doesNotMatch(sql, /\bcascade\b/i);
  for (const table of RETIRED_TABLE_LITERALS) {
    assert.match(sql, new RegExp(`drop\\s+table\\s+if\\s+exists\\s+public\\.${table}\\b`, "i"));
  }
  assert.match(sql, /drop\s+function\s+if\s+exists\s+public\.replace_final_punch_list\b/i);
  assert.doesNotMatch(sql, /delete\s+from\s+storage\.(?:objects|buckets)/i);
  assert.match(sql, /from\s+storage\.objects[\s\S]+punch-photos[\s\S]+material-images/i);
  assert.match(sql, /from\s+storage\.buckets[\s\S]+punch-photos[\s\S]+material-images/i);
  assert.match(sql, /must be removed through the Storage API/i);
});
