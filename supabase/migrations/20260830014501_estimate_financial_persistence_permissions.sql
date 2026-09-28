-- The authenticated Estimate Server Action uses the existing server-only
-- service_role client. Keep this SECURITY INVOKER RPC unreachable from browser,
-- anon, or authenticated PostgREST sessions, without changing any table grants.

-- Keep this as one PostgreSQL command because the HH-pinned Supabase CLI
-- v2.75 cannot split a FUNCTION-signature GRANT/REVOKE batch reliably.
do $permissions$
begin
  execute 'revoke all on function public.update_estimate_meta_atomic(uuid, jsonb) from public';
  execute 'revoke all on function public.update_estimate_meta_atomic(uuid, jsonb) from anon';
  execute 'revoke all on function public.update_estimate_meta_atomic(uuid, jsonb) from authenticated';
  execute 'revoke all on function public.update_estimate_meta_atomic(uuid, jsonb) from service_role';
  execute 'grant execute on function public.update_estimate_meta_atomic(uuid, jsonb) to service_role';
  perform pg_catalog.pg_notify('pgrst', 'reload schema');
end
$permissions$;
