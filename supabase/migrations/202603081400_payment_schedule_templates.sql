-- Payment schedule templates: reusable milestone sets (e.g. "50% deposit, 50% on completion")
create table if not exists public.payment_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default ''
);

create table if not exists public.payment_schedule_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.payment_schedule_templates(id) on delete cascade,
  sort_order int not null default 0,
  title text not null default '',
  amount_type text not null check (amount_type in ('percent', 'fixed')),
  value numeric not null default 0,
  due_rule text not null default '',
  notes text null
);

create index if not exists payment_schedule_template_items_template_id_idx on public.payment_schedule_template_items (template_id);

alter table public.payment_schedule_templates enable row level security;
alter table public.payment_schedule_template_items enable row level security;

drop policy if exists payment_schedule_templates_select_all on public.payment_schedule_templates;
create policy payment_schedule_templates_select_all on public.payment_schedule_templates for select to anon using (true);
drop policy if exists payment_schedule_templates_insert_all on public.payment_schedule_templates;
create policy payment_schedule_templates_insert_all on public.payment_schedule_templates for insert to anon with check (true);
drop policy if exists payment_schedule_templates_update_all on public.payment_schedule_templates;
create policy payment_schedule_templates_update_all on public.payment_schedule_templates for update to anon using (true) with check (true);
drop policy if exists payment_schedule_templates_delete_all on public.payment_schedule_templates;
create policy payment_schedule_templates_delete_all on public.payment_schedule_templates for delete to anon using (true);

drop policy if exists payment_schedule_template_items_select_all on public.payment_schedule_template_items;
create policy payment_schedule_template_items_select_all on public.payment_schedule_template_items for select to anon using (true);
drop policy if exists payment_schedule_template_items_insert_all on public.payment_schedule_template_items;
create policy payment_schedule_template_items_insert_all on public.payment_schedule_template_items for insert to anon with check (true);
drop policy if exists payment_schedule_template_items_update_all on public.payment_schedule_template_items;
create policy payment_schedule_template_items_update_all on public.payment_schedule_template_items for update to anon using (true) with check (true);
drop policy if exists payment_schedule_template_items_delete_all on public.payment_schedule_template_items;
create policy payment_schedule_template_items_delete_all on public.payment_schedule_template_items for delete to anon using (true);
