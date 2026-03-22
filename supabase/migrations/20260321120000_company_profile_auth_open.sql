-- Company Profile + branding (no role_permissions). ASCII-only comments for safe copy-paste.

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = excluded.public;

do $body$
begin
  if to_regclass('public.company_profile') is null then
    raise notice 'company_profile: table missing, skip RLS policies';
    return;
  end if;

  execute 'alter table public.company_profile enable row level security';

  execute 'drop policy if exists "company_profile_select_all" on public.company_profile';
  execute 'drop policy if exists "company_profile_insert_all" on public.company_profile';
  execute 'drop policy if exists "company_profile_update_all" on public.company_profile';

  execute 'drop policy if exists company_profile_perm_select on public.company_profile';
  execute 'drop policy if exists company_profile_perm_insert on public.company_profile';
  execute 'drop policy if exists company_profile_perm_update on public.company_profile';
  execute 'drop policy if exists company_profile_perm_delete on public.company_profile';

  execute 'drop policy if exists company_profile_auth_select on public.company_profile';
  execute 'drop policy if exists company_profile_auth_insert on public.company_profile';
  execute 'drop policy if exists company_profile_auth_update on public.company_profile';
  execute 'drop policy if exists company_profile_auth_delete on public.company_profile';

  execute $p$
    create policy company_profile_auth_select on public.company_profile
    for select to authenticated using (true)
  $p$;
  execute $p$
    create policy company_profile_auth_insert on public.company_profile
    for insert to authenticated with check (true)
  $p$;
  execute $p$
    create policy company_profile_auth_update on public.company_profile
    for update to authenticated using (true) with check (true)
  $p$;
  execute $p$
    create policy company_profile_auth_delete on public.company_profile
    for delete to authenticated using (true)
  $p$;
end;
$body$;

drop policy if exists branding_insert_anon on storage.objects;
drop policy if exists branding_update_anon on storage.objects;
drop policy if exists branding_delete_anon on storage.objects;
drop policy if exists branding_insert_auth on storage.objects;
drop policy if exists branding_update_auth on storage.objects;
drop policy if exists branding_delete_auth on storage.objects;
drop policy if exists branding_authenticated_insert on storage.objects;
drop policy if exists branding_authenticated_update on storage.objects;
drop policy if exists branding_authenticated_delete on storage.objects;

create policy branding_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding');

create policy branding_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');

create policy branding_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding');

drop policy if exists branding_select_public on storage.objects;

create policy branding_select_public on storage.objects
  for select to public
  using (bucket_id = 'branding');
