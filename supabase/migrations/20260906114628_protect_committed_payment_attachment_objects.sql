-- A committed payment receipt must be detached from its metadata before its object can be removed.
-- The controlled definer lookup sees references independently of the caller's RLS visibility.
create function private.payment_attachment_is_referenced(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists(select 1 from public.payment_received_attachments a where a.file_url = object_name)
      or exists(select 1 from public.payments_received p where p.attachment_url = object_name)
$$;
revoke all on function private.payment_attachment_is_referenced(text) from public, anon;
grant execute on function private.payment_attachment_is_referenced(text) to authenticated;

create policy committed_payment_attachment_delete_boundary
on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'payment-attachments' or not private.payment_attachment_is_referenced(name));
