begin;
set local timezone = 'UTC';
select no_plan();
select has_column('public', 'punch_list', 'notes', 'notes exists');
select col_type_is('public', 'punch_list', 'notes', 'text', 'notes preserves its type');
select col_type_is('public', 'punch_list', 'description', 'text', 'description preserves its type');
select col_type_is('public', 'punch_list', 'priority', 'text', 'priority preserves its type');
select col_not_null('public', 'punch_list', 'priority', 'priority remains required');
select col_type_is('public', 'punch_list', 'completed_at', 'timestamp with time zone', 'completed_at preserves its type');
select col_type_is('public', 'punch_list', 'created_by', 'uuid', 'created_by preserves its type');
select col_type_is('public', 'punch_list', 'photo_id', 'uuid', 'photo_id preserves its type');

create temporary table punch_fixture as select private.company_organization_id() org_id, gen_random_uuid() project_id, gen_random_uuid() worker_id, gen_random_uuid() photo_id, gen_random_uuid() item_id;
insert into public.projects(id, name, organization_id) select project_id, '[E2E] Punch field fixture', org_id from punch_fixture;
insert into public.workers(id, name) select worker_id, '[E2E] Punch field fixture' from punch_fixture;
insert into public.site_photos(id, project_id, photo_url) select photo_id, project_id, 'https://example.invalid/punch-field-fixture.jpg' from punch_fixture;
insert into public.punch_list(id, project_id, issue, notes, description, created_by, photo_id)
  select item_id, project_id, '[E2E] Punch field fixture', 'Keep original note', 'Keep independent description', worker_id, photo_id from punch_fixture;
select is((select priority from public.punch_list where id=(select item_id from punch_fixture)), 'Medium', 'new items use the existing Medium priority');
update public.punch_list set status='completed', completed_at='2026-09-06T00:00:00Z' where id=(select item_id from punch_fixture);
select is((select jsonb_build_array(notes,description,status,completed_at) from public.punch_list where id=(select item_id from punch_fixture)), '["Keep original note","Keep independent description","completed","2026-09-06T00:00:00+00:00"]'::jsonb, 'notes, description and completion timestamp persist independently');
select throws_ok($$update public.punch_list set photo_id='00000000-0000-4000-8000-000000000001' where id=(select item_id from punch_fixture)$$, '23503', null, 'unknown site photo is rejected');
select throws_ok($$update public.punch_list set created_by='00000000-0000-4000-8000-000000000001' where id=(select item_id from punch_fixture)$$, '23503', null, 'created_by remains a worker reference');
delete from public.site_photos where id=(select photo_id from punch_fixture);
select is((select photo_id from public.punch_list where id=(select item_id from punch_fixture)), null::uuid, 'deleting a photo retains its punch item');
delete from public.workers where id=(select worker_id from punch_fixture);
select is((select created_by from public.punch_list where id=(select item_id from punch_fixture)), null::uuid, 'deleting a creator retains its punch item');
select * from finish();
rollback;
