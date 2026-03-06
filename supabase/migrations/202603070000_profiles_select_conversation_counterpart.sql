-- Allow reading profile (e.g. username) of users we have a conversation with,
-- so the conversation thread can display the counterpart's pseudo.
create policy profiles_select_conversation_counterpart on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where (c.buyer_id = auth.uid() and c.seller_id = profiles.id)
         or (c.seller_id = auth.uid() and c.buyer_id = profiles.id)
    )
  );
