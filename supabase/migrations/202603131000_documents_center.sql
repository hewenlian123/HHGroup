-- Documents Center: canonical table for project files, receipts, PDFs, subcontract docs, etc.
-- Files are stored in Supabase Storage (attachments bucket). This table holds metadata only.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_path text not null,
  file_type text not null default 'Other',
  mime_type text,
  size_bytes bigint,
  project_id uuid references public.projects(id) on delete set null,
  related_module text,
  related_id uuid,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  notes text,
  constraint documents_file_type_check check (
    file_type in (
      'Contract', 'Estimate', 'Invoice', 'Receipt', 'Subcontract',
      'Permit', 'Photo', 'Daily Log', 'Other'
    )
  )
);

create index if not exists idx_documents_project_id on public.documents(project_id);
create index if not exists idx_documents_file_type on public.documents(file_type);
create index if not exists idx_documents_related on public.documents(related_module, related_id);
create index if not exists idx_documents_uploaded_at on public.documents(uploaded_at desc);
create index if not exists idx_documents_file_name_lower on public.documents(lower(file_name));

alter table public.documents enable row level security;
drop policy if exists documents_select_all on public.documents;
create policy documents_select_all on public.documents for select to anon using (true);
drop policy if exists documents_insert_all on public.documents;
create policy documents_insert_all on public.documents for insert to anon with check (true);
drop policy if exists documents_update_all on public.documents;
create policy documents_update_all on public.documents for update to anon using (true) with check (true);
drop policy if exists documents_delete_all on public.documents;
create policy documents_delete_all on public.documents for delete to anon using (true);

comment on table public.documents is 'Canonical document metadata; files stored in storage bucket (e.g. attachments).';
comment on column public.documents.file_path is 'Path within storage bucket for the file.';
comment on column public.documents.related_module is 'Optional source module e.g. change_order, expense, subcontractor.';
comment on column public.documents.related_id is 'Optional ID of the related entity.';
