-- Batch RPC for messages list: return listing (id, title, cover_image_url) per conversation id when user is participant.
create or replace function public.get_listings_for_conversations(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  id uuid,
  title text,
  cover_image_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select c.id as conversation_id, l.id, l.title, l.cover_image_url
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  where c.id = any(p_conversation_ids)
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid());
end;
$$;

comment on function public.get_listings_for_conversations(uuid[]) is
  'Returns listings for many conversations when current user is participant. Used on messages list page.';

revoke all on function public.get_listings_for_conversations(uuid[]) from public;
grant execute on function public.get_listings_for_conversations(uuid[]) to authenticated;
