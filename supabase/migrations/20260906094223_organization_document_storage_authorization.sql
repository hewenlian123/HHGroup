-- Metadata binds every new private object to a DB-authorized organization/resource.
-- Old exact metadata remains readable; it cannot be copied or repointed to claim objects.
set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function private.document_object_path_matches(
  object_name text, org_id uuid, project_id uuid, document_id uuid
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case when project_id is null then
    array_length(string_to_array(object_name,'/'),1) = 5
    and split_part(object_name,'/',1) = 'organizations'
    and split_part(object_name,'/',2) = org_id::text
    and split_part(object_name,'/',3) = 'documents'
    and split_part(object_name,'/',4) = document_id::text
    and split_part(object_name,'/',5) not in ('','.','..')
  else
    array_length(string_to_array(object_name,'/'),1) = 7
    and split_part(object_name,'/',1) = 'organizations'
    and split_part(object_name,'/',2) = org_id::text
    and split_part(object_name,'/',3) = 'projects'
    and split_part(object_name,'/',4) = project_id::text
    and split_part(object_name,'/',5) = 'documents'
    and split_part(object_name,'/',6) = document_id::text
    and split_part(object_name,'/',7) not in ('','.','..')
  end,false);
$$;
create or replace function private.validate_document_object_binding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from storage.objects where bucket_id = 'attachments' and name = old.file_path) then
      raise exception 'Delete the private object before its document metadata' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.file_path is distinct from old.file_path
       or new.project_id is distinct from old.project_id then
      raise exception 'Document object binding cannot be reassigned' using errcode = '23514';
    end if;
    return new;
  end if;
  if not private.document_object_path_matches(new.file_path,new.organization_id,new.project_id,new.id) then
    raise exception 'Document path must match its organization, project and ID' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger document_object_binding before insert or update or delete on public.documents
  for each row execute function private.validate_document_object_binding();

create or replace function private.can_read_project_document_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.documents d
    where d.file_path = object_name and private.is_org_member(d.organization_id)
      and (d.project_id is null or exists (select 1 from public.projects p
        where p.id=d.project_id and p.organization_id=d.organization_id))
      and (private.document_object_path_matches(object_name,d.organization_id,d.project_id,d.id)
        or split_part(object_name,'/',1) <> 'organizations')
  );
$$;
create or replace function private.can_manage_document_object(object_name text, new_object boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare document_id uuid;
begin
  -- Lock metadata through the Storage transaction so concurrent deletion cannot orphan an upload.
  select d.id into document_id from public.documents d
  where auth.uid() is not null and d.file_path=object_name
    and private.is_org_admin(d.organization_id)
    and (d.project_id is null or exists (select 1 from public.projects p
      where p.id=d.project_id and p.organization_id=d.organization_id))
    and (private.document_object_path_matches(object_name,d.organization_id,d.project_id,d.id)
      or (not new_object and split_part(object_name,'/',1) <> 'organizations'))
  for key share of d;
  return document_id is not null;
end $$;
revoke all on function private.document_object_path_matches(text,uuid,uuid,uuid),
  private.validate_document_object_binding(),private.can_manage_document_object(text,boolean)
  from public,anon,authenticated;
grant execute on function private.can_manage_document_object(text,boolean) to authenticated;

insert into storage.buckets(id,name,public) values ('attachments','attachments',false)
  on conflict(id) do update set public=false;
-- Restrictive guards prevent any unrelated/future permissive bucket policy bypass.
create policy attachments_read_boundary on storage.objects as restrictive for select to public
  using (bucket_id <> 'attachments' or (auth.uid() is not null and private.can_read_project_document_object(name)));
create policy attachments_insert_boundary on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'attachments' or (auth.uid() is not null and private.can_manage_document_object(name,true)));
create policy attachments_update_boundary on storage.objects as restrictive for update to public
  using (bucket_id <> 'attachments') with check (bucket_id <> 'attachments');
create policy attachments_delete_boundary on storage.objects as restrictive for delete to public
  using (bucket_id <> 'attachments' or (auth.uid() is not null and private.can_manage_document_object(name,false)));
create policy attachments_member_read on storage.objects for select to authenticated
  using (bucket_id='attachments' and private.can_read_project_document_object(name));
create policy attachments_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id='attachments' and private.can_manage_document_object(name,true));
create policy attachments_admin_delete on storage.objects for delete to authenticated
  using (bucket_id='attachments' and private.can_manage_document_object(name,false));

-- Closeout reads follow the same organization roles; atomic mutation grants remain unchanged.
do $$
declare t text; rule text;
begin
  foreach t in array array['final_punch_lists','final_punch_list_items','completion_certificates','warranties'] loop
    rule := case when t='final_punch_list_items' then
      'exists (select 1 from public.final_punch_lists p where p.id=punch_list_id and private.can_access_project(p.project_id))'
      else 'private.can_access_project(project_id)' end;
    execute format('drop policy if exists "closeout projects.update read" on public.%I',t);
    execute format('create policy organization_member_read on public.%I for select to authenticated using (%s)',t,rule);
  end loop;
end $$;
notify pgrst,'reload schema';

