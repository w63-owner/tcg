-- Atomic checkout helpers:
-- 1) lock listing + create pending transaction
-- 2) cancel pending transaction + unlock listing

create or replace function public.create_pending_transaction_and_lock_listing(
  p_listing_id uuid,
  p_shipping_cost numeric,
  p_fee_amount numeric,
  p_total_amount numeric
)
returns table (
  transaction_id uuid,
  listing_id uuid,
  seller_id uuid,
  listing_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_listing public.listings%rowtype;
  v_transaction_id uuid;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing.seller_id = v_buyer_id then
    raise exception 'Cannot buy own listing';
  end if;

  if v_listing.status <> 'ACTIVE' then
    raise exception 'Listing is not available';
  end if;

  update public.listings
     set status = 'LOCKED',
         updated_at = now()
   where id = v_listing.id;

  insert into public.transactions (
    listing_id,
    buyer_id,
    seller_id,
    total_amount,
    fee_amount,
    shipping_cost,
    status
  )
  values (
    v_listing.id,
    v_buyer_id,
    v_listing.seller_id,
    round(coalesce(p_total_amount, 0)::numeric, 2),
    round(coalesce(p_fee_amount, 0)::numeric, 2),
    round(coalesce(p_shipping_cost, 0)::numeric, 2),
    'PENDING_PAYMENT'
  )
  returning id into v_transaction_id;

  return query
  select
    v_transaction_id as transaction_id,
    v_listing.id as listing_id,
    v_listing.seller_id as seller_id,
    v_listing.title as listing_title;
end;
$$;

create or replace function public.cancel_pending_transaction_and_unlock_listing(
  p_transaction_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_tx public.transactions%rowtype;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if v_tx.id is null then
    return false;
  end if;

  if v_tx.buyer_id <> v_buyer_id then
    raise exception 'Not allowed to cancel this transaction';
  end if;

  if v_tx.status <> 'PENDING_PAYMENT' then
    return false;
  end if;

  update public.transactions
     set status = 'CANCELLED',
         updated_at = now()
   where id = v_tx.id;

  update public.listings
     set status = 'ACTIVE',
         updated_at = now()
   where id = v_tx.listing_id
     and status = 'LOCKED';

  return true;
end;
$$;

create or replace function public.attach_checkout_session_to_transaction(
  p_transaction_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_tx public.transactions%rowtype;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if v_tx.id is null then
    return false;
  end if;

  if v_tx.buyer_id <> v_buyer_id then
    raise exception 'Not allowed to update this transaction';
  end if;

  if v_tx.status <> 'PENDING_PAYMENT' then
    return false;
  end if;

  update public.transactions
     set stripe_checkout_session_id = p_session_id,
         updated_at = now()
   where id = v_tx.id;

  return true;
end;
$$;

revoke all on function public.create_pending_transaction_and_lock_listing(uuid, numeric, numeric, numeric) from public;
grant execute on function public.create_pending_transaction_and_lock_listing(uuid, numeric, numeric, numeric) to authenticated;

revoke all on function public.cancel_pending_transaction_and_unlock_listing(uuid) from public;
grant execute on function public.cancel_pending_transaction_and_unlock_listing(uuid) to authenticated;

revoke all on function public.attach_checkout_session_to_transaction(uuid, text) from public;
grant execute on function public.attach_checkout_session_to_transaction(uuid, text) to authenticated;
