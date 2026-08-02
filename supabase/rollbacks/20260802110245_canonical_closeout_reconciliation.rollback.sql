-- Non-destructive application service-control rollback.
-- Run with: SET LOCAL hh.confirm_closeout_service_control_rollback = '20260802110245';
-- This deliberately retains canonical data/schema/RPC and never recreates legacy tables.

begin;

do $guard$
begin
  if current_setting('hh.confirm_closeout_service_control_rollback', true)
       is distinct from '20260802110245' then
    raise exception using
      errcode = 'P0001',
      message = 'closeout service-control rollback confirmation token is missing';
  end if;

  if pg_catalog.to_regclass('public.final_punch_lists') is null
     or pg_catalog.to_regclass('public.final_punch_list_items') is null
     or pg_catalog.to_regclass('public.warranties') is null
     or pg_catalog.to_regclass('public.completion_certificates') is null
     or pg_catalog.to_regprocedure(
          'public.replace_final_punch_list(uuid,date,text,text,text,text,jsonb)'
        ) is null then
    raise exception using errcode = 'P0001', message = 'canonical Closeout contract is incomplete';
  end if;

  if pg_catalog.to_regclass('public.project_closeout_punch') is not null
     or pg_catalog.to_regclass('public.project_closeout_warranty') is not null
     or pg_catalog.to_regclass('public.project_closeout_completion') is not null then
    raise exception using errcode = 'P0001', message = 'unexpected legacy Closeout relation exists';
  end if;
end
$guard$;

revoke execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) from public;
revoke execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) from anon;
revoke execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) from authenticated;
grant execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) to service_role;

revoke all privileges on table public.final_punch_lists from anon, authenticated, service_role;
revoke all privileges on table public.final_punch_list_items from anon, authenticated, service_role;
revoke all privileges on table public.warranties from anon, authenticated, service_role;
revoke all privileges on table public.completion_certificates from anon, authenticated, service_role;

grant select on table public.final_punch_lists, public.final_punch_list_items,
  public.warranties, public.completion_certificates to authenticated;
grant select, insert, update, delete on table public.final_punch_lists,
  public.warranties, public.completion_certificates to service_role;
grant select, insert, delete on table public.final_punch_list_items to service_role;

-- Intentionally left open for operator inspection. COMMIT only after local assertions.