-- Material image fields cannot be used to claim an existing legacy object from another tenant.
create or replace function private.material_image_reference_matches(reference text, object_name text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(object_name ~ '^[a-zA-Z0-9._/-]+$' and (
    reference = object_name
    or reference = '/api/materials/photo?path=' || replace(object_name,'/','%2F')
    or reference = '/api/materials/catalog/photo?path=' || replace(object_name,'/','%2F')
  ),false);
$$;
create or replace function private.validate_material_image_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reference text; old_reference text; org_id uuid;
begin
  if tg_table_name='material_catalog' then
    reference := new.photo_url;
    if tg_op='UPDATE' then old_reference := old.photo_url; end if;
    org_id := new.organization_id;
  else
    reference := new.image_url;
    if tg_op='UPDATE' then old_reference := old.image_url; end if;
    select organization_id into org_id from public.material_selections where id=new.selection_id;
  end if;
  if reference is null or reference='' or (tg_op='UPDATE' and reference is not distinct from old_reference)
    or reference ~ '^https?://' then return new; end if;
  if not exists (select 1 from public.documents d where d.organization_id=org_id
    and private.document_object_path_matches(d.file_path,d.organization_id,d.project_id,d.id)
    and private.material_image_reference_matches(reference,d.file_path)) then
    raise exception 'Material image must reference an authorized organization document' using errcode='23514';
  end if;
  return new;
end $$;
create trigger material_catalog_image_binding before insert or update on public.material_catalog
  for each row execute function private.validate_material_image_reference();
create trigger material_selection_image_binding before insert or update on public.material_selection_items
  for each row execute function private.validate_material_image_reference();
create or replace function private.can_read_legacy_material_image(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.material_catalog m where private.is_org_member(m.organization_id)
      and private.material_image_reference_matches(m.photo_url,object_name))
    or exists(select 1 from public.material_selection_items i join public.material_selections s on s.id=i.selection_id
      where private.is_org_member(s.organization_id) and private.material_image_reference_matches(i.image_url,object_name))
  );
$$;
revoke all on function private.material_image_reference_matches(text,text),
  private.validate_material_image_reference(),private.can_read_legacy_material_image(text)
  from public,anon,authenticated;
grant execute on function private.can_read_legacy_material_image(text) to authenticated;
update storage.buckets set public=false where id='material-images';
create policy material_images_read_boundary on storage.objects as restrictive for select to public
  using(bucket_id <> 'material-images' or (auth.uid() is not null and private.can_read_legacy_material_image(name)));
create policy material_images_member_read on storage.objects for select to authenticated
  using(bucket_id='material-images' and private.can_read_legacy_material_image(name));
create policy material_images_no_new_objects on storage.objects as restrictive for insert to public
  with check(bucket_id <> 'material-images');
create policy material_images_no_object_replacement on storage.objects as restrictive for update to public
  using(bucket_id <> 'material-images') with check(bucket_id <> 'material-images');
create policy material_images_no_object_removal on storage.objects as restrictive for delete to public
  using(bucket_id <> 'material-images');
notify pgrst,'reload schema';

-- Project photo proxies use the same metadata-first private attachment lifecycle.
create or replace function private.validate_project_photo_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.photo_url is null or new.photo_url='' or new.photo_url ~ '^https?://'
    or (tg_op='UPDATE' and new.photo_url is not distinct from old.photo_url) then return new; end if;
  if not exists(select 1 from public.documents d join public.projects p on p.id=new.project_id
    where d.file_path=new.photo_url and d.project_id=p.id and d.organization_id=p.organization_id
      and private.document_object_path_matches(d.file_path,d.organization_id,d.project_id,d.id)) then
    raise exception 'Project photo must reference its authorized project document' using errcode='23514';
  end if;
  return new;
end $$;
create trigger site_photo_document_binding before insert or update on public.site_photos
  for each row execute function private.validate_project_photo_reference();
create trigger punch_photo_document_binding before insert or update on public.punch_list
  for each row execute function private.validate_project_photo_reference();
create or replace function private.can_read_project_document_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.documents d
      where d.file_path=object_name and private.is_org_member(d.organization_id)
        and (d.project_id is null or exists(select 1 from public.projects p where p.id=d.project_id and p.organization_id=d.organization_id))
        and (private.document_object_path_matches(object_name,d.organization_id,d.project_id,d.id)
          or split_part(object_name,'/',1) <> 'organizations'))
    or (split_part(object_name,'/',1) <> 'organizations' and exists(
      select 1 from public.site_photos s where s.photo_url=object_name and private.can_access_project(s.project_id)))
  );
$$;
create or replace function private.can_read_legacy_punch_photo(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.punch_list p
    where p.photo_url=object_name and private.can_access_project(p.project_id));
$$;
revoke all on function private.validate_project_photo_reference(),private.can_read_legacy_punch_photo(text)
  from public,anon,authenticated;
grant execute on function private.can_read_legacy_punch_photo(text) to authenticated;
update storage.buckets set public=false where id='punch-photos';
create policy punch_photos_read_boundary on storage.objects as restrictive for select to public
  using(bucket_id <> 'punch-photos' or (auth.uid() is not null and private.can_read_legacy_punch_photo(name)));
create policy punch_photos_member_read on storage.objects for select to authenticated
  using(bucket_id='punch-photos' and private.can_read_legacy_punch_photo(name));
create policy punch_photos_no_new_objects on storage.objects as restrictive for insert to public
  with check(bucket_id <> 'punch-photos');
create policy punch_photos_no_object_replacement on storage.objects as restrictive for update to public
  using(bucket_id <> 'punch-photos') with check(bucket_id <> 'punch-photos');
create policy punch_photos_no_object_removal on storage.objects as restrictive for delete to public
  using(bucket_id <> 'punch-photos');
notify pgrst,'reload schema';

-- Commission receipt access is intentionally server-mediated: verified user, DB project
-- membership, exact commission/payment/path association, then a narrow privileged operation.
update storage.buckets set public=false where id in ('commission-receipts','commission-payment-receipts');
create policy commission_receipts_server_boundary on storage.objects as restrictive for all to public
  using(bucket_id not in ('commission-receipts','commission-payment-receipts'))
  with check(bucket_id not in ('commission-receipts','commission-payment-receipts'));
