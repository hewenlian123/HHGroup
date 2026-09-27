-- Only the verified server can call this RPC. Its existing live actor check needs
-- controlled Auth-table visibility; do not grant service_role direct auth.users access.
set lock_timeout = '5s';
set statement_timeout = '60s';
alter function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text) security definer;
alter function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text) set search_path = '';
alter function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text) owner to postgres;
revoke all on function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text) to service_role;
notify pgrst,'reload schema';
