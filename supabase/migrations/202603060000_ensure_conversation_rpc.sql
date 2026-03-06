-- RPC: ensure conversation exists for (listing, buyer, seller).
-- Used by Stripe webhook after payment to link every paid purchase to a conversation.
-- Returns conversation id (existing or newly created).

create or replace function public.ensure_conversation_for_users(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if p_buyer_id = p_seller_id then
    raise exception 'buyer and seller must differ';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (p_listing_id, p_buyer_id, p_seller_id)
  on conflict (listing_id, buyer_id, seller_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

comment on function public.ensure_conversation_for_users(uuid, uuid, uuid) is
  'Ensures a conversation exists for the given listing/buyer/seller; returns its id. Used by webhook after payment.';

revoke all on function public.ensure_conversation_for_users(uuid, uuid, uuid) from public;
grant execute on function public.ensure_conversation_for_users(uuid, uuid, uuid) to authenticated;
grant execute on function public.ensure_conversation_for_users(uuid, uuid, uuid) to service_role;
