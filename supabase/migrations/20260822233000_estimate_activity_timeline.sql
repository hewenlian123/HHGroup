-- Phase 3C: revision-aware, read-only Estimate business activity.
--
-- The event table is a protected append-only record. Server-authoritative RPCs
-- write events in the same transaction as the lifecycle/link operation they
-- describe. No Estimate, Invoice, Payment Schedule, or Project amount is read
-- or changed by this migration.

create table public.estimate_activity_events (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  revision_root_id uuid not null references public.estimates(id) on delete cascade,
  revision_number integer not null check (revision_number >= 0),
  event_type text not null check (
    event_type in (
      'estimate_created',
      'marked_sent',
      'approved',
      'rejected',
      'revision_created',
      'draft_invoice_created',
      'converted_to_project'
    )
  ),
  actor_user_id uuid not null,
  actor_label text not null check (length(btrim(actor_label)) > 0),
  occurred_at timestamptz not null default statement_timestamp(),
  related_record_type text null check (
    related_record_type in ('estimate_revision', 'invoice', 'project')
  ),
  related_record_id uuid null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint estimate_activity_related_record_shape check (
    (related_record_type is null and related_record_id is null)
    or
    (related_record_type is not null and related_record_id is not null)
  ),
  constraint estimate_activity_event_related_type check (
    (
      event_type = 'revision_created'
      and related_record_type = 'estimate_revision'
      and related_record_id is not null
    )
    or (
      event_type = 'draft_invoice_created'
      and related_record_type = 'invoice'
      and related_record_id is not null
    )
    or (
      event_type = 'converted_to_project'
      and related_record_type = 'project'
      and related_record_id is not null
    )
    or (
      event_type = 'estimate_created'
      and (related_record_type is null or related_record_type = 'estimate_revision')
    )
    or (
      event_type in ('marked_sent', 'approved', 'rejected')
      and related_record_type is null
    )
  )
);

create index estimate_activity_events_estimate_time_idx
  on public.estimate_activity_events (estimate_id, occurred_at desc, id desc);

create index estimate_activity_events_revision_time_idx
  on public.estimate_activity_events (
    revision_root_id,
    revision_number,
    occurred_at desc,
    id desc
  );

create unique index estimate_activity_events_created_once_idx
  on public.estimate_activity_events (estimate_id)
  where event_type = 'estimate_created';

create unique index estimate_activity_events_related_once_idx
  on public.estimate_activity_events (
    estimate_id,
    event_type,
    related_record_type,
    related_record_id
  )
  where related_record_id is not null;

alter table public.estimate_activity_events enable row level security;
revoke all privileges on table public.estimate_activity_events
  from public, anon, authenticated, service_role;
grant select, insert on table public.estimate_activity_events to service_role;

create or replace function public.prevent_estimate_activity_event_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'Estimate activity events are immutable.';
end
$function$;

drop trigger if exists trg_prevent_estimate_activity_event_update
  on public.estimate_activity_events;
create trigger trg_prevent_estimate_activity_event_update
  before update on public.estimate_activity_events
  for each row execute function public.prevent_estimate_activity_event_update();

revoke all on function public.prevent_estimate_activity_event_update()
  from public, anon, authenticated, service_role;

