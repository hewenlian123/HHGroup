import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "hh-schema-identifiers-"));
  try {
    for (const dir of ["scripts", "src", "supabase/migrations"])
      mkdirSync(join(root, dir), { recursive: true });
    for (const script of ["check-schema-preflight.mjs", "audit-schema-vs-code.mjs"])
      copyFileSync(new URL(`../scripts/${script}`, import.meta.url), join(root, "scripts", script));
    writeFileSync(
      join(root, "supabase/migrations/20260906000000_fixture.sql"),
      `
      create table public.labor_workers (id uuid);
      insert into public.labor_workers (id) select id from public.workers;
      alter table public.final_punch_list_items add column created_at timestamptz;
      create table "public"."final_punch_list_items" (
        "id" uuid,
        "item" text,
        "status" text
      );
      create table if not exists public."quoted_table" (
        id uuid
      );
      create table "public".mixed_table (
        id uuid
      );
      create table public.plain_table (
        id uuid
      );
    `
    );
    const source = join(root, "src/example.ts");
    writeFileSync(
      source,
      `client.from("final_punch_list_items").select("item, status");
client.from("quoted_table").select("id");
client.from("mixed_table").select("id");
client.from("plain_table").select("id");`
    );
    const execute = (script) =>
      spawnSync(process.execPath, [join(root, "scripts", script)], {
        encoding: "utf8",
        env: { ...process.env, SCHEMA_AUDIT_ROOT: root, SCHEMA_PREFLIGHT_RLS_MODE: "loose" },
      });
    run({ source, execute });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("schema scanners recognize quoted, mixed, and ordinary public identifiers", () =>
  fixture(({ execute }) => {
    for (const script of ["check-schema-preflight.mjs", "audit-schema-vs-code.mjs"]) {
      const result = execute(script);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  }));

test("preflight still rejects a genuinely missing table", () =>
  fixture(({ source, execute }) => {
    writeFileSync(source, 'client.from("missing_table").select("id");');
    const result = execute("check-schema-preflight.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing_table/);
  }));

test("column audit rejects a missing column on a quoted table", () =>
  fixture(({ source, execute }) => {
    writeFileSync(source, 'client.from("mixed_table").select("missing_column");');
    const result = execute("audit-schema-vs-code.mjs");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).missing, [
      { table: "mixed_table", column: "missing_column" },
    ]);
  }));
