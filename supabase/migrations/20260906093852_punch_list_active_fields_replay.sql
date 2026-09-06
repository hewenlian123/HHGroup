-- The original punch-list extensions predated CREATE TABLE and skipped clean databases.
-- Restore only fields used by the current punch-list and site-photo workflows.
set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.punch_list
  add column if not exists notes text,
  add column if not exists description text,
  add column if not exists priority text not null default 'Medium',
  add column if not exists completed_at timestamptz,
  add column if not exists created_by uuid references public.workers(id) on delete set null,
  add column if not exists photo_id uuid references public.site_photos(id) on delete set null;

create index if not exists idx_punch_list_photo_id on public.punch_list(photo_id);

-- Match the existing extension's backfill without overwriting an authored description.
update public.punch_list
set description = notes
where description is null and notes is not null;
