-- Create public bucket for worker receipt uploads (anon can upload via API using service or if policies allow).
-- Adjust RLS/policies in Dashboard → Storage as needed.

insert into storage.buckets (id, name, public)
values ('worker-receipts', 'worker-receipts', true)
on conflict (id) do nothing;

-- Allow public read; insert via API uses anon key — add policy for anon insert if uploads fail.
drop policy if exists "worker_receipts_public_read" on storage.objects;
create policy "worker_receipts_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'worker-receipts');

drop policy if exists "worker_receipts_anon_insert" on storage.objects;
create policy "worker_receipts_anon_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'worker-receipts');
