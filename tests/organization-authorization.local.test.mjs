import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// Explicitly opt in: HH_ORG_AUTH_LOCAL_TEST=1 node --test tests/organization-authorization.local.test.mjs
// Removing RLS or replacing a membership predicate with a global role must fail this suite.
test(
  "local organization authorization",
  { skip: process.env.HH_ORG_AUTH_LOCAL_TEST !== "1" },
  async (t) => {
    assert.equal(process.versions.node.split(".")[0], "22", "Use repository Node 22 runtime");
    const localUrl = (value) => {
      const url = new URL(value);
      assert.ok(
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
        "Remote targets refused"
      );
      return value;
    };
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_URL",
      "DATABASE_URL",
      "E2E_BASE_URL",
    ]) {
      if (process.env[key]) localUrl(process.env[key]);
    }
    let status;
    try {
      status = JSON.parse(
        execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      );
    } catch {
      throw new Error("Cannot inspect local Supabase status; start the canonical local stack");
    }
    const apiUrl = localUrl(status.API_URL);
    const sql = postgres(localUrl(status.DB_URL), { max: 1, onnotice: () => {} });
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    };
    const anon = createClient(apiUrl, status.PUBLISHABLE_KEY || status.ANON_KEY, options);
    const admin = createClient(apiUrl, status.SECRET_KEY || status.SERVICE_ROLE_KEY, options);
    const users = [];
    const organizations = [];
    const marker = `[E2E] Org authorization ${randomUUID()}`;
    const owned = new Map();
    const storagePaths = new Set();
    const privilegedStorage = new Map();
    const remember = (table, id = randomUUID()) => {
      if (!owned.has(table)) owned.set(table, []);
      owned.get(table).push(id);
      return id;
    };
    t.after(async () => {
      try {
        // All discovered rows belong to newly-created exact fixture organization IDs.
        if (organizations.length) {
          const docs =
            await sql`select id,file_path from public.documents where organization_id in ${sql(organizations)}`;
          for (const doc of docs) {
            remember("documents", doc.id);
            storagePaths.add(doc.file_path);
          }
        }
        // Discover children only under this run's exact project IDs, including its canonical-company fixture.
        const fixtureProjects = owned.get("projects") ?? [];
        for (const table of ["project_change_orders", "documents"]) {
          const rows =
            await sql`select id from ${sql(table)} where project_id in ${sql(fixtureProjects)}`;
          for (const row of rows) remember(table, row.id);
        }
        for (const [bucket, path] of privilegedStorage) {
          const removed = await admin.storage.from(bucket).remove([path]);
          assert.equal(removed.error, null, "Clean exact privileged receipt fixture");
        }
        if (storagePaths.size) {
          const removed = await admin.storage.from("attachments").remove([...storagePaths]);
          assert.equal(removed.error, null, "Clean exact marked Storage objects");
        }
        for (const table of [
          "project_change_orders",
          "activity_logs",
          "final_punch_list_items",
          "final_punch_lists",
          "completion_certificates",
          "warranties",
          "documents",
          "projects",
        ]) {
          if (owned.has(table))
            await sql`delete from ${sql(table)} where id in ${sql(owned.get(table))}`;
        }
        if (organizations.length) {
          await sql`delete from public.organization_memberships where organization_id in ${sql(organizations)}`;
          await sql`delete from public.organizations where id in ${sql(organizations)}`;
        }
        if (users.length)
          await sql`delete from public.security_audit_events where user_id in ${sql(users)}`;
        for (const id of users) {
          const result = await admin.auth.admin.deleteUser(id);
          assert.equal(result.error, null, "Remove exact test Auth user");
        }
        // Auth audit rows do not cascade when the exact fixture user is deleted.
        await sql`delete from auth.audit_log_entries where payload->>'actor_id' in ${sql(users)} or payload->'traits'->>'user_id' in ${sql(users)}`;
        const [{ n: authAuditResidual }] =
          await sql`select count(*)::int as n from auth.audit_log_entries where payload->>'actor_id' in ${sql(users)} or payload->'traits'->>'user_id' in ${sql(users)}`;
        assert.equal(authAuditResidual, 0, "Auth audit fixture residual");
        let dbResidual = 0;
        for (const [table, ids] of owned) {
          const [{ n }] =
            await sql`select count(*)::int as n from ${sql(table)} where id in ${sql(ids)}`;
          dbResidual += n;
        }
        const [{ n: authResidual }] =
          await sql`select count(*)::int as n from auth.users where id in ${sql(users)}`;
        const [{ n: storageResidual }] =
          await sql`select count(*)::int as n from storage.objects where bucket_id='attachments' and name in ${sql([...storagePaths])}`;
        for (const [bucket, path] of privilegedStorage) {
          const [{ n }] =
            await sql`select count(*)::int as n from storage.objects where bucket_id=${bucket} and name=${path}`;
          assert.equal(n, 0, "Privileged storage fixture residual");
        }
        assert.equal(dbResidual, 0);
        assert.equal(authResidual, 0);
        assert.equal(storageResidual, 0);
        writeFileSync(
          "/tmp/hh-authz-cleanup-result.json",
          JSON.stringify(
            {
              created: {
                organizations: organizations.length,
                auth: users.length,
                trackedDbIds: [...owned.values()].reduce((n, ids) => n + new Set(ids).size, 0),
                trackedStoragePaths: storagePaths.size,
              },
              dbResidual,
              storageResidual,
              authResidual,
              authAuditResidual,
            },
            null,
            2
          )
        );
      } finally {
        await sql.end();
      }
    });
    const project = remember("projects");
    await sql`insert into public.projects(id,name) values (${project},${marker})`;
    const [{ organization_id: legacyOrg }] =
      await sql`select organization_id from public.projects where id=${project}`;
    const initialDocument = remember("documents");
    const fixtures = [
      [
        "documents",
        {
          id: initialDocument,
          project_id: project,
          file_name: marker,
          file_path: `organizations/${legacyOrg}/projects/${project}/documents/${initialDocument}/fixture.txt`,
        },
      ],
    ];
    for (const [table, row] of fixtures) {
      await sql`insert into ${sql(table)} ${sql(row)}`;
      await t.test(`anonymous cannot read ${table}`, async () => {
        const result = await anon.from(table).select("id").eq("id", row.id);
        assert.ok(
          result.error || result.data.length === 0,
          `${table} exposed a marked row to anonymous access`
        );
      });
    }

    const [{ installed }] =
      await sql`select to_regclass('public.organization_memberships') is not null as installed`;
    assert.equal(installed, true, "Organization membership foundation must be installed");
    const orgA = randomUUID();
    const orgB = randomUUID();
    organizations.push(orgA, orgB);
    await sql`insert into public.organizations ${sql([
      { id: orgA, name: marker + " A" },
      { id: orgB, name: marker + " B" },
    ])}`;
    const actors = [];
    for (const [name, globalRole, membershipRole, organizationId, active, read, write] of [
      ["owner", "owner", "owner", orgA, true, true, true],
      ["admin", "admin", "admin", orgA, true, true, true],
      ["assistant", "assistant", "assistant", orgA, true, true, false],
      ["foreign owner", "owner", "owner", orgB, true, false, false],
      ["unassigned owner", "owner", null, null, true, false, false],
      ["inactive owner", "owner", "owner", orgA, false, false, false],
      ["forged metadata", "assistant", null, null, true, false, false],
    ]) {
      const email = `org-auth-${randomUUID()}@example.invalid`;
      const password = `Hh!${randomUUID()}aA1`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: globalRole },
        user_metadata: { role: "owner", organization_id: orgA },
      });
      assert.equal(created.error, null, `Create isolated ${name} identity`);
      users.push(created.data.user.id);
      if (membershipRole)
        await sql`insert into public.organization_memberships(organization_id,user_id,role,status)
      values (${organizationId},${created.data.user.id},${membershipRole},${active ? "active" : "inactive"})`;
      const client = createClient(apiUrl, status.PUBLISHABLE_KEY || status.ANON_KEY, options);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null, `Real Auth sign-in for ${name}`);
      assert.ok(signedIn.data.session?.access_token, "A real user access token is required");
      actors.push({ name, client, id: created.data.user.id, email, password, read, write });
    }
    actors.push({ name: "anonymous", client: anon, read: false, write: false });
    const owner = actors[0];
    const projectA = remember("projects");
    const projectB = remember("projects");
    await sql`insert into public.projects ${sql([
      { id: projectA, name: marker + " A", organization_id: orgA },
      { id: projectB, name: marker + " B", organization_id: orgB },
    ])}`;
    const denied = (result, label) => {
      if (result.error)
        assert.ok(
          ["42501", "23514", "23503"].includes(result.error.code),
          `${label}: unexpected error ${result.error.code}: ${result.error.message}`
        );
      else assert.deepEqual(result.data, [], `${label}: unauthorized rows returned or changed`);
    };
    const permitted = (result, label) => {
      assert.equal(result.error, null, `${label}: ${result.error?.message}`);
      assert.equal(result.data?.length, 1, `${label}: expected exactly one marked row`);
    };
    const resources = [
      ["projects", () => ({ name: marker, organization_id: orgA }), { name: marker + " changed" }],
      [
        "documents",
        (id) => ({
          project_id: projectA,
          organization_id: orgA,
          file_name: marker,
          file_path: `organizations/${orgA}/projects/${projectA}/documents/${id}/fixture.txt`,
        }),
        { notes: marker + " changed" },
      ],
    ];
    for (const actor of actors) {
      for (const [table, payload, changes] of resources) {
        await t.test(`${actor.name}: ${table} SELECT/INSERT/UPDATE/DELETE`, async () => {
          const id = remember(table);
          await sql`insert into ${sql(table)} ${sql({ id, ...payload(id) })}`;
          const readResult = await actor.client.from(table).select("id").eq("id", id);
          (actor.read ? permitted : denied)(readResult, "SELECT");
          const insertId = remember(table);
          const inserted = await actor.client
            .from(table)
            .insert({ id: insertId, ...payload(insertId) })
            .select("id");
          (actor.write ? permitted : denied)(inserted, "INSERT");
          const updated = await actor.client.from(table).update(changes).eq("id", id).select("id");
          (actor.write ? permitted : denied)(updated, "UPDATE");
          const deleted = await actor.client.from(table).delete().eq("id", id).select("id");
          (actor.write ? permitted : denied)(deleted, "DELETE");
        });
      }
    }
    for (const actor of actors) {
      await t.test(
        `${actor.name}: organization and membership administration is trusted-only`,
        async () => {
          const visible = await actor.client.from("organizations").select("id").eq("id", orgA);
          (actor.read ? permitted : denied)(visible, "organization SELECT");
          const membership = await actor.client
            .from("organization_memberships")
            .select("user_id")
            .eq("organization_id", orgA)
            .eq("user_id", actor.id || owner.id);
          (actor.read ? permitted : denied)(membership, "membership SELECT");
          denied(
            await actor.client
              .from("organizations")
              .update({ name: "Forbidden" })
              .eq("id", orgA)
              .select("id"),
            "organization UPDATE"
          );
          denied(
            await actor.client.from("organizations").delete().eq("id", orgA).select("id"),
            "organization DELETE"
          );
          const insertOrg = randomUUID();
          organizations.push(insertOrg);
          denied(
            await actor.client
              .from("organizations")
              .insert({ id: insertOrg, name: marker })
              .select("id"),
            "organization INSERT"
          );
          denied(
            await actor.client
              .from("organization_memberships")
              .update({ role: "owner", status: "active" })
              .eq("organization_id", orgA)
              .eq("user_id", actors[2].id)
              .select("user_id"),
            "membership escalation"
          );
          denied(
            await actor.client
              .from("organization_memberships")
              .insert({ organization_id: orgB, user_id: owner.id, role: "owner", status: "active" })
              .select("user_id"),
            "membership INSERT"
          );
          denied(
            await actor.client
              .from("organization_memberships")
              .delete()
              .eq("organization_id", orgA)
              .eq("user_id", owner.id)
              .select("user_id"),
            "membership DELETE"
          );
        }
      );
    }
    await t.test("owner cannot reparent resources across organizations", async () => {
      for (const [table, payload, foreign] of [
        ["projects", { name: marker, organization_id: orgA }, { organization_id: orgB }],
        [
          "documents",
          {
            project_id: projectA,
            organization_id: orgA,
            file_name: marker,
            file_path: `org-auth/${randomUUID()}`,
          },
          { project_id: projectB },
        ],
      ]) {
        const id = remember(table);
        if (table === "documents")
          payload.file_path = `organizations/${orgA}/projects/${projectA}/documents/${id}/fixture.txt`;
        await sql`insert into ${sql(table)} ${sql({ id, ...payload })}`;
        denied(
          await owner.client.from(table).update(foreign).eq("id", id).select("id"),
          `${table} reparent`
        );
      }
      denied(
        await owner.client
          .from("documents")
          .insert({
            id: remember("documents"),
            organization_id: orgB,
            project_id: projectA,
            file_name: marker,
            file_path: `org-auth/${randomUUID()}`,
          })
          .select("id"),
        "document project/organization mismatch"
      );
    });
    await t.test(
      "organization-level documents are scoped and null-scope documents fail closed",
      async () => {
        const scoped = remember("documents");
        const unscoped = remember("documents");
        await sql`insert into public.documents ${sql({
          id: scoped,
          organization_id: orgA,
          project_id: null,
          file_name: marker,
          file_path: `organizations/${orgA}/documents/${scoped}/fixture.txt`,
        })}`;
        // Model a pre-migration unmapped row; disable only its organization trigger within this fixture transaction.
        await sql.begin(async (fixture) => {
          await fixture`alter table public.documents disable trigger authorization_resource_organization`;
          await fixture`alter table public.documents disable trigger document_object_binding`;
          await fixture`insert into public.documents ${fixture({
            id: unscoped,
            organization_id: null,
            project_id: null,
            file_name: marker,
            file_path: `org-auth/${randomUUID()}`,
          })}`;
          await fixture`alter table public.documents enable trigger authorization_resource_organization`;
          await fixture`alter table public.documents enable trigger document_object_binding`;
        });
        permitted(
          await owner.client.from("documents").select("id").eq("id", scoped),
          "own standalone document"
        );
        denied(
          await actors[3].client.from("documents").select("id").eq("id", scoped),
          "foreign standalone document"
        );
        denied(
          await owner.client.from("documents").select("id").eq("id", unscoped),
          "unscoped document"
        );
        denied(
          await owner.client
            .from("documents")
            .insert({
              id: remember("documents"),
              organization_id: null,
              project_id: null,
              file_name: marker,
              file_path: `org-auth/${randomUUID()}`,
            })
            .select("id"),
          "unscoped document INSERT"
        );
      }
    );
    await t.test(
      "single-membership defaults attribute projects and unassigned users cannot insert",
      async () => {
        const id = remember("projects");
        const inserted = await owner.client
          .from("projects")
          .insert({ id, name: marker })
          .select("id,organization_id");
        permitted(inserted, "default organization");
        assert.equal(inserted.data[0].organization_id, orgA);
        denied(
          await actors[4].client
            .from("projects")
            .insert({ id: remember("projects"), name: marker })
            .select("id"),
          "unassigned default INSERT"
        );
        await sql`insert into public.organization_memberships(organization_id,user_id,role,status) values (${orgB},${owner.id},'owner','active')`;
        try {
          denied(
            await owner.client
              .from("projects")
              .insert({ id: remember("projects"), name: marker })
              .select("id"),
            "ambiguous organization default"
          );
        } finally {
          await sql`delete from public.organization_memberships where organization_id=${orgB} and user_id=${owner.id}`;
        }
      }
    );
    await t.test(
      "dual-organization owner cannot move project children between organizations",
      async (nested) => {
        await sql`insert into public.organization_memberships(organization_id,user_id,role,status) values (${orgB},${owner.id},'admin','active')`;
        try {
          for (const [table, payload, changes] of [
            [
              "documents",
              {
                project_id: projectA,
                organization_id: orgA,
                file_name: marker,
                file_path: `organizations/${orgA}/projects/${projectA}/documents/pending/fixture.txt`,
              },
              { project_id: projectB },
            ],
            [
              "activity_logs",
              { project_id: projectA, type: "test", description: marker },
              { project_id: projectB },
            ],
          ]) {
            await nested.test(`${table}: tenant ownership survives dual membership`, async () => {
              const id = remember(table);
              const row = { id, ...payload };
              if (table === "documents") {
                row.file_path = `organizations/${orgA}/projects/${projectA}/documents/${id}/fixture.txt`;
              }
              await sql`insert into ${sql(table)} ${sql(row)}`;
              denied(
                await owner.client.from(table).update(changes).eq("id", id).select("id"),
                `${table} dual-org reparent`
              );
            });
          }
        } finally {
          await sql`delete from public.organization_memberships where organization_id=${orgB} and user_id=${owner.id}`;
        }
      }
    );
    const finalList = remember("final_punch_lists");
    await sql`insert into public.final_punch_lists(id,project_id) values (${finalList},${projectA})`;
    for (const [table, payload] of [
      ["activity_logs", { project_id: projectA, type: "test", description: marker }],
      ["final_punch_lists", null],
      ["final_punch_list_items", { punch_list_id: finalList, position: 0 }],
      ["completion_certificates", { project_id: projectA }],
      ["warranties", { project_id: projectA }],
    ]) {
      await t.test(
        `${table}: project-scoped reads reject anonymous and foreign owners`,
        async () => {
          const id = payload ? remember(table) : finalList;
          if (payload) await sql`insert into ${sql(table)} ${sql({ id, ...payload })}`;
          permitted(await owner.client.from(table).select("id").eq("id", id), "own project read");
          permitted(
            await actors[2].client.from(table).select("id").eq("id", id),
            "assistant project read"
          );
          denied(await anon.from(table).select("id").eq("id", id), "anonymous project read");
          denied(
            await actors[3].client.from(table).select("id").eq("id", id),
            "foreign owner read"
          );
        }
      );
    }
    await t.test(
      "private attachments enforce real-session upload/read/delete and exact metadata",
      async (nested) => {
        const id = remember("documents");
        const path = `organizations/${orgA}/projects/${projectA}/documents/${id}/fixture.txt`;
        storagePaths.add(path);
        permitted(
          await owner.client
            .from("documents")
            .insert({
              id,
              project_id: projectA,
              organization_id: orgA,
              file_name: marker,
              file_path: path,
            })
            .select("id"),
          "Create attachment metadata"
        );
        const body = new Blob([marker], { type: "text/plain" });
        const upload = await owner.client.storage
          .from("attachments")
          .upload(path, body, { upsert: false });
        assert.equal(upload.error, null, "Owner uploads its metadata-bound private object");
        for (const actor of actors) {
          await nested.test(`${actor.name}: private attachment access`, async () => {
            const read = await actor.client.storage.from("attachments").download(path);
            assert.equal(
              !read.error,
              actor.read,
              `Object read follows current DB membership: ${read.error?.message || "ok"}`
            );
            if (actor.read) assert.equal(await read.data.text(), marker);
            const signed = await actor.client.storage.from("attachments").createSignedUrl(path, 30);
            assert.equal(!signed.error, actor.read, "Signed read follows membership");
            if (actor.read) {
              const response = await fetch(signed.data.signedUrl);
              assert.equal(response.status, 200);
              assert.equal(await response.text(), marker);
            }
            const ownId = remember("documents");
            const ownPath = `organizations/${orgA}/projects/${projectA}/documents/${ownId}/actor.txt`;
            storagePaths.add(ownPath);
            await sql`insert into public.documents ${sql({
              id: ownId,
              project_id: projectA,
              organization_id: orgA,
              file_name: marker,
              file_path: ownPath,
            })}`;
            const write = await actor.client.storage
              .from("attachments")
              .upload(ownPath, body, { upsert: false });
            assert.equal(
              !write.error,
              actor.write,
              "Upload requires owner/admin same organization"
            );
            if (actor.write) {
              const removed = await actor.client.storage.from("attachments").remove([ownPath]);
              assert.equal(removed.error, null);
              assert.equal(removed.data.length, 1);
            } else {
              const removed = await actor.client.storage.from("attachments").remove([path]);
              assert.ok(removed.error || removed.data.length === 0, "Unauthorized delete denied");
            }
          });
        }
        for (const badPath of [
          path.replace(projectA, projectB),
          path.replace(orgA, orgB),
          path.replace(id, randomUUID()),
          path + "/extra",
          `documents/${projectA}/legacy.txt`,
        ]) {
          storagePaths.add(badPath);
          const result = await owner.client.storage
            .from("attachments")
            .upload(badPath, body, { upsert: false });
          assert.ok(
            result.error,
            "Wrong project/org/resource/path or absent metadata upload denied"
          );
        }
        const orphan = await owner.client.from("documents").delete().eq("id", id).select("id");
        assert.ok(orphan.error, "Metadata cannot be deleted before its private object");
        const publicRead = await fetch(`${apiUrl}/storage/v1/object/public/attachments/${path}`);
        assert.ok(!publicRead.ok, "Attachments bucket remains private");
        const removed = await owner.client.storage.from("attachments").remove([path]);
        assert.equal(removed.error, null);
        assert.equal(removed.data.length, 1);
        permitted(
          await owner.client.from("documents").delete().eq("id", id).select("id"),
          "Metadata removed after object"
        );
      }
    );
    await t.test(
      "document metadata and object helper bind exact organization, project and resource",
      async () => {
        const documentId = remember("documents");
        const objectPath = `organizations/${orgA}/projects/${projectA}/documents/${documentId}/fixture.pdf`;
        await sql`insert into public.documents ${sql({ id: documentId, organization_id: orgA, project_id: projectA, file_name: marker, file_path: objectPath })}`;
        const checkObject = async (actor, path) => {
          const session = await actor.client.auth.getSession();
          assert.equal(session.error, null, "Read the already authenticated test session");
          const token = session.data.session?.access_token;
          assert.ok(token, "A real signed-in access token is required for helper checks");
          const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
          return sql.begin(async (request) => {
            await request`set local role authenticated`;
            await request`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
            const [{ allowed }] =
              await request`select private.can_read_project_document_object(${path}) as allowed`;
            return allowed;
          });
        };
        assert.equal(
          await checkObject(owner, objectPath),
          true,
          "Owner reads its exact project document"
        );
        assert.equal(
          await checkObject(actors[2], objectPath),
          true,
          "Assistant member reads its exact project document"
        );
        assert.equal(
          await checkObject(actors[3], objectPath),
          false,
          "Foreign global owner cannot read the object"
        );
        assert.equal(
          await checkObject(actors[4], objectPath),
          false,
          "Unassigned global owner cannot read the object"
        );
        assert.equal(await checkObject(owner, null), false, "Null object path fails closed");
        for (const [name, makePath] of [
          [
            "foreign organization",
            (id) => `organizations/${orgB}/projects/${projectA}/documents/${id}/fixture.pdf`,
          ],
          [
            "foreign project",
            (id) => `organizations/${orgA}/projects/${projectB}/documents/${id}/fixture.pdf`,
          ],
          [
            "foreign resource",
            () =>
              `organizations/${orgA}/projects/${projectA}/documents/${randomUUID()}/fixture.pdf`,
          ],
          [
            "malformed organization UUID",
            (id) => `organizations/not-a-uuid/projects/${projectA}/documents/${id}/fixture.pdf`,
          ],
          ["empty filename", (id) => `organizations/${orgA}/projects/${projectA}/documents/${id}/`],
          [
            "extra path segment",
            (id) => `organizations/${orgA}/projects/${projectA}/documents/${id}/extra/fixture.pdf`,
          ],
        ]) {
          const id = remember("documents");
          const path = makePath(id);
          await assert.rejects(
            sql`insert into public.documents ${sql({ id, organization_id: orgA, project_id: projectA, file_name: marker, file_path: path })}`,
            (error) => error.code === "23514",
            `${name}: invalid metadata rejected before upload`
          );
          assert.equal(
            await checkObject(owner, path),
            false,
            `${name} fails closed despite matching metadata`
          );
        }
      }
    );
    await t.test(
      "project commission receipt buckets permit only guarded server access",
      async () => {
        for (const bucket of ["commission-receipts", "commission-payment-receipts"]) {
          const path = `commission-payments/${randomUUID()}/${randomUUID()}.pdf`;
          privilegedStorage.set(bucket, path);
          const uploaded = await admin.storage
            .from(bucket)
            .upload(path, new Blob([marker], { type: "application/pdf" }), { upsert: false });
          assert.equal(uploaded.error, null, "Create isolated privileged receipt fixture");
          for (const actor of actors) {
            const read = await actor.client.storage.from(bucket).download(path);
            assert.ok(
              read.error,
              `${actor.name} cannot bypass the authorized receipt server route`
            );
            const signed = await actor.client.storage.from(bucket).createSignedUrl(path, 30);
            assert.ok(signed.error, "Direct receipt signing is denied");
          }
          const publicRead = await fetch(`${apiUrl}/storage/v1/object/public/${bucket}/${path}`);
          assert.ok(!publicRead.ok, "Receipt bucket must be private");
        }
      }
    );
    if (process.env.HH_ORG_AUTH_HTTP === "1") {
      await t.test(
        "company assistant receipt intake succeeds; foreign and anonymous fail before storage",
        async () => {
          const baseURL = localUrl(process.env.E2E_BASE_URL || "http://localhost:3000");
          const assistant = actors[2];
          const workerId = randomUUID();
          let receiptPath;
          await sql`insert into public.workers(id,name) values (${workerId},${marker})`;
          await sql`insert into public.organization_memberships(organization_id,user_id,role,status) values (${legacyOrg},${assistant.id},'assistant','active')`;
          try {
            for (const actor of [actors[3], actors.at(-1)]) {
              const session = await actor.client.auth.getSession();
              const headers = {
                Origin: baseURL,
                ...(session.data.session
                  ? { Authorization: `Bearer ${session.data.session.access_token}` }
                  : {}),
              };
              for (const endpoint of ["upload", "submit"]) {
                const denied = await fetch(`${baseURL}/api/upload-receipt/${endpoint}`, {
                  method: "POST",
                  headers,
                  body: "{}",
                  redirect: "manual",
                });
                assert.equal(
                  denied.status,
                  actor.name === "anonymous" ? 401 : 403,
                  `${actor.name} ${endpoint} denied at authorization boundary`
                );
              }
            }
            const {
              data: { session },
            } = await assistant.client.auth.getSession();
            const headers = { Origin: baseURL, Authorization: `Bearer ${session.access_token}` };
            const form = new FormData();
            form.set(
              "file",
              new Blob(["%PDF-1.4 local intake fixture"], { type: "application/pdf" }),
              "receipt.pdf"
            );
            const uploaded = await fetch(`${baseURL}/api/upload-receipt/upload`, {
              method: "POST",
              headers,
              body: form,
            });
            const upload = await uploaded.json();
            assert.equal(uploaded.status, 200, JSON.stringify(upload));
            receiptPath = upload.path;
            const submitted = await fetch(`${baseURL}/api/upload-receipt/submit`, {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                workerId,
                workerName: marker,
                projectId: project,
                amount: 12.34,
                receiptUrl: receiptPath,
                expenseType: "Other",
                receiptDate: "2026-09-06",
              }),
            });
            assert.equal(submitted.status, 200, await submitted.text());
            const [receipt] =
              await sql`select worker_id,project_id,amount,status from public.worker_receipts where receipt_url=${receiptPath}`;
            assert.equal(receipt.worker_id, workerId);
            assert.equal(receipt.project_id, project);
            assert.equal(Number(receipt.amount), 12.34);
            assert.equal(receipt.status, "Pending");
            for (const bucket of ["payment-attachments", "expense-attachments", "receipts"]) {
              const existingPath = `receipts/${randomUUID()}.png`;
              const deniedPath = `receipts/${randomUUID()}.png`;
              const image = Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
                "base64"
              );
              try {
                const upload = await admin.storage
                  .from(bucket)
                  .upload(existingPath, image, { contentType: "image/png", upsert: false });
                assert.equal(upload.error, null, `${bucket} exact financial Storage fixture`);
                assert.ok(
                  (await assistant.client.storage.from(bucket).download(existingPath)).error,
                  `Company assistant cannot read ${bucket}`
                );
                assert.ok(
                  (await assistant.client.storage.from(bucket).createSignedUrl(existingPath, 30))
                    .error,
                  `Company assistant cannot sign ${bucket}`
                );
                assert.ok(
                  (
                    await assistant.client.storage
                      .from(bucket)
                      .upload(deniedPath, image, { contentType: "image/png", upsert: false })
                  ).error,
                  `Company assistant cannot upload ${bucket}`
                );
                assert.ok(
                  (
                    await assistant.client.storage
                      .from(bucket)
                      .update(existingPath, image, { contentType: "image/png" })
                  ).error,
                  `Company assistant cannot replace ${bucket}`
                );
                const removed = await assistant.client.storage.from(bucket).remove([existingPath]);
                assert.ok(
                  removed.error || removed.data?.length === 0,
                  `Company assistant cannot delete ${bucket}`
                );
                const preserved = await admin.storage.from(bucket).download(existingPath);
                assert.equal(preserved.error, null);
                assert.deepEqual(Buffer.from(await preserved.data.arrayBuffer()), image);
              } finally {
                assert.equal(
                  (await admin.storage.from(bucket).remove([existingPath, deniedPath])).error,
                  null
                );
                const [{ n }] =
                  await sql`select count(*)::int n from storage.objects where bucket_id=${bucket} and name in ${sql([existingPath, deniedPath])}`;
                assert.equal(n, 0, `${bucket} exact Storage fixture cleanup`);
              }
            }
            const review = await fetch(`${baseURL}/api/worker-receipts`, { headers });
            assert.equal(review.status, 403, "Assistant intake does not grant receipt review");
          } finally {
            if (receiptPath) {
              await sql`delete from public.worker_receipts where receipt_url=${receiptPath}`;
              const removed = await admin.storage.from("worker-receipts").remove([receiptPath]);
              assert.equal(removed.error, null);
              const [{ n }] =
                await sql`select count(*)::int n from storage.objects where bucket_id='worker-receipts' and name=${receiptPath}`;
              assert.equal(n, 0, "Intake storage cleanup exact and complete");
            }
            await sql`delete from public.organization_memberships where organization_id=${legacyOrg} and user_id=${assistant.id}`;
            await sql`delete from public.workers where id=${workerId}`;
            await sql`delete from public.labor_workers where id=${workerId}`;
            const [{ workerRows, projectionRows, receiptRows, objectRows }] =
              await sql`select (select count(*)::int from public.workers where id=${workerId}) "workerRows",(select count(*)::int from public.labor_workers where id=${workerId}) "projectionRows",(select count(*)::int from public.worker_receipts where worker_id=${workerId}) "receiptRows",(select count(*)::int from storage.objects where bucket_id='worker-receipts' and name=${receiptPath ?? null}) "objectRows"`;
            assert.deepEqual(
              { workerRows, projectionRows, receiptRows, objectRows },
              { workerRows: 0, projectionRows: 0, receiptRows: 0, objectRows: 0 },
              "Exact receipt intake fixture including internal projection is clean"
            );
            writeFileSync(
              "/tmp/hh-receipt-intake-cleanup-result.json",
              JSON.stringify(
                {
                  workerId,
                  receiptPath,
                  created: {
                    workers: 1,
                    workerProjections: 1,
                    receipts: receiptPath ? 1 : 0,
                    storageObjects: receiptPath ? 1 : 0,
                  },
                  workerRows,
                  projectionRows,
                  receiptRows,
                  objectRows,
                },
                null,
                2
              )
            );
          }
        }
      );
    }
    if (process.env.HH_ORG_AUTH_E2E === "1") {
      const { verifyOrganizationWorkflows } = await import("./organization-workflows.local.mjs");
      // Canonical-company authority is introduced only for browser coverage; project-only tests above remain independent.
      await sql`insert into public.organization_memberships(organization_id,user_id,role,status) values (${legacyOrg},${owner.id},'owner','active')`;
      try {
        await verifyOrganizationWorkflows({
          actors,
          projectA,
          projectCompany: project,
          remember,
          storagePaths,
          marker,
          sql,
          t,
        });
      } finally {
        await sql`delete from public.organization_memberships where organization_id=${legacyOrg} and user_id=${owner.id}`;
      }
    }
    await t.test(
      "membership revocation immediately removes project and child access with the same Auth session",
      async () => {
        permitted(
          await owner.client.from("projects").select("id").eq("id", projectA),
          "before revocation"
        );
        await sql`update public.organization_memberships set status='inactive' where organization_id=${orgA} and user_id=${owner.id}`;
        try {
          denied(
            await owner.client.from("projects").select("id").eq("id", projectA),
            "revoked project read"
          );
          denied(
            await owner.client.from("documents").select("id").eq("project_id", projectA),
            "revoked child read"
          );
          denied(
            await owner.client
              .from("documents")
              .insert({
                id: remember("documents"),
                organization_id: orgA,
                project_id: projectA,
                file_name: marker,
                file_path: `organizations/${orgA}/projects/${projectA}/documents/${randomUUID()}/fixture.txt`,
              })
              .select("id"),
            "revoked INSERT"
          );
        } finally {
          await sql`update public.organization_memberships set status='active' where organization_id=${orgA} and user_id=${owner.id}`;
        }
      }
    );
    await t.test(
      "migration replay neither grants unassigned owners nor reactivates revoked memberships",
      async () => {
        const before =
          await sql`select organization_id,user_id,role,status from public.organization_memberships order by organization_id,user_id`;
        const rollback = new Error("Rollback isolated authorization replay fixture");
        const migration = readFileSync(
          new URL(
            "../supabase/migrations/20260906091106_organization_project_authorization_foundation.sql",
            import.meta.url
          ),
          "utf8"
        );
        let caught;
        try {
          await sql.begin(async (transaction) => {
            await transaction`update public.organization_memberships set status='inactive' where organization_id=${orgA} and user_id=${owner.id}`;
            await transaction.unsafe(migration);
            const [revoked] =
              await transaction`select status from public.organization_memberships where organization_id=${orgA} and user_id=${owner.id}`;
            assert.equal(revoked.status, "inactive", "Replay must preserve revocation");
            const [{ memberships }] =
              await transaction`select count(*)::int as memberships from public.organization_memberships where user_id=${actors[4].id}`;
            assert.equal(
              memberships,
              0,
              "Replay must not bootstrap a newly created unassigned global owner"
            );
            throw rollback;
          });
        } catch (error) {
          caught = error;
        }
        assert.equal(caught, rollback, "Only the intentional rollback sentinel is acceptable");
        const after =
          await sql`select organization_id,user_id,role,status from public.organization_memberships order by organization_id,user_id`;
        assert.deepEqual(
          after,
          before,
          "Membership rows and count must survive replay verification unchanged"
        );
      }
    );
  }
);
