-- RPC: return listing for a conversation when current user is buyer or seller.
-- Fallback when embed returns null on conversation page (RLS/embed). SECURITY DEFINER so listing is always returned for participants.
create or replace function public.get_listing_for_conversation(p_conversation_id uuid)
returns table (
  id uuid,
  title text,
  cover_image_url text,
  display_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select l.id, l.title, l.cover_image_url, l.display_price, l.status::text
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  where c.id = p_conversation_id
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid());
end;
$$;

comment on function public.get_listing_for_conversation(uuid) is
  'Returns listing for conversation when current user is participant. Used on conversation page when embed returns null.';

revoke all on function public.get_listing_for_conversation(uuid) from public;
grant execute on function public.get_listing_for_conversation(uuid) to authenticated;
