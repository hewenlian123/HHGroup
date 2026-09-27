import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// Explicit local-only opt-in. Every schema variant and existing fixture is rolled back.
const enabled = process.env.HH_EXPENSE_SOURCE_TYPE_LOCAL_TEST === "1";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260906203011_expense_source_id_type_compatibility.sql",
    import.meta.url
  ),
  "utf8"
);
const functionNames =
  "'create_expense_atomic','update_expense_atomic','create_paid_reimbursement_expense','record_worker_reimbursement_payment_atomic','reconcile_bank_transaction_expense_atomic'";
for (const variant of ["text", "uuid"]) {
  for (const suite of ["003_reimbursement_payment_atomic.sql", "005_expense_bank_atomic.sql"]) {
    test(`${variant} source ID preserves ${suite}`, { skip: !enabled }, () => {
      const status = JSON.parse(
        execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      );
      assert.ok(
        ["localhost", "127.0.0.1", "[::1]"].includes(new URL(status.DB_URL).hostname),
        "Remote databases refused"
      );
      const fixture = readFileSync(
        new URL(`../supabase/tests/database/${suite}`, import.meta.url),
        "utf8"
      )
        .replace(/^begin;\s*/i, "")
        .replace(/rollback;\s*$/i, "");
      const sql = `begin;
        create extension if not exists pgtap with schema extensions;
        set local search_path = public, extensions;
        create temp table compatibility_acl as select oid,proacl,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in (${functionNames});
        create temp table compatibility_data as select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'')) fingerprint from public.expenses e;
        ${variant === "uuid" ? "alter table public.expenses alter column source_id type uuid using source_id::uuid;" : ""}
        ${migration}
        do $$ begin
          if exists(select 1 from compatibility_acl a join pg_proc p on p.oid=a.oid where a.proacl is distinct from p.proacl or a.prosecdef is distinct from p.prosecdef or a.proconfig is distinct from p.proconfig) then raise exception 'Compatibility changed function authority'; end if;
          if (select fingerprint from compatibility_data) is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'')) from public.expenses e) then raise exception 'Compatibility changed existing expense data'; end if;
        end $$;
        create temp table compatibility_definitions as select oid,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in (${functionNames});
        ${migration}
        do $$ begin
          if exists(select 1 from compatibility_definitions d join pg_proc p on p.oid=d.oid where d.definition is distinct from pg_get_functiondef(p.oid)) then raise exception 'Compatibility is not idempotent'; end if;
        end $$;
        ${fixture}
        rollback;`;
      const output = execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_hh-unified-web",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
      );
      assert.doesNotMatch(output, /(?:^|\n)\s*not ok\b|Looks like you failed/, output);
      assert.match(output, /ROLLBACK/);
      console.log(
        `${variant}: ${suite}: ${output.match(/(?:^|\n)\s*ok \d+/g)?.length ?? 0} assertions passed; ACL/data unchanged; transaction rolled back`
      );
    });
  }
}

test("UUID compatibility refuses an unexpected function body", { skip: !enabled }, () => {
  const sql = `begin;
    alter table public.expenses alter column source_id type uuid using source_id::uuid;
    do $test$ begin
      execute replace(pg_get_functiondef('public.create_expense_atomic(text,jsonb)'::regprocedure),
        $old$nullif(p_payload->>'sourceId', '')$old$, 'NULL::text');
    end $test$;
    ${migration}
    rollback;`;
  assert.throws(
    () =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_hh-unified-web",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      ),
    /Expected one source-ID anchor/
  );
});
