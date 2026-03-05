-- Store listing title on transaction so it always displays (no RLS on join)
alter table public.transactions
  add column if not exists listing_title text;

comment on column public.transactions.listing_title is 'Listing title at time of purchase; used for display in orders/sales.';

-- Backfill from listings
update public.transactions t
set listing_title = l.title
from public.listings l
where l.id = t.listing_id and (t.listing_title is null or t.listing_title = '');

-- Update checkout function to set listing_title on insert
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

  if v_listing.status = 'ACTIVE' then
    null;
  elsif v_listing.status = 'RESERVED' and v_listing.reserved_for = v_buyer_id then
    null;
  else
    raise exception 'Listing is not available for you';
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
    status,
    listing_title
  )
  values (
    v_listing.id,
    v_buyer_id,
    v_listing.seller_id,
    round(coalesce(p_total_amount, 0)::numeric, 2),
    round(coalesce(p_fee_amount, 0)::numeric, 2),
    round(coalesce(p_shipping_cost, 0)::numeric, 2),
    'PENDING_PAYMENT',
    v_listing.title
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
