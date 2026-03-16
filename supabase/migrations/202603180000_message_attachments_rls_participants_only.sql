-- Restrict message_attachments read access to conversation participants only.
-- Path format: conversationId/uuid-timestamp.ext → first path segment = conversation id.

-- 1) Set bucket to private so RLS is enforced on all access
update storage.buckets
set public = false
where id = 'message_attachments';

-- 2) Replace read policy: only buyer/seller of the conversation can read
drop policy if exists "message_attachments_public_read" on storage.objects;
create policy "message_attachments_participants_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message_attachments'
  and exists (
    select 1 from public.conversations c
    where c.id::text = split_part(name, '/', 1)
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);
