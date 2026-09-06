import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// HH_AR_SETTLEMENT_LOCAL_TEST=1 node --test tests/ar-settlement-integrity.local.test.mjs
test(
  "local AR settlement integrity",
  { skip: process.env.HH_AR_SETTLEMENT_LOCAL_TEST !== "1" },
  async (t) => {
    assert.equal(process.versions.node.split(".")[0], "22", "Use repository Node 22");
    const localUrl = (value) => {
      assert.ok(
        ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname),
        "Remote targets refused"
      );
      return value;
    };
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "DATABASE_URL", "E2E_BASE_URL"])
      if (process.env[name]) localUrl(process.env[name]);
    const status = JSON.parse(
      execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
    const apiUrl = localUrl(status.API_URL);
    const sql = postgres(localUrl(status.DB_URL), { max: 1, onnotice: () => {} });
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    };
    const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
    const admin = createClient(apiUrl, status.SECRET_KEY || status.SERVICE_ROLE_KEY, options);
    const anon = createClient(apiUrl, key, options);
    const scope = process.env.HH_AR_SETTLEMENT_SCOPE || "all";
    assert.ok(["all", "ar-ap-ui", "estimate"].includes(scope));
    const marker = `[E2E] AR settlement ${randomUUID()}`;
    const users = [],
      organizations = [],
      projects = [],
      customers = [],
      invoiceIds = [],
      billIds = [],
      estimateIds = [];
    const triggers = new Map();
    const storagePaths = new Set();

    t.after(async () => {
      try {
        for (const [name, table] of triggers) {
          await sql.unsafe(`drop trigger if exists "${name}" on public."${table}"`);
          await sql.unsafe(`drop function if exists public."${name}"()`);
        }
        if (estimateIds.length) {
          const linkedProjects =
            await sql`select id from public.projects where source_estimate_id in ${sql(estimateIds)}`;
          for (const { id } of linkedProjects) if (!projects.includes(id)) projects.push(id);
          const linkedInvoices =
            await sql`select invoice_id as id from public.estimate_payment_schedule_items where estimate_id in ${sql(estimateIds)} and invoice_id is not null`;
          for (const { id } of linkedInvoices) if (!invoiceIds.includes(id)) invoiceIds.push(id);
        }
        if (billIds.length) {
          await sql`delete from public.ap_bill_payments where bill_id in ${sql(billIds)}`;
          await sql`delete from public.ap_bills where id in ${sql(billIds)}`;
          const [{ count }] =
            await sql`select count(*)::int as count from public.ap_bill_payments where bill_id in ${sql(billIds)}`;
          assert.equal(count, 0, "AP payment fixture residual is zero");
        }
        if (invoiceIds.length) {
          await sql`delete from public.payment_received_attachments where payment_id in (select id from public.payments_received where invoice_id in ${sql(invoiceIds)})`;
          if (storagePaths.size) {
            const removed = await admin.storage
              .from("payment-attachments")
              .remove([...storagePaths]);
            assert.equal(
              removed.error,
              null,
              "Remove exact fixture Storage objects after attachment metadata"
            );
            const [{ count }] =
              await sql`select count(*)::int as count from storage.objects where bucket_id='payment-attachments' and name in ${sql([...storagePaths])}`;
            assert.equal(count, 0, "Exact payment attachment Storage cleanup");
          }
          await sql`delete from public.invoice_payments where invoice_id in ${sql(invoiceIds)}`;
          await sql`delete from public.deposits where invoice_id in ${sql(invoiceIds)}`;
          await sql`delete from public.payments_received where invoice_id in ${sql(invoiceIds)}`;
          await sql`delete from public.invoice_items where invoice_id in ${sql(invoiceIds)}`;
          await sql`delete from public.invoices where id in ${sql(invoiceIds)}`;
          for (const table of [
            "invoice_payments",
            "deposits",
            "payments_received",
            "invoice_items",
          ]) {
            const [{ count }] =
              await sql`select count(*)::int as count from ${sql(table)} where invoice_id in ${sql(invoiceIds)}`;
            assert.equal(count, 0, `${table}: exact invoice fixture cleanup`);
          }
        }
        if (projects.length) await sql`delete from public.projects where id in ${sql(projects)}`;
        if (estimateIds.length) {
          await sql`delete from public.estimate_snapshots where estimate_id in ${sql(estimateIds)}`;
          await sql`delete from public.estimates where id in ${sql(estimateIds)}`;
          for (const table of [
            "estimate_meta",
            "estimate_items",
            "estimate_categories",
            "estimate_payment_schedule_items",
            "estimate_activity_events",
            "estimate_snapshots",
          ]) {
            const [{ count }] =
              await sql`select count(*)::int count from ${sql(table)} where estimate_id in ${sql(estimateIds)}`;
            assert.equal(count, 0, `${table}: exact conversion fixture cleanup`);
          }
        }
        if (customers.length) await sql`delete from public.customers where id in ${sql(customers)}`;
        if (organizations.length) {
          await sql`delete from public.organization_memberships where organization_id in ${sql(organizations)}`;
          await sql`delete from public.organizations where id in ${sql(organizations)}`;
        }
        if (users.length) {
          await sql`delete from public.security_audit_events where user_id in ${sql(users)}`;
          for (const id of users) {
            const removed = await admin.auth.admin.deleteUser(id);
            assert.equal(removed.error, null, "Delete exact fixture Auth user");
          }
          await sql`delete from auth.audit_log_entries where payload->>'actor_id' in ${sql(users)} or payload->'traits'->>'user_id' in ${sql(users)}`;
          const [{ count }] =
            await sql`select count(*)::int as count from auth.audit_log_entries where payload->>'actor_id' in ${sql(users)} or payload->'traits'->>'user_id' in ${sql(users)}`;
          assert.equal(count, 0, "Exact Auth audit cleanup");
          const [{ count: remaining }] =
            await sql`select count(*)::int as count from auth.users where id in ${sql(users)}`;
          assert.equal(remaining, 0, "Exact Auth user cleanup");
        }
        for (const [table, ids] of [
          ["invoices", invoiceIds],
          ["projects", projects],
          ["customers", customers],
          ["organizations", organizations],
        ]) {
          if (!ids.length) continue;
          const [{ count }] =
            await sql`select count(*)::int as count from ${sql(table)} where id in ${sql(ids)}`;
          assert.equal(count, 0, `${table}: zero exact fixture residuals`);
        }
      } finally {
        await sql.end();
      }
    });

    const [company] =
      await sql`select o.id from public.organizations o join public.company_profile c on c.id=o.legacy_company_profile_id`;
    assert.ok(company, "Canonical company organization exists");
    const orgA = company.id,
      orgB = randomUUID();
    organizations.push(orgB);
    await sql`insert into public.organizations(id,name) values(${orgB},${marker + " B"})`;
    const customerA = randomUUID(),
      customerB = randomUUID();
    customers.push(customerA, customerB);
    await sql`insert into public.customers ${sql([
      { id: customerA, name: marker + " Customer A" },
      { id: customerB, name: marker + " Customer B" },
    ])}`;
    const projectA = randomUUID(),
      projectA2 = randomUUID(),
      projectB = randomUUID();
    projects.push(projectA, projectA2, projectB);
    await sql`insert into public.projects ${sql([
      { id: projectA, name: marker + " Project A", organization_id: orgA },
      { id: projectA2, name: marker + " Project A2", organization_id: orgA },
      { id: projectB, name: marker + " Project B", organization_id: orgB },
    ])}`;
    const actors = {};
    for (const [name, role, org, membership, membershipStatus] of [
      ["owner", "owner", orgA, "owner", "active"],
      ["admin", "admin", orgA, "admin", "active"],
      ["foreign", "owner", orgB, "owner", "active"],
      ["assistant", "assistant", orgA, "assistant", "active"],
      ["inactive", "owner", orgA, "owner", "inactive"],
      ["unassigned", "owner", null, null, null],
    ]) {
      const email = `ar-settlement-${randomUUID()}@example.invalid`,
        password = `Hh!${randomUUID()}aA1`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
        user_metadata: { role: "owner", organization_id: orgA },
      });
      assert.equal(created.error, null, `Create ${name}`);
      const id = created.data.user.id;
      users.push(id);
      if (org)
        await sql`insert into public.organization_memberships(organization_id,user_id,role,status) values (${org},${id},${membership},${membershipStatus})`;
      const client = createClient(apiUrl, key, options);
      const signed = await client.auth.signInWithPassword({ email, password });
      assert.equal(signed.error, null, `Real ${name} Auth session`);
      assert.ok(signed.data.session?.access_token);
      actors[name] = { client, id, email, password };
    }
    const seedEstimate = async (label, state = "Draft") => {
      const id = randomUUID(),
        scheduleId = randomUUID(),
        name = marker + " " + label;
      estimateIds.push(id);
      await sql`insert into public.estimates(id,number,client,project,status,customer_id) values(${id},${name},${marker + " Customer A"},${name},${state},${customerA})`;
      await sql`insert into public.estimate_meta(estimate_id,client_name,project_name,tax,discount,overhead_pct,profit_pct) values(${id},${marker + " Customer A"},${name},0,0,0,0)`;
      await sql`insert into public.estimate_categories(estimate_id,cost_code,display_name) values(${id},'010000','General Conditions')`;
      await sql`insert into public.estimate_items(estimate_id,cost_code,"desc",qty,unit,unit_cost,markup_pct,sort_order,status) values(${id},'010000',${name},1,'EA',100,0,0,'included')`;
      await sql`insert into public.estimate_payment_schedule_items(id,estimate_id,title,amount,status,sort_order) values(${scheduleId},${id},'Contract milestone',100,'draft',0)`;
      return { id, scheduleId, name, customerId: customerA };
    };
    if (scope !== "ar-ap-ui")
      await t.test(
        "concurrent Estimate conversion and lost-response retry create exactly one project",
        async () => {
          const estimate = await seedEstimate("concurrent conversion", "Approved");
          const payload = {
            p_estimate_id: estimate.id,
            p_project: {
              name: estimate.name,
              budget: 100,
              snapshotRevenue: 100,
              snapshotBudgetCost: 100,
              snapshotBreakdown: { materials: 0, labor: 100, vendor: 0, other: 0 },
            },
            p_actor_user_id: actors.owner.id,
            p_actor_label: actors.owner.email,
          };
          const results = await Promise.all([
            admin.rpc("convert_estimate_to_project_atomic", payload),
            admin.rpc("convert_estimate_to_project_atomic", payload),
          ]);
          for (const result of results) assert.equal(result.error, null);
          assert.deepEqual(results[0].data, results[1].data);
          const retry = await admin.rpc("convert_estimate_to_project_atomic", {
            ...payload,
            p_project: {},
          });
          assert.equal(retry.error, null);
          assert.deepEqual(retry.data, results[0].data);
          const rows =
            await sql`select id,customer_id,budget,snapshot_revenue,snapshot_budget_cost from public.projects where source_estimate_id=${estimate.id}`;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].customer_id, customerA);
          assert.equal(Number(rows[0].budget), 100);
          assert.equal(Number(rows[0].snapshot_revenue), 100);
          assert.equal(Number(rows[0].snapshot_budget_cost), 100);
          const [{ count }] =
            await sql`select count(*)::int count from public.estimate_activity_events where estimate_id=${estimate.id} and event_type='converted_to_project'`;
          assert.equal(count, 1);
        }
      );
    const [{ has_org }] =
      await sql`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='organization_id') as has_org`;
    const invoice = async (label, overrides = {}) => {
      const row = {
        id: randomUUID(),
        invoice_no: `${marker} ${label}`,
        project_id: projectA,
        customer_id: customerA,
        client_name: marker + " Customer A",
        issue_date: "2026-09-06",
        due_date: "2026-12-31",
        status: "Sent",
        subtotal: 10000,
        total: 10000,
        paid_total: 0,
        balance_due: 10000,
        ...overrides,
      };
      if (has_org) row.organization_id = row.project_id === projectB ? orgB : orgA;
      invoiceIds.push(row.id);
      await sql`insert into public.invoices ${sql(row)}`;
      return { ...row, customer_name: row.client_name };
    };
    const args = (inv, amount, idempotency = randomUUID(), extra = {}) => ({
      p_idempotency_key: `${marker}:${idempotency}`,
      p_invoice_id: inv.id,
      p_project_id: inv.project_id,
      p_customer_name: inv.client_name,
      p_customer_id: inv.customer_id ?? null,
      p_payment_date: "2026-09-06",
      p_amount: amount,
      p_payment_method: "ACH",
      p_deposit_account: "Test operating",
      p_notes: marker,
      p_attachment_url: null,
      p_attachments: [],
      ...extra,
    });
    const record = (payload, actor = actors.owner) =>
      actor.client.rpc("record_invoice_receipt_atomic", payload);
    const success = (result) => {
      assert.equal(result.error, null, result.error?.message);
      const data = Array.isArray(result.data) ? result.data[0] : result.data;
      assert.ok(data?.payment_id, "Committed payment identity returned");
      return data;
    };
    const denied = (result, allowed = ["42501", "23514", "23503", "22023", "P0002"]) => {
      assert.ok(result.error, "Operation must reject");
      assert.ok(
        allowed.includes(result.error.code),
        `Expected integrity/authorization rejection, got ${result.error.code}: ${result.error.message}`
      );
    };
    const snapshot = async (id) => {
      const [inv] = await sql`select to_jsonb(i) as row from public.invoices i where id=${id}`;
      const payments =
        await sql`select to_jsonb(p) as row from public.payments_received p where invoice_id=${id} order by id`;
      const deposits =
        await sql`select to_jsonb(d) as row from public.deposits d where invoice_id=${id} order by id`;
      const allocations =
        await sql`select to_jsonb(a) as row from public.invoice_payments a where invoice_id=${id} order by id`;
      const attachments =
        await sql`select to_jsonb(a) as row from public.payment_received_attachments a where payment_id in (select id from public.payments_received where invoice_id=${id}) order by id`;
      return JSON.parse(
        JSON.stringify({ invoice: inv?.row ?? null, payments, deposits, allocations, attachments })
      );
    };
    const rejectedUnchanged = async (inv, payload, actor = actors.owner, codes) => {
      const before = await snapshot(inv.id);
      denied(await record(payload, actor), codes);
      assert.deepEqual(await snapshot(inv.id), before, "Rejected intent changes no financial rows");
    };
    const settlement = async (inv, paid, remaining, expectedStatus, count) => {
      const snap = await snapshot(inv.id);
      assert.equal(Number(snap.invoice.total), 10000);
      assert.equal(Number(snap.invoice.paid_total), paid);
      assert.equal(Number(snap.invoice.balance_due), remaining);
      assert.equal(snap.invoice.status, expectedStatus);
      assert.equal(snap.payments.length, count);
      assert.equal(snap.deposits.length, count);
      assert.equal(snap.allocations.length, count);
      assert.equal(
        snap.payments.reduce((n, p) => n + Number(p.row.amount), 0),
        paid
      );
      assert.equal(
        snap.deposits.reduce((n, p) => n + Number(p.row.amount), 0),
        paid
      );
      assert.equal(
        snap.allocations.reduce((n, p) => n + Number(p.row.amount), 0),
        paid
      );
      for (const { row: p } of snap.payments) {
        assert.equal(p.invoice_id, inv.id);
        assert.equal(p.project_id, inv.project_id);
        assert.equal(p.customer_id, inv.customer_id, "Receipt retains authoritative customer id");
        const deposits = snap.deposits.filter(({ row: d }) => d.payment_id === p.id);
        const allocations = snap.allocations.filter(({ row: a }) => a.payment_received_id === p.id);
        assert.equal(deposits.length, 1);
        assert.equal(allocations.length, 1);
        assert.equal(deposits[0].row.invoice_id, inv.id);
        assert.equal(deposits[0].row.project_id, inv.project_id);
        assert.equal(allocations[0].row.invoice_id, inv.id);
      }
    };

    if (scope === "all") {
      await t.test("partial 3000, retry, and final 7000 settle 10000 exactly once", async () => {
        const inv = await invoice("partial-final"),
          payload = args(inv, 3000);
        const first = success(await record(payload));
        await settlement(inv, 3000, 7000, "Partially Paid", 1);
        const beforeRetry = await snapshot(inv.id);
        assert.equal(success(await record(payload)).payment_id, first.payment_id);
        assert.deepEqual(
          await snapshot(inv.id),
          beforeRetry,
          "Retry does not alter header or ledger"
        );
        await rejectedUnchanged(inv, { ...payload, p_amount: 3001 }, actors.owner, [
          "23505",
          "22023",
        ]);
        success(await record(args(inv, 7000), actors.admin));
        await settlement(inv, 10000, 0, "Paid", 2);
        await rejectedUnchanged(inv, args(inv, 0.01));
      });
      for (const [label, amount] of [
        ["zero", 0],
        ["negative", -1],
        ["sub-cent payment", 0.004],
        // Strings preserve PostgreSQL numeric non-finite values across JSON transport.
        ["NaN payment", "NaN"],
        ["positive infinite payment", "Infinity"],
        ["negative infinite payment", "-Infinity"],
        ["overpayment", 10000.01],
      ]) {
        await t.test(`${label} rejects without ledger changes`, async () => {
          const inv = await invoice(label);
          await rejectedUnchanged(inv, args(inv, amount));
        });
      }
      for (const state of ["Draft", "Void"]) {
        await t.test(`${state} invoice is not collectible`, async () => {
          const inv = await invoice(state, { status: state });
          await rejectedUnchanged(inv, args(inv, 3000));
        });
      }
      await t.test("missing invoice rejects", async () => {
        const inv = { id: randomUUID(), project_id: projectA, client_name: marker };
        invoiceIds.push(inv.id);
        await rejectedUnchanged(inv, args(inv, 3000));
      });
      for (const [label, extra] of [
        ["wrong project", { p_project_id: projectA2 }],
        ["foreign project", { p_project_id: projectB }],
        ["wrong customer", { p_customer_id: customerB }],
        ["wrong customer name", { p_customer_name: marker + " Customer B" }],
      ]) {
        await t.test(`${label} cannot change invoice ownership`, async () => {
          const inv = await invoice(label);
          await rejectedUnchanged(inv, args(inv, 3000, randomUUID(), extra));
        });
      }
      await t.test("explicit matching customer succeeds", async () => {
        const inv = await invoice("matching-customer");
        success(await record(args(inv, 3000, randomUUID(), { p_customer_id: customerA })));
        await settlement(inv, 3000, 7000, "Partially Paid", 1);
      });
      for (const name of ["foreign", "assistant", "inactive", "unassigned", "anonymous"]) {
        await t.test(`${name} cannot read or settle another authorized invoice`, async () => {
          const inv = await invoice(name),
            actor = name === "anonymous" ? { client: anon } : actors[name];
          const result = await actor.client.from("invoices").select("id").eq("id", inv.id);
          if (result.error) assert.equal(result.error.code, "42501");
          else assert.deepEqual(result.data, [], "Unauthorized invoice invisible");
          await rejectedUnchanged(inv, args(inv, 3000), actor);
        });
      }
      await t.test(
        "same-company assistant cannot write AR headers or ledgers directly",
        async () => {
          const inv = await invoice("assistant-direct"),
            before = await snapshot(inv.id);
          const writes = [
            [
              "invoice_payments",
              {
                invoice_id: inv.id,
                paid_at: "2026-09-06",
                amount: 1,
                method: "ACH",
                status: "Posted",
              },
            ],
            [
              "payments_received",
              {
                invoice_id: inv.id,
                project_id: projectA,
                customer_name: inv.client_name,
                payment_date: "2026-09-06",
                amount: 1,
                payment_method: "ACH",
              },
            ],
          ];
          for (const [table, payload] of writes)
            assert.ok(
              (await actors.assistant.client.from(table).insert(payload)).error,
              `Assistant cannot insert ${table}`
            );
          const changed = await actors.assistant.client
            .from("invoices")
            .update({ total: 10001 })
            .eq("id", inv.id)
            .select("id");
          assert.ok(changed.error || changed.data?.length === 0, "Assistant cannot update invoice");
          assert.deepEqual(
            await snapshot(inv.id),
            before,
            "Denied direct writes preserve AR ledger"
          );
        }
      );
      await t.test(
        "own owner cannot link an invoice to a foreign organization project",
        async () => {
          const result = await actors.owner.client.from("invoices").insert({
            invoice_no: marker + " foreign-link",
            client_name: marker,
            project_id: projectB,
            status: "Sent",
            total: 10000,
          });
          assert.ok(result.error, "Cross-organization financial link is denied");
        }
      );
      await t.test(
        "revocation immediately removes reads and writes with the same token",
        async () => {
          const inv = await invoice("revocation");
          const before = await actors.owner.client.auth.getSession();
          const visible = await actors.owner.client.from("invoices").select("id").eq("id", inv.id);
          assert.equal(visible.error, null);
          assert.equal(visible.data.length, 1);
          await sql`update public.organization_memberships set status='inactive' where organization_id=${orgA} and user_id=${actors.owner.id}`;
          try {
            const result = await actors.owner.client.from("invoices").select("id").eq("id", inv.id);
            if (result.error) assert.equal(result.error.code, "42501");
            else assert.deepEqual(result.data, []);
            await rejectedUnchanged(inv, args(inv, 3000));
            const after = await actors.owner.client.auth.getSession();
            assert.equal(after.data.session.access_token, before.data.session.access_token);
          } finally {
            await sql`update public.organization_memberships set status='active' where organization_id=${orgA} and user_id=${actors.owner.id}`;
          }
        }
      );
      await t.test("concurrent duplicate delivery commits once", async () => {
        const inv = await invoice("concurrent-same"),
          payload = args(inv, 3000);
        const results = await Promise.all([record(payload), record(payload)]);
        assert.equal(success(results[0]).payment_id, success(results[1]).payment_id);
        await settlement(inv, 3000, 7000, "Partially Paid", 1);
      });
      await t.test("concurrent same key with changed amount conflicts", async () => {
        const inv = await invoice("concurrent-conflict"),
          payload = args(inv, 3000);
        const results = await Promise.all([
          record(payload),
          record({ ...payload, p_amount: 4000 }),
        ]);
        assert.equal(results.filter((r) => !r.error).length, 1);
        denied(
          results.find((r) => r.error),
          ["23505", "22023"]
        );
        const snap = await snapshot(inv.id),
          paid = Number(snap.payments[0].row.amount);
        assert.ok([3000, 4000].includes(paid));
        await settlement(inv, paid, 10000 - paid, "Partially Paid", 1);
      });
      await t.test("concurrent distinct intents cannot overpay remaining 10000", async () => {
        const inv = await invoice("concurrent-overpay");
        const results = await Promise.all([record(args(inv, 7000)), record(args(inv, 7000))]);
        assert.equal(results.filter((r) => !r.error).length, 1);
        denied(results.find((r) => r.error));
        await settlement(inv, 7000, 3000, "Partially Paid", 1);
      });
      await t.test("concurrent distinct 3000 and 7000 intents settle exactly", async () => {
        const inv = await invoice("concurrent-full");
        for (const result of await Promise.all([record(args(inv, 3000)), record(args(inv, 7000))]))
          success(result);
        await settlement(inv, 10000, 0, "Paid", 2);
      });
      for (const [table, event, condition] of [
        ["deposits", "insert", "new.invoice_id"],
        ["invoice_payments", "insert", "new.invoice_id"],
        ["invoices", "update", "new.id"],
        [
          "payment_received_attachments",
          "insert",
          "(select invoice_id from public.payments_received where id=new.payment_id)",
        ],
      ]) {
        await t.test(`${table} failure rolls back all receipt effects`, async () => {
          const inv = await invoice(`rollback-${table}`),
            name = `ar_test_${randomUUID().replaceAll("-", "")}`;
          const path = `payments-received/${inv.id}/${randomUUID()}-fixture.png`;
          const image = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
            "base64"
          );
          storagePaths.add(path);
          const upload = await actors.owner.client.storage
            .from("payment-attachments")
            .upload(path, new Blob([image], { type: "image/png" }), { upsert: false });
          assert.equal(
            upload.error,
            null,
            "Real owner uploads canonical invoice attachment before RPC"
          );
          const payload = args(inv, 3000, randomUUID(), {
            p_attachments: [
              {
                file_url: path,
                file_name: "fixture.png",
                file_type: "image",
                mime_type: "image/png",
                size_bytes: image.length,
              },
            ],
          });
          triggers.set(name, table);
          await sql.unsafe(
            `create function public."${name}"() returns trigger language plpgsql as $$ begin if ${condition} = '${inv.id}'::uuid then raise exception 'AR injected fixture failure' using errcode='P0001'; end if; return new; end $$`
          );
          await sql.unsafe(
            `create trigger "${name}" before ${event} on public."${table}" for each row execute function public."${name}"()`
          );
          try {
            await rejectedUnchanged(inv, payload, actors.owner, ["P0001"]);
          } finally {
            await sql.unsafe(`drop trigger if exists "${name}" on public."${table}"`);
            await sql.unsafe(`drop function if exists public."${name}"()`);
            triggers.delete(name);
          }
          success(await record(payload));
          await settlement(inv, 3000, 7000, "Partially Paid", 1);
          assert.equal((await snapshot(inv.id)).attachments.length, 1);
          if (table === "payment_received_attachments") {
            const committed = await snapshot(inv.id);
            const ownerRead = await actors.owner.client.storage
              .from("payment-attachments")
              .download(path);
            assert.equal(ownerRead.error, null, "Owner reads committed attachment");
            assert.deepEqual(Buffer.from(await ownerRead.data.arrayBuffer()), image);
            for (const [label, client] of [
              ["foreign owner", actors.foreign.client],
              ["anonymous", anon],
            ]) {
              const read = await client.storage.from("payment-attachments").download(path);
              assert.ok(read.error, `${label} cannot read another organization attachment`);
              const signed = await client.storage
                .from("payment-attachments")
                .createSignedUrl(path, 30);
              assert.ok(signed.error, `${label} cannot sign another organization attachment`);
              const removed = await client.storage.from("payment-attachments").remove([path]);
              assert.ok(
                removed.error || removed.data?.length === 0,
                `${label} cannot delete attachment`
              );
            }
            const removed = await actors.owner.client.storage
              .from("payment-attachments")
              .remove([path]);
            assert.ok(
              removed.error || removed.data?.length === 0,
              "Owner cannot delete a committed attachment object"
            );
            const preserved = await actors.owner.client.storage
              .from("payment-attachments")
              .download(path);
            assert.equal(preserved.error, null, "Committed object survives every denied delete");
            assert.deepEqual(Buffer.from(await preserved.data.arrayBuffer()), image);
            assert.deepEqual(
              await snapshot(inv.id),
              committed,
              "Denied attachment access does not alter settlement"
            );
          }
        });
      }
      await t.test("AP payment integrity preserves a separate cash-out ledger", async (t) => {
        const [{ count: arBefore }] =
          await sql`select count(*)::int as count from public.payments_received where notes=${marker}`;
        async function bill(label) {
          const id = randomUUID();
          billIds.push(id);
          await sql`insert into public.ap_bills(id,vendor_name,amount,balance_amount,status,project_id) values(${id},${marker + label},100,100,'Pending',${projectA})`;
          return id;
        }
        const args = (id, amount, key = randomUUID()) => ({
          p_bill_id: id,
          p_idempotency_key: key,
          p_payment_date: "2026-09-06",
          p_amount: amount,
          p_payment_method: "ACH",
          p_reference_no: null,
          p_notes: marker,
        });
        const pay = (payload, actor = actors.owner) =>
          actor.client.rpc("record_ap_bill_payment_atomic", payload);
        async function ledger(id, paid, count) {
          const [row] =
            await sql`select amount,paid_amount,balance_amount,status from public.ap_bills where id=${id}`;
          assert.equal(Number(row.amount), 100);
          assert.equal(Number(row.paid_amount), paid);
          assert.equal(Number(row.balance_amount), 100 - paid);
          assert.equal(row.status, paid === 100 ? "Paid" : paid > 0 ? "Partially Paid" : "Pending");
          const [{ n, total }] =
            await sql`select count(*)::int n,coalesce(sum(amount),0) total from public.ap_bill_payments where bill_id=${id}`;
          assert.equal(n, count);
          assert.equal(Number(total), paid);
        }
        await t.test("partial, lost-response retry, full and immutable payment", async () => {
          const id = await bill("AP partial"),
            payload = args(id, 40);
          const first = await pay(payload);
          assert.equal(first.error, null);
          await ledger(id, 40, 1);
          assert.equal((await pay(payload)).data.payment.id, first.data.payment.id);
          await ledger(id, 40, 1);
          assert.ok((await pay({ ...payload, p_amount: 41 })).error);
          assert.equal((await pay(args(id, 60), actors.admin)).error, null);
          await ledger(id, 100, 2);
          assert.ok((await pay(args(id, 0.01))).error);
          const edited = await actors.owner.client
            .from("ap_bill_payments")
            .update({ amount: 1 })
            .eq("id", first.data.payment.id);
          assert.ok(edited.error);
          await ledger(id, 100, 2);
        });
        await t.test(
          "invalid, unauthorized and direct duplicate-risk requests roll back",
          async () => {
            const id = await bill("AP denied");
            for (const amount of [0, -1, 0.004, "NaN", "Infinity", 101])
              assert.ok((await pay(args(id, amount))).error);
            for (const name of ["foreign", "assistant", "inactive", "unassigned"])
              assert.ok((await pay(args(id, 40), actors[name])).error);
            assert.ok((await anon.rpc("record_ap_bill_payment_atomic", args(id, 40))).error);
            assert.ok(
              (
                await actors.owner.client
                  .from("ap_bill_payments")
                  .insert({ bill_id: id, amount: 40, payment_date: "2026-09-06" })
              ).error
            );
            await ledger(id, 0, 0);
          }
        );
        await t.test(
          "same-company assistant cannot write AP headers or payments directly",
          async () => {
            const id = await bill("AP assistant direct");
            const result = await actors.assistant.client.from("ap_bill_payments").insert({
              bill_id: id,
              amount: 40,
              payment_date: "2026-09-06",
              idempotency_key: randomUUID(),
            });
            assert.ok(result.error, "Assistant cannot insert AP payment");
            const changed = await actors.assistant.client
              .from("ap_bills")
              .update({ amount: 101 })
              .eq("id", id)
              .select("id");
            assert.ok(changed.error || changed.data?.length === 0, "Assistant cannot update bill");
            await ledger(id, 0, 0);
          }
        );
        await t.test("concurrent duplicate and distinct requests reconcile exactly", async () => {
          const same = await bill("AP duplicate"),
            payload = args(same, 40);
          const duplicates = await Promise.all([pay(payload), pay(payload)]);
          for (const result of duplicates) assert.equal(result.error, null);
          assert.equal(duplicates[0].data.payment.id, duplicates[1].data.payment.id);
          await ledger(same, 40, 1);
          const over = await bill("AP concurrent over");
          const rejected = await Promise.all([pay(args(over, 70)), pay(args(over, 70))]);
          assert.equal(rejected.filter((r) => !r.error).length, 1);
          await ledger(over, 70, 1);
          const full = await bill("AP concurrent full");
          for (const result of await Promise.all([pay(args(full, 40)), pay(args(full, 60))]))
            assert.equal(result.error, null);
          await ledger(full, 100, 2);
        });
        await t.test("header write failure rolls back payment and retries once", async () => {
          const id = await bill("AP rollback"),
            payload = args(id, 40),
            name = `ap_test_${randomUUID().replaceAll("-", "")}`;
          triggers.set(name, "ap_bills");
          await sql.unsafe(
            `create function public."${name}"() returns trigger language plpgsql as $$ begin if new.id='${id}'::uuid then raise exception 'AP injected failure'; end if;return new;end $$`
          );
          await sql.unsafe(
            `create trigger "${name}" before update on public.ap_bills for each row execute function public."${name}"()`
          );
          try {
            assert.ok((await pay(payload)).error);
            await ledger(id, 0, 0);
          } finally {
            await sql.unsafe(`drop trigger "${name}" on public.ap_bills`);
            await sql.unsafe(`drop function public."${name}"()`);
            triggers.delete(name);
          }
          assert.equal((await pay(payload)).error, null);
          await ledger(id, 40, 1);
        });
        const [{ count: arLeak }] =
          await sql`select count(*)::int as count from public.payments_received where notes=${marker}`;
        assert.equal(arLeak, arBefore, "AP settlement creates no AR receipts");
      });
    }
    if (process.env.HH_AR_SETTLEMENT_E2E === "1") {
      const {
        verifyARSettlementWorkflows,
        verifyAPSettlementWorkflows,
        verifyEstimateInvoiceWorkflows,
      } = await import("./ar-settlement-workflows.local.mjs");
      if (scope !== "estimate") {
        const invoices = [];
        for (const width of [1440, 768, 390]) invoices.push(await invoice(`browser-${width}`));
        await verifyARSettlementWorkflows({ actor: actors.owner, invoices, sql, t, marker });
        const bills = [];
        for (const width of [1440, 768, 390]) {
          const id = randomUUID();
          billIds.push(id);
          bills.push(id);
          await sql`insert into public.ap_bills(id,vendor_name,amount,balance_amount,status,project_id) values(${id},${marker + " browser " + width},100,100,'Pending',${projectA})`;
        }
        await verifyAPSettlementWorkflows({ actor: actors.owner, bills, sql, t });
      }
      if (scope !== "ar-ap-ui") {
        const estimates = [];
        for (const width of [1440, 768, 390])
          estimates.push(await seedEstimate(`browser estimate ${width}`));
        await verifyEstimateInvoiceWorkflows({ actor: actors.owner, estimates, sql, t });
      }
    }
  }
);