create or replace function public.insert_estimate_activity_event(
  p_estimate_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_actor_label text,
  p_related_record_type text default null,
  p_related_record_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_estimate public.estimates%rowtype;
  v_event_id uuid;
begin
  if p_actor_user_id is null or nullif(btrim(p_actor_label), '') is null then
    raise exception using errcode = '22023', message = 'Estimate activity actor is required.';
  end if;

  select e.*
  into v_estimate
  from public.estimates as e
  where e.id = p_estimate_id
  for key share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate not found.';
  end if;

  insert into public.estimate_activity_events (
    estimate_id,
    revision_root_id,
    revision_number,
    event_type,
    actor_user_id,
    actor_label,
    related_record_type,
    related_record_id,
    metadata
  ) values (
    v_estimate.id,
    v_estimate.revision_root_id,
    v_estimate.revision_number,
    p_event_type,
    p_actor_user_id,
    btrim(p_actor_label),
    p_related_record_type,
    p_related_record_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select a.id
    into v_event_id
    from public.estimate_activity_events as a
    where a.estimate_id = p_estimate_id
      and a.event_type = p_event_type
      and a.related_record_type is not distinct from p_related_record_type
      and a.related_record_id is not distinct from p_related_record_id
    order by a.occurred_at, a.id
    limit 1;
  end if;

  return v_event_id;
end
$function$;

revoke all on function public.insert_estimate_activity_event(
  uuid, text, uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.insert_estimate_activity_event(
  uuid, text, uuid, text, text, uuid, jsonb
) to service_role;

create or replace function public.record_estimate_created_activity(
  p_estimate_id uuid,
  p_actor_user_id uuid,
  p_actor_label text,
  p_creation_method text default 'new',
  p_source_estimate_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_estimate public.estimates%rowtype;
  v_source_revision_number integer;
  v_related_type text;
begin
  if p_creation_method not in ('new', 'duplicate', 'copy_previous', 'revision') then
    raise exception using errcode = '22023', message = 'Estimate creation method is invalid.';
  end if;

  select e.*
  into v_estimate
  from public.estimates as e
  where e.id = p_estimate_id
  for key share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate not found.';
  end if;
  if v_estimate.status <> 'Draft' then
    raise exception using errcode = '23514', message = 'Only a Draft may receive Estimate Created activity.';
  end if;

  if p_source_estimate_id is not null then
    select e.revision_number
    into v_source_revision_number
    from public.estimates as e
    where e.id = p_source_estimate_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Source Estimate not found.';
    end if;
  end if;

  v_related_type := case when p_creation_method = 'revision' then 'estimate_revision' else null end;

  perform public.insert_estimate_activity_event(
    p_estimate_id,
    'estimate_created',
    p_actor_user_id,
    p_actor_label,
    v_related_type,
    case when v_related_type is null then null else p_source_estimate_id end,
    jsonb_strip_nulls(jsonb_build_object(
      'creation_method', p_creation_method,
      'source_estimate_id', p_source_estimate_id,
      'source_revision_number', v_source_revision_number
    ))
  );
  return true;
end
$function$;

revoke all on function public.record_estimate_created_activity(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_estimate_created_activity(uuid, uuid, text, text, uuid)
  to service_role;

create or replace function public.transition_estimate_status_with_activity(
  p_estimate_id uuid,
  p_next_status text,
  p_actor_user_id uuid,
  p_actor_label text,
  p_related_record_id uuid default null,
  p_related_record_type text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_estimate public.estimates%rowtype;
  v_event_type text;
  v_project_name text;
begin
  select e.*
  into v_estimate
  from public.estimates as e
  where e.id = p_estimate_id
  for update;

  if not found then return false; end if;
  if not (
    (v_estimate.status = 'Draft' and p_next_status = 'Sent')
    or (v_estimate.status = 'Sent' and p_next_status in ('Approved', 'Rejected'))
    or (v_estimate.status = 'Approved' and p_next_status = 'Converted')
  ) then
    return false;
  end if;

  v_event_type := case p_next_status
    when 'Sent' then 'marked_sent'
    when 'Approved' then 'approved'
    when 'Rejected' then 'rejected'
    when 'Converted' then 'converted_to_project'
  end;

  if p_next_status = 'Converted' then
    if p_related_record_type <> 'project' or p_related_record_id is null then
      raise exception using errcode = '22023', message = 'Converted Estimate activity requires its canonical Project.';
    end if;
    select p.name
    into v_project_name
    from public.projects as p
    where p.id = p_related_record_id
      and p.source_estimate_id = p_estimate_id;
    if not found then
      raise exception using errcode = '23503', message = 'Related Project does not belong to this Estimate.';
    end if;
  elsif p_related_record_type is not null or p_related_record_id is not null then
    raise exception using errcode = '22023', message = 'This Estimate transition has no related record.';
  end if;

  update public.estimates
  set
    status = p_next_status,
    approved_at = case when p_next_status = 'Approved' then current_date else approved_at end,
    updated_at = current_date
  where id = p_estimate_id;

  perform public.insert_estimate_activity_event(
    p_estimate_id,
    v_event_type,
    p_actor_user_id,
    p_actor_label,
    p_related_record_type,
    p_related_record_id,
    jsonb_strip_nulls(jsonb_build_object('project_name', v_project_name))
  );
  return true;
end
$function$;

revoke all on function public.transition_estimate_status_with_activity(
  uuid, text, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.transition_estimate_status_with_activity(
  uuid, text, uuid, text, uuid, text
) to service_role;

create or replace function public.link_estimate_milestone_invoice_with_activity(
  p_estimate_id uuid,
  p_schedule_item_id uuid,
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_actor_label text
)
returns table (linked_invoice_id uuid, linked boolean)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_schedule public.estimate_payment_schedule_items%rowtype;
  v_invoice_no text;
begin
  select p.*
  into v_schedule
  from public.estimate_payment_schedule_items as p
  where p.id = p_schedule_item_id
    and p.estimate_id = p_estimate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Payment schedule item not found.';
  end if;
  if v_schedule.invoice_id is not null then
    linked_invoice_id := v_schedule.invoice_id;
    linked := false;
    return next;
    return;
  end if;
  if v_schedule.status <> 'draft' then
    raise exception using errcode = '23514', message = 'Payment schedule item is not eligible for an Invoice.';
  end if;

  select i.invoice_no
  into v_invoice_no
  from public.invoices as i
  where i.id = p_invoice_id
  for key share;
  if not found then
    raise exception using errcode = '23503', message = 'Invoice not found.';
  end if;

  update public.estimate_payment_schedule_items
  set invoice_id = p_invoice_id, status = 'invoiced'
  where id = p_schedule_item_id;

  perform public.insert_estimate_activity_event(
    p_estimate_id,
    'draft_invoice_created',
    p_actor_user_id,
    p_actor_label,
    'invoice',
    p_invoice_id,
    jsonb_build_object(
      'invoice_no', v_invoice_no,
      'payment_schedule_item_id', p_schedule_item_id,
      'payment_schedule_title', v_schedule.title
    )
  );

  linked_invoice_id := p_invoice_id;
  linked := true;
  return next;
end
$function$;

revoke all on function public.link_estimate_milestone_invoice_with_activity(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.link_estimate_milestone_invoice_with_activity(
  uuid, uuid, uuid, uuid, text
) to service_role;

-- Atomic activity-aware wrapper over the single Phase 2B/3A copy engine.
create or replace function public.duplicate_estimate_as_draft(
  p_source_estimate_id uuid,
  p_actor_user_id uuid,
  p_actor_label text
)
returns table (estimate_id uuid, estimate_number text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_copy record;
begin
  select *
  into strict v_copy
  from public.duplicate_estimate_as_draft(p_source_estimate_id);

  perform public.record_estimate_created_activity(
    v_copy.estimate_id,
    p_actor_user_id,
    p_actor_label,
    'duplicate',
    p_source_estimate_id
  );

  return query select v_copy.estimate_id::uuid, v_copy.estimate_number::text;
end
$function$;

revoke all on function public.duplicate_estimate_as_draft(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.duplicate_estimate_as_draft(uuid, uuid, text)
  to service_role;

-- Atomic activity-aware wrapper over the Phase 3A revision contract.
create or replace function public.create_estimate_revision(
  p_source_estimate_id uuid,
  p_actor_user_id uuid,
  p_actor_label text
)
returns table (estimate_id uuid, estimate_number text, revision_number integer)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_revision record;
  v_source_revision_number integer;
begin
  select e.revision_number
  into v_source_revision_number
  from public.estimates as e
  where e.id = p_source_estimate_id
  for key share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Source Estimate not found.';
  end if;

  select *
  into strict v_revision
  from public.create_estimate_revision(p_source_estimate_id);

  perform public.insert_estimate_activity_event(
    p_source_estimate_id,
    'revision_created',
    p_actor_user_id,
    p_actor_label,
    'estimate_revision',
    v_revision.estimate_id,
    jsonb_build_object(
      'source_revision_number', v_source_revision_number,
      'related_revision_number', v_revision.revision_number
    )
  );

  perform public.record_estimate_created_activity(
    v_revision.estimate_id,
    p_actor_user_id,
    p_actor_label,
    'revision',
    p_source_estimate_id
  );

  return query
  select
    v_revision.estimate_id::uuid,
    v_revision.estimate_number::text,
    v_revision.revision_number::integer;
end
$function$;

revoke all on function public.create_estimate_revision(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_estimate_revision(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
