import assert from "node:assert/strict";
import "dotenv/config";
import postgres from "postgres";

const databaseUrl =
  process.env.SUPABASE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
if (!databaseUrl) throw new Error("SUPABASE_DATABASE_URL is required.");

const target = new URL(databaseUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
if (!localHosts.has(target.hostname) || target.port !== "54322") {
  throw new Error("Phase 3C verification is restricted to localhost PostgreSQL port 54322.");
}

const sql = postgres(databaseUrl, { max: 1 });
const actorId = "33333333-3333-4333-8333-333333333333";
const actorLabel = "owner@example.com";
const rollbackMarker = "PHASE_3C_VERIFICATION_ROLLBACK";

async function seedDraft(tx, suffix, status = "Draft") {
  const [estimate] = await tx`
    insert into public.estimates (number, client, project, status)
    values (${`EST-P3C-${suffix}`}, ${`Client ${suffix}`}, ${`Project ${suffix}`}, ${status})
    returning id, revision_root_id, revision_number, status
  `;
  await tx`
    insert into public.estimate_meta (
      estimate_id, client_name, project_name, tax, discount, estimate_date
    ) values (
      ${estimate.id}, ${`Client ${suffix}`}, ${`Project ${suffix}`}, 50, 50, current_date
    )
  `;
  await tx`
    insert into public.estimate_items (
      estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct, sort_order
    ) values (${estimate.id}, '010000', 'Activity integrity item', 2, 'EA', 500, 0, 0)
  `;
  return estimate;
}

try {
  await sql.begin(async (tx) => {
    const suffix = Date.now();
    const source = await seedDraft(tx, `${suffix}-A`);
    const rejected = await seedDraft(tx, `${suffix}-R`);
    const failureProbe = await seedDraft(tx, `${suffix}-F`);

    const [schedule] = await tx`
      insert into public.estimate_payment_schedule_items (
        estimate_id, title, description, amount, due_date, status, invoice_id, sort_order
      ) values (
        ${source.id}, 'Deposit', 'Tax-inclusive fixed amount', 500, current_date, 'draft', null, 0
      )
      returning id, amount, status, invoice_id
    `;

    for (const estimate of [source, rejected, failureProbe]) {
      const [created] = await tx`
        select public.record_estimate_created_activity(
          ${estimate.id}::uuid,
          ${actorId}::uuid,
          ${actorLabel}::text,
          'new'::text,
          null::uuid
        ) as recorded
      `;
      assert.equal(created.recorded, true);
    }

    const [sent] = await tx`
      select public.transition_estimate_status_with_activity(
        ${source.id}::uuid, 'Sent'::text, ${actorId}::uuid, ${actorLabel}::text,
        null::uuid, null::text
      ) as changed
    `;
    assert.equal(sent.changed, true);
    const [approved] = await tx`
      select public.transition_estimate_status_with_activity(
        ${source.id}::uuid, 'Approved'::text, ${actorId}::uuid, ${actorLabel}::text,
        null::uuid, null::text
      ) as changed
    `;
    assert.equal(approved.changed, true);

    await tx`
      select public.transition_estimate_status_with_activity(
        ${rejected.id}::uuid, 'Sent'::text, ${actorId}::uuid, ${actorLabel}::text,
        null::uuid, null::text
      )
    `;
    await tx`
      select public.transition_estimate_status_with_activity(
        ${rejected.id}::uuid, 'Rejected'::text, ${actorId}::uuid, ${actorLabel}::text,
        null::uuid, null::text
      )
    `;

    const [revision] = await tx`
      select *
      from public.create_estimate_revision(
        ${source.id}::uuid,
        ${actorId}::uuid,
        ${actorLabel}::text
      )
    `;
    assert.equal(revision.revision_number, 1);

    const [invoice] = await tx`
      insert into public.invoices (
        invoice_no, client_name, issue_date, due_date, status,
        tax_pct, subtotal, tax_amount, total, paid_total, balance_due
      ) values (
        ${`INV-P3C-${suffix}`}, 'Client', current_date, current_date, 'Draft',
        5, 476.19, 23.81, 500, 0, 500
      )
      returning id, subtotal, tax_amount, total, paid_total, balance_due
    `;
    const [invoiceLink] = await tx`
      select *
      from public.link_estimate_milestone_invoice_with_activity(
        ${source.id}::uuid,
        ${schedule.id}::uuid,
        ${invoice.id}::uuid,
        ${actorId}::uuid,
        ${actorLabel}::text
      )
    `;
    assert.equal(invoiceLink.linked, true);
    assert.equal(invoiceLink.linked_invoice_id, invoice.id);

    const [project] = await tx`
      insert into public.projects (
        name, status, budget, spent, source_estimate_id,
        snapshot_revenue, snapshot_budget_cost, snapshot_breakdown
      ) values (
        ${`Project P3C ${suffix}`}, 'active', 1000, 0, ${source.id},
        1000, 1000, '{"materials":1000,"labor":0,"vendor":0,"other":0}'::jsonb
      )
      returning id, name, budget, spent
    `;
    const [converted] = await tx`
      select public.transition_estimate_status_with_activity(
        ${source.id}::uuid, 'Converted'::text, ${actorId}::uuid, ${actorLabel}::text,
        ${project.id}::uuid, 'project'::text
      ) as changed
    `;
    assert.equal(converted.changed, true);

    let auditFailure = null;
    try {
      await tx.savepoint(async (sp) => {
        await sp`
          select public.transition_estimate_status_with_activity(
            ${failureProbe.id}::uuid, 'Sent'::text, ${actorId}::uuid, ''::text,
            null::uuid, null::text
          )
        `;
      });
    } catch (error) {
      auditFailure = error;
    }
    assert.ok(auditFailure, "Invalid activity actor must abort the lifecycle statement");
    const [failureState] = await tx`
      select status from public.estimates where id = ${failureProbe.id}
    `;
    assert.equal(failureState.status, "Draft");

    const events = await tx`
      select
        estimate_id, revision_root_id, revision_number, event_type,
        actor_user_id, actor_label, occurred_at, related_record_type,
        related_record_id, metadata
      from public.estimate_activity_events
      where revision_root_id = ${source.id}
      order by occurred_at, id
    `;
    assert.deepEqual(
      events.map((event) => event.event_type),
      [
        "estimate_created",
        "marked_sent",
        "approved",
        "revision_created",
        "estimate_created",
        "draft_invoice_created",
        "converted_to_project",
      ]
    );
    assert.ok(events.every((event) => event.actor_user_id === actorId));
    assert.ok(events.every((event) => event.actor_label === actorLabel));
    assert.ok(events.every((event) => event.occurred_at instanceof Date));

    const revisionCreated = events.find((event) => event.event_type === "revision_created");
    assert.equal(revisionCreated.estimate_id, source.id);
    assert.equal(revisionCreated.related_record_type, "estimate_revision");
    assert.equal(revisionCreated.related_record_id, revision.estimate_id);
    const revisionEstimateCreated = events.find(
      (event) =>
        event.event_type === "estimate_created" && event.estimate_id === revision.estimate_id
    );
    assert.equal(revisionEstimateCreated.revision_root_id, source.id);
    assert.equal(revisionEstimateCreated.revision_number, 1);

    const invoiceEvent = events.find((event) => event.event_type === "draft_invoice_created");
    assert.equal(invoiceEvent.related_record_id, invoice.id);
    assert.equal(invoiceEvent.related_record_type, "invoice");
    const projectEvent = events.find((event) => event.event_type === "converted_to_project");
    assert.equal(projectEvent.related_record_id, project.id);
    assert.equal(projectEvent.related_record_type, "project");

    const [financialState] = await tx`
      select
        m.tax,
        m.discount,
        p.amount as milestone_amount,
        p.status as milestone_status,
        p.invoice_id,
        i.subtotal,
        i.tax_amount,
        i.total as invoice_total,
        i.paid_total,
        i.balance_due,
        pr.budget as project_budget,
        pr.spent as project_spent
      from public.estimate_meta as m
      join public.estimate_payment_schedule_items as p on p.estimate_id = m.estimate_id
      join public.invoices as i on i.id = p.invoice_id
      join public.projects as pr on pr.source_estimate_id = m.estimate_id
      where m.estimate_id = ${source.id}
    `;
    assert.equal(Number(financialState.tax), 50);
    assert.equal(Number(financialState.discount), 50);
    assert.equal(Number(financialState.milestone_amount), 500);
    assert.equal(financialState.milestone_status, "invoiced");
    assert.equal(Number(financialState.subtotal), 476.19);
    assert.equal(Number(financialState.tax_amount), 23.81);
    assert.equal(Number(financialState.invoice_total), 500);
    assert.equal(Number(financialState.paid_total), 0);
    assert.equal(Number(financialState.balance_due), 500);
    assert.equal(Number(financialState.project_budget), 1000);
    assert.equal(Number(financialState.project_spent), 0);

    let immutableFailure = null;
    try {
      await tx.savepoint(async (sp) => {
        await sp`
          update public.estimate_activity_events
          set actor_label = 'tampered'
          where estimate_id = ${source.id}
        `;
      });
    } catch (error) {
      immutableFailure = error;
    }
    assert.ok(immutableFailure, "Historical Estimate activity must reject updates");

    const [privileges] = await tx`
      select
        has_table_privilege('anon', 'public.estimate_activity_events', 'SELECT') as anon_select,
        has_table_privilege('authenticated', 'public.estimate_activity_events', 'SELECT')
          as authenticated_select,
        has_table_privilege('service_role', 'public.estimate_activity_events', 'SELECT')
          as service_select,
        has_table_privilege('service_role', 'public.estimate_activity_events', 'INSERT')
          as service_insert,
        has_table_privilege('service_role', 'public.estimate_activity_events', 'UPDATE')
          as service_update,
        has_table_privilege('service_role', 'public.estimate_activity_events', 'DELETE')
          as service_delete
    `;
    assert.equal(privileges.anon_select, false);
    assert.equal(privileges.authenticated_select, false);
    assert.equal(privileges.service_select, true);
    assert.equal(privileges.service_insert, true);
    assert.equal(privileges.service_update, false);
    assert.equal(privileges.service_delete, false);

    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
  console.log(
    "PASS Phase 3C DB verification: Created, Sent, Approved, Rejected, Revision, Invoice, Project, actor/time/links, immutability, atomic failure, and financial invariance. All marker rows rolled back."
  );
} finally {
  await sql.end();
}
