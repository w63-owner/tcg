-- RLS: allow reserved buyer to read RESERVED listing (separate migration: enum value must exist in a committed transaction)
drop policy if exists listings_read_reserved_buyer on public.listings;
create policy listings_read_reserved_buyer on public.listings for select to authenticated
  using (status = 'RESERVED' and reserved_for = auth.uid());
