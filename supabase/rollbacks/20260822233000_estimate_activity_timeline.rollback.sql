-- Roll back Phase 3C Estimate activity without changing the pre-existing
-- one-argument duplicate/revision copy functions or any business record.

drop function if exists public.create_estimate_revision(uuid, uuid, text);
drop function if exists public.duplicate_estimate_as_draft(uuid, uuid, text);
drop function if exists public.link_estimate_milestone_invoice_with_activity(
  uuid, uuid, uuid, uuid, text
);
drop function if exists public.transition_estimate_status_with_activity(
  uuid, text, uuid, text, uuid, text
);
drop function if exists public.record_estimate_created_activity(uuid, uuid, text, text, uuid);
drop function if exists public.insert_estimate_activity_event(
  uuid, text, uuid, text, text, uuid, jsonb
);

drop table if exists public.estimate_activity_events;
drop function if exists public.prevent_estimate_activity_event_update();

notify pgrst, 'reload schema';
