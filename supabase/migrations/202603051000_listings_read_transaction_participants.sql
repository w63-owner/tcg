-- Allow buyer and seller to read the listing when they have a transaction on it
-- (so listing title shows in Transactions / Mes ventes even when listing is LOCKED or SOLD)
drop policy if exists listings_read_transaction_participant on public.listings;
create policy listings_read_transaction_participant on public.listings
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.listing_id = id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );
