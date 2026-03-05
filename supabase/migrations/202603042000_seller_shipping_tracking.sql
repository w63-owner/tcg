-- Phase 5: Seller shipping flow — SHIPPED status, tracking, shipped_at, optional shipping address
-- 1) Add SHIPPED to transaction_status
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'transaction_status' and e.enumlabel = 'SHIPPED'
  ) then
    alter type public.transaction_status add value 'SHIPPED';
  end if;
end
$$;

-- 2) Tracking and shipping timestamp on transactions
alter table public.transactions
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz;

comment on column public.transactions.tracking_number is 'Carrier tracking number set by seller when marking as shipped';
comment on column public.transactions.tracking_url is 'Optional tracking URL for the buyer';
comment on column public.transactions.shipped_at is 'When the seller marked the order as shipped';

-- 3) Optional shipping address snapshot (from checkout / buyer profile when available)
alter table public.transactions
  add column if not exists shipping_address_line text,
  add column if not exists shipping_address_city text,
  add column if not exists shipping_address_postcode text;

comment on column public.transactions.shipping_address_line is 'Buyer shipping address line (snapshot at checkout or from profile)';
comment on column public.transactions.shipping_address_city is 'Buyer shipping city';
comment on column public.transactions.shipping_address_postcode is 'Buyer shipping postcode';

-- 4) Allow seller to update their sales (status → SHIPPED, tracking, shipped_at)
grant update on public.transactions to authenticated;

drop policy if exists transactions_update_seller_shipping on public.transactions;
create policy transactions_update_seller_shipping on public.transactions
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());
