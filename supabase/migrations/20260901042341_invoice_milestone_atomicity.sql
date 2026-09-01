-- Create an Invoice and link it to an Estimate milestone in one transaction.
--
-- This composes the existing authoritative Invoice formula/idempotency RPC and
-- the existing milestone/activity RPC. It intentionally does not redefine any
-- amount, tax, rounding, persistence, or activity semantics.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.create_estimate_milestone_invoice_atomic(
  p_idempotency_key text,
  p_header jsonb,
  p_items jsonb,
  p_estimate_id uuid,
  p_schedule_item_id uuid,
  p_actor_user_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_schedule public.estimate_payment_schedule_items%rowtype;
  v_estimate public.estimates%rowtype;
  v_expected_idempotency_key text;
  v_create_result jsonb;
  v_invoice_id uuid;
  v_invoice_total numeric;
  v_linked_invoice_id uuid;
  v_linked boolean;
begin
  if p_estimate_id is null or p_schedule_item_id is null then
    raise exception using
      errcode = '22023',
      message = 'Estimate and payment schedule item are required.';
  end if;

  -- Milestone identity, rather than caller input or Invoice content, owns
  -- idempotency. This prevents one Invoice from being linked to two milestones.
  v_expected_idempotency_key :=
    'invoice-milestone:' || p_estimate_id::text || ':' || p_schedule_item_id::text;
  if btrim(coalesce(p_idempotency_key, '')) <> v_expected_idempotency_key then
    raise exception using
      errcode = '22023',
      message = 'Milestone Invoice idempotency key must match its Estimate and payment schedule item.';
  end if;

  -- The row lock serializes competing create/link attempts for one milestone.
  select schedule.*
  into v_schedule
  from public.estimate_payment_schedule_items as schedule
  where schedule.id = p_schedule_item_id
    and schedule.estimate_id = p_estimate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Payment schedule item not found.';
  end if;

  -- Revalidate the long-lived business authority only after obtaining the
  -- milestone lock. The application prefill is UX validation, not a commit
  -- authority, and a concurrent Estimate transition must fail closed here.
  select estimate.*
  into v_estimate
  from public.estimates as estimate
  where estimate.id = p_estimate_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate not found.';
  end if;
  if v_estimate.status not in ('Approved', 'Converted') then
    raise exception using
      errcode = '23514',
      message = 'Only Approved or Converted Estimates can create milestone Invoices.';
  end if;
  if coalesce(v_schedule.amount, 0) <= 0 then
    raise exception using
      errcode = '23514',
      message = 'Payment schedule amount must be greater than zero.';
  end if;

  -- A committed link is authoritative. Ambiguous-response retries must return
  -- it without creating, remapping, or deleting any Invoice.
  if v_schedule.invoice_id is not null then
    perform 1
    from public.invoices as invoice
    where invoice.id = v_schedule.invoice_id
    for key share;
    if not found then
      raise exception using
        errcode = '23514',
        message = 'Linked milestone Invoice is missing.';
    end if;
    if v_schedule.status <> 'invoiced' then
      raise exception using
        errcode = '23514',
        message = 'Linked milestone Invoice state is inconsistent.';
    end if;
    perform 1
    from public.estimate_activity_events as event
    where event.estimate_id = p_estimate_id
      and event.event_type = 'draft_invoice_created'
      and event.related_record_type = 'invoice'
      and event.related_record_id = v_schedule.invoice_id;
    if not found then
      raise exception using
        errcode = '23514',
        message = 'Linked milestone Invoice activity is missing.';
    end if;

    return jsonb_build_object(
      'invoice_id', v_schedule.invoice_id,
      'reused', true,
      'linked', false,
      'authoritative', true
    );
  end if;

  if v_schedule.status <> 'draft' then
    raise exception using
      errcode = '23514',
      message = 'Payment schedule item is not eligible for an Invoice.';
  end if;

  v_create_result := public.create_invoice_atomic(
    p_idempotency_key,
    p_header,
    p_items
  );
  v_invoice_id := nullif(v_create_result->>'invoice_id', '')::uuid;
  if v_invoice_id is null then
    raise exception using
      errcode = '23514',
      message = 'Atomic Invoice create returned no Invoice.';
  end if;

  -- Reuse create_invoice_atomic as the sole formula/rounding authority, then
  -- compare its persisted total to the locked milestone amount. A mismatch
  -- aborts this transaction and rolls the new Invoice back.
  select invoice.total
  into v_invoice_total
  from public.invoices as invoice
  where invoice.id = v_invoice_id
  for key share;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'Atomic Invoice create returned a missing Invoice.';
  end if;
  if pg_catalog.round(v_invoice_total, 2) is distinct from pg_catalog.round(v_schedule.amount, 2) then
    raise exception using
      errcode = '23514',
      message = 'Invoice total must match the locked payment schedule amount.';
  end if;

  select linked.linked_invoice_id, linked.linked
  into v_linked_invoice_id, v_linked
  from public.link_estimate_milestone_invoice_with_activity(
    p_estimate_id,
    p_schedule_item_id,
    v_invoice_id,
    p_actor_user_id,
    p_actor_label
  ) as linked;

  if v_linked_invoice_id is distinct from v_invoice_id or v_linked is distinct from true then
    raise exception using
      errcode = '23514',
      message = 'Invoice create and milestone linkage did not complete together.';
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'reused', coalesce((v_create_result->>'reused')::boolean, false),
    'linked', true,
    'authoritative', true
  );
end
$function$;

revoke all on function public.create_estimate_milestone_invoice_atomic(
  text, jsonb, jsonb, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_estimate_milestone_invoice_atomic(
  text, jsonb, jsonb, uuid, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';
