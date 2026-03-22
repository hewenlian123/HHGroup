-- Anon RLS for company_profile + branding when the app runs without Supabase Auth cookies
-- (e.g. middleware does not enforce login). Complements authenticated policies from 20260321120000.

do $body$
begin
  if to_regclass('public.company_profile') is null then
    raise notice 'company_profile: table missing, skip anon policies';
    return;
  end if;

  execute 'drop policy if exists company_profile_anon_select on public.company_profile';
  execute 'drop policy if exists company_profile_anon_insert on public.company_profile';
  execute 'drop policy if exists company_profile_anon_update on public.company_profile';

  execute $p$
    create policy company_profile_anon_select on public.company_profile
    for select to anon using (true)
  $p$;
  execute $p$
    create policy company_profile_anon_insert on public.company_profile
    for insert to anon with check (true)
  $p$;
  execute $p$
    create policy company_profile_anon_update on public.company_profile
    for update to anon using (true) with check (true)
  $p$;
end;
$body$;

drop policy if exists branding_anon_insert on storage.objects;
drop policy if exists branding_anon_update on storage.objects;
drop policy if exists branding_anon_delete on storage.objects;

create policy branding_anon_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'branding');

create policy branding_anon_update on storage.objects
  for update to anon
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');

create policy branding_anon_delete on storage.objects
  for delete to anon
  using (bucket_id = 'branding');
