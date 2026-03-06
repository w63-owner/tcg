-- Allow buyer and seller to read the listing when they are in a conversation about it.
-- Fixes "Informations annonce indisponibles" on the conversation page when the listing is SOLD/LOCKED
-- and ensures the listing card always shows for conversation participants.
create policy listings_read_conversation_participant on public.listings
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.listing_id = id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );
