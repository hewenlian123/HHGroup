import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

test(
  "material image references cannot claim another organization's object",
  { skip: process.env.HH_ORG_AUTH_LOCAL_TEST !== "1" },
  async (t) => {
    const local = (value) => {
      assert.ok(
        ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
        "Local target required"
      );
      return value;
    };
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "DATABASE_URL", "E2E_BASE_URL"])
      if (process.env[key]) local(process.env[key]);
    const status = JSON.parse(
      execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    };
    const admin = createClient(
      local(status.API_URL),
      status.SECRET_KEY || status.SERVICE_ROLE_KEY,
      options
    );
    const sql = postgres(local(status.DB_URL), { max: 1, onnotice: () => {} });
    const orgA = randomUUID(),
      orgB = randomUUID(),
      docA = randomUUID(),
      docB = randomUUID(),
      sheet = randomUUID();
    const marker = `[E2E] Material binding ${randomUUID()}`;
    const paths = {
      a: `organizations/${orgA}/documents/${docA}/image.png`,
      b: `organizations/${orgB}/documents/${docB}/image.png`,
    };
    const createdIds = { material_catalog: [], material_selection_items: [] };
    let userId;
    t.after(async () => {
      try {
        for (const [table, ids] of Object.entries(createdIds))
          if (ids.length) await sql`delete from ${sql(table)} where id in ${sql(ids)}`;
        await sql`delete from public.material_selections where id=${sheet}`;
        await sql`delete from public.documents where id in ${sql([docA, docB])}`;
        await sql`delete from public.organization_memberships where organization_id in ${sql([orgA, orgB])}`;
        await sql`delete from public.organizations where id in ${sql([orgA, orgB])}`;
        if (userId) {
          await sql`delete from public.security_audit_events where user_id=${userId}`;
          assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
          await sql`delete from auth.audit_log_entries where payload->>'actor_id'=${userId} or payload->'traits'->>'user_id'=${userId}`;
          const [{ n }] =
            await sql`select count(*)::int as n from auth.audit_log_entries where payload->>'actor_id'=${userId} or payload->'traits'->>'user_id'=${userId}`;
          assert.equal(n, 0, "Exact image Auth audit fixture residual");
        }
        let dbResidual = 0;
        for (const [table, ids] of Object.entries({
          ...createdIds,
          documents: [docA, docB],
          material_selections: [sheet],
          organizations: [orgA, orgB],
        })) {
          const [{ n }] =
            await sql`select count(*)::int n from ${sql(table)} where id in ${sql(ids)}`;
          dbResidual += n;
        }
        const [{ authResidual }] =
          await sql`select count(*)::int "authResidual" from auth.users where id=${userId ?? null}`;
        const [{ storageResidual }] =
          await sql`select count(*)::int "storageResidual" from storage.objects where bucket_id='attachments' and name in ${sql(Object.values(paths))}`;
        const [{ membershipResidual }] =
          await sql`select count(*)::int "membershipResidual" from public.organization_memberships where organization_id in ${sql([orgA, orgB])}`;
        assert.equal(dbResidual, 0);
        assert.equal(authResidual, 0);
        assert.equal(storageResidual, 0);
        assert.equal(membershipResidual, 0);
        writeFileSync(
          "/tmp/hh-material-image-cleanup-result.json",
          JSON.stringify(
            {
              dbResidual,
              authResidual,
              storageResidual,
              membershipResidual,
              created: {
                organizations: 2,
                auth: userId ? 1 : 0,
                documents: 2,
                materialSelections: 1,
                trackedMaterialIds: Object.values(createdIds).reduce((n, ids) => n + ids.length, 0),
                storageObjects: 0,
              },
            },
            null,
            2
          )
        );
      } finally {
        await sql.end();
      }
    });
    await sql`insert into public.organizations(id,name) values (${orgA},${marker}),(${orgB},${marker})`;
    const email = `image-binding-${randomUUID()}@example.invalid`,
      password = `Aa1!${randomUUID()}`;
    const user = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "owner" },
    });
    assert.equal(user.error, null);
    userId = user.data.user.id;
    await sql`insert into public.organization_memberships(organization_id,user_id,role) values (${orgA},${userId},'owner')`;
    await sql`insert into public.documents(id,organization_id,file_name,file_path,file_type) values (${docA},${orgA},${marker},${paths.a},'Photo'),(${docB},${orgB},${marker},${paths.b},'Photo')`;
    await sql`insert into public.material_selections(id,organization_id,title) values (${sheet},${orgA},${marker})`;
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, options);
    assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
    for (const table of Object.keys(createdIds)) {
      for (const [name, path, allow] of [
        ["same organization", paths.a, true],
        ["foreign organization", paths.b, false],
        ["new legacy object claim", "selections/unknown.png", false],
      ]) {
        await t.test(`${table}: ${name}`, async () => {
          const id = randomUUID();
          createdIds[table].push(id);
          const payload =
            table === "material_catalog"
              ? { id, organization_id: orgA, material_name: marker, photo_url: path }
              : {
                  id,
                  selection_id: sheet,
                  item_name: marker,
                  image_url: `/api/materials/photo?path=${encodeURIComponent(path)}`,
                };
          const result = await client.from(table).insert(payload).select("id");
          if (allow) {
            assert.equal(result.error, null);
            assert.equal(result.data?.length, 1);
          } else
            assert.ok(
              result.error || result.data?.length === 0,
              "Forbidden image reference was accepted"
            );
        });
      }
    }
  }
);
