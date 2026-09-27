import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const enabled = process.env.HH_MATERIAL_LEGACY_LOCAL_TEST === "1";
test(
  "legacy material prerequisite preserves data and prevents alias authorization bypass",
  { skip: !enabled },
  () => {
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20260906202730_project_material_selection_legacy_compatibility.sql",
        import.meta.url
      ),
      "utf8"
    )
      .replaceAll("public.project_material_selections", "pg_temp.hh_legacy_selections")
      .replaceAll("public.material_catalog", "pg_temp.hh_legacy_catalog");
    const literal = "'" + migration.replaceAll("'", "''") + "'";
    const sql = `begin;
create temporary table hh_legacy_catalog(id uuid primary key);
insert into hh_legacy_catalog values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
create temporary table hh_legacy_selections(id uuid primary key, catalog_id uuid, item_name text);
${migration}
do $case$
begin
 if (select count(*) from pg_attribute where attrelid='pg_temp.hh_legacy_selections'::regclass and attname in ('item','category','material_id','material_name','supplier') and not attisdropped)<>5 then raise exception 'Missing canonical fields'; end if;
 insert into hh_legacy_selections(id,catalog_id,material_id,item_name,item) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Legacy label','Canonical label');
 begin
  update hh_legacy_selections set material_id='10000000-0000-0000-0000-000000000002';
  raise exception 'Expected mismatched alias rejection';
 exception when check_violation then null; end;
 begin
  update hh_legacy_selections set material_id=null;
  raise exception 'Expected legacy-only reference rejection';
 exception when check_violation then null; end;
end $case$;
create temporary table hh_preserved as select to_jsonb(t) as row from hh_legacy_selections t;
${migration}
do $case$ begin
 if exists(select to_jsonb(t) from hh_legacy_selections t except select row from hh_preserved) then raise exception 'Replay changed canonical data'; end if;
end $case$;
drop table hh_legacy_selections;
create temporary table hh_legacy_selections(id uuid primary key, catalog_id uuid, item_name text);
insert into hh_legacy_selections values ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Preserve unmapped row');
do $case$ begin
 begin
  execute ${literal};
  raise exception 'Expected populated legacy rejection';
 exception when check_violation then null; end;
 if (select count(*) from hh_legacy_selections where item_name='Preserve unmapped row')<>1 then raise exception 'Legacy row changed'; end if;
 if exists(select 1 from pg_attribute where attrelid='pg_temp.hh_legacy_selections'::regclass and attname='material_id' and not attisdropped) then raise exception 'Failed migration left schema changes'; end if;
end $case$;
rollback;
select 'material compatibility checks passed';`;
    const output = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_hh-unified-web",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", timeout: 30000 }
    );
    assert.match(output, /material compatibility checks passed/);
  }
);
