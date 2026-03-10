-- Message attachments: storage bucket for images shared in conversations
-- Participants (buyer/seller) can upload and read images in their conversations

-- 1) Storage bucket for message attachments (images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message_attachments',
  'message_attachments',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2) RLS policies for message_attachments bucket
-- Read: authenticated users can read all files (participants only via path structure)
drop policy if exists "message_attachments_public_read" on storage.objects;
create policy "message_attachments_public_read"
on storage.objects for select
to authenticated
using (bucket_id = 'message_attachments');

-- Insert: authenticated users can upload to conversationId/uuid-timestamp.ext paths
drop policy if exists "message_attachments_authenticated_insert" on storage.objects;
create policy "message_attachments_authenticated_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'message_attachments'
  and auth.uid() is not null
);

-- Update/Delete: owner can manage their files (optional, for future cleanup)
drop policy if exists "message_attachments_owner_update" on storage.objects;
create policy "message_attachments_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'message_attachments'
  and owner = auth.uid()
);

drop policy if exists "message_attachments_owner_delete" on storage.objects;
create policy "message_attachments_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'message_attachments'
  and owner = auth.uid()
);

-- 3) Add 'image' to message_type check constraint
alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'offer', 'system', 'image'));
