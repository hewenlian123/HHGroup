begin;

select plan(18);

select hasnt_table('public', 'material_selection_items', 'material selection items are dropped');
select hasnt_table('public', 'material_selections', 'material selections are dropped');
select hasnt_table('public', 'project_material_selections', 'project material selections are dropped');
select hasnt_table('public', 'material_catalog', 'material catalog is dropped');
select hasnt_table('public', 'punch_list', 'punch list is dropped');
select hasnt_table('public', 'site_photos', 'site photos are dropped');
select hasnt_table('public', 'inspection_log', 'inspection log is dropped');
select hasnt_table('public', 'inspection_logs', 'inspection logs are dropped');
select hasnt_table('public', 'project_tasks', 'project tasks are dropped');
select hasnt_table('public', 'project_schedule', 'project schedule is dropped');

select has_table('public', 'projects', 'projects remain');
select has_table('public', 'invoices', 'invoices remain');
select has_table('public', 'expenses', 'expenses remain');
select has_table('public', 'expense_lines', 'expense lines remain');
select has_table('public', 'labor_entries', 'labor entries remain');
select has_table('public', 'project_change_orders', 'change orders remain');
select has_table('public', 'documents', 'documents remain');
select has_function(
  'private',
  'can_read_project_document_object',
  array['text'],
  'document object authorization remains'
);

select * from finish();
rollback;
