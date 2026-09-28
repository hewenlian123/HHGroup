import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

test(
  "local company authorization catalog",
  { skip: process.env.HH_COMPANY_AUTH_LOCAL_TEST !== "1" },
  async (t) => {
    const status = JSON.parse(
      execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(status.DB_URL).hostname));
    const sql = postgres(status.DB_URL, { max: 1 });
    try {
      const rollback = new Error("rollback exact company role fixtures");
      await assert.rejects(
        sql.begin(async (sql) => {
          const tx = sql;
          if (process.env.HH_COMPANY_AUTH_PENDING_MIGRATIONS === "1") {
            for (const migration of [
              "20260906115947_secure_worker_projection_authority.sql",
              "20260906120301_global_company_role_boundaries.sql",
            ]) {
              await sql.unsafe(readFileSync(`supabase/migrations/${migration}`, "utf8"));
            }
          }
          const funcs =
            await sql`select p.oid::regprocedure::text as name,p.prosecdef,has_function_privilege('anon',p.oid,'execute') as anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('approve_change_order','approve_subcontract_bill','create_subcontract_bill_guard')`;
          for (const fn of funcs) {
            assert.equal(fn.anon, false, `${fn.name}: anonymous mutation must be denied`);
            assert.equal(fn.prosecdef, false, `${fn.name}: caller RLS must apply`);
          }
          const [objects] =
            await sql`select to_regclass('public.project_change_order_attachments')::text as attachments,to_regprocedure('private.can_manage_company()')::text as company`;
          assert.ok(
            objects.attachments,
            "Change order attachments must survive clean migration replay"
          );
          assert.ok(objects.company, "Live company authorization must exist");
          const dangerous =
            await sql`select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','TRIGGER')`;
          assert.equal(
            dangerous.length,
            0,
            "Client roles cannot hold RLS-bypassing table privileges"
          );
          const missingRoleBoundaries =
            await sql`select b.tablename from pg_policies b where b.schemaname='public' and b.policyname='company_membership_boundary' and b.tablename not in ('workers','worker_receipts') and not exists(select 1 from pg_policies r where r.schemaname=b.schemaname and r.tablename=b.tablename and r.policyname='company_administrator_boundary' and r.permissive='RESTRICTIVE' and r.cmd='ALL' and r.qual like '%can_manage_company%' and r.with_check like '%can_manage_company%')`;
          assert.equal(
            missingRoleBoundaries.length,
            0,
            "Every global company table requires a live administrator"
          );
          const [{ id: company }] = await tx`select private.company_organization_id() id`;
          assert.ok(company);
          const foreign = randomUUID(),
            project = randomUUID(),
            foreignProject = randomUUID();
          const worker = randomUUID(),
            customer = randomUUID();
          await tx`insert into public.organizations(id,name) values (${foreign},'[E2E] company boundary')`;
          await tx`insert into public.projects(id,name,organization_id) values (${project},'[E2E] company boundary',${company}),(${foreignProject},'[E2E] foreign boundary',${foreign})`;
          await tx`insert into public.workers(id,name) values (${worker},'[E2E] company boundary')`;
          await tx`insert into public.customers(id,name) values (${customer},'[E2E] company boundary')`;
          for (const [name, role, org, memberRole, companyRead, manage, liveRole] of [
            ["owner", "owner", company, "owner", true, true],
            ["admin", "admin", company, "admin", true, true],
            ["assistant", "assistant", company, "assistant", true, false],
            ["foreign owner", "owner", foreign, "owner", false, false],
            ["unassigned owner", "owner", null, null, false, false],
            ["revoked app role", "owner", company, "owner", true, false, "assistant"],
            ["anonymous", null, null, null, false, false],
          ]) {
            await t.test(`${name}: live company worker/customer access and writes`, async () => {
              const id = randomUUID();
              if (role) {
                await tx`insert into auth.users(id,email,raw_app_meta_data) values (${id},${id + "@example.invalid"},${tx.json({ role: liveRole ?? role })})`;
                if (org)
                  await tx`insert into public.organization_memberships(organization_id,user_id,role,status) values (${org},${id},${memberRole},'active')`;
              }
              await tx`select set_config('request.jwt.claims',${JSON.stringify(role ? { sub: id, role: "authenticated", app_metadata: { role } } : { role: "anon" })},true)`;
              await tx.unsafe(role ? "set local role authenticated" : "set local role anon");
              try {
                for (const [table, target, read] of [
                  ["workers", worker, companyRead],
                  ["customers", customer, manage],
                ]) {
                  const query = () =>
                    tx.savepoint(async (sp) => sp`select id from ${sp(table)} where id=${target}`);
                  if (!role) await assert.rejects(query(), (e) => e.code === "42501");
                  else assert.equal((await query()).length, read ? 1 : 0, `${name} ${table} read`);
                  const nextName = `[E2E] company boundary ${name}`;
                  const update = () =>
                    tx.savepoint(
                      async (sp) =>
                        sp`update ${sp(table)} set name=${nextName} where id=${target} returning id`
                    );
                  if (!role) await assert.rejects(update(), (e) => e.code === "42501");
                  else
                    assert.equal(
                      (await update()).length,
                      manage ? 1 : 0,
                      `${name} ${table} update`
                    );
                  if (table === "workers" && manage) {
                    const [mirror] =
                      await tx`select id,name from public.labor_workers where id=${worker}`;
                    assert.equal(mirror.id, worker);
                    assert.equal(
                      mirror.name,
                      nextName,
                      "Authorized worker rename synchronizes the exact UUID projection"
                    );
                  }
                  await assert.rejects(
                    tx.savepoint(
                      (sp) =>
                        sp`update public.labor_workers set name='forbidden direct projection write' where id=${worker}`
                    ),
                    (e) => e.code === "42501"
                  );
                }
              } finally {
                await tx.unsafe("reset role");
                await tx`select set_config('request.jwt.claims','',true)`;
              }
            });
          }
          await t.test(
            "shared customer and worker references cannot cross company identity",
            async () => {
              await assert.rejects(
                tx.savepoint(
                  (sp) =>
                    sp`update public.projects set customer_id=${customer} where id=${foreignProject}`
                ),
                (e) => e.code === "23514"
              );
              await assert.rejects(
                tx.savepoint(
                  (sp) =>
                    sp`insert into public.project_tasks(project_id,title,assigned_worker_id) values (${foreignProject},'[E2E] foreign worker',${worker})`
                ),
                (e) => e.code === "23514"
              );
              await tx`insert into public.project_tasks(project_id,title,assigned_worker_id) values (${project},'[E2E] legal company worker',${worker})`;
            }
          );
          throw rollback;
        }),
        (error) => error === rollback
      );
    } finally {
      await sql.end();
    }
  }
);
