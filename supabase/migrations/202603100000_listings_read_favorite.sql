-- Allow users to read listing details when the listing is in their favorites.
-- Fixes "Annonce --.-- € · UNKNOWN" on /favorites when the listing is no longer ACTIVE
-- (e.g. SOLD, LOCKED, EXPIRED) so title, price and status still display.
create policy listings_read_favorite on public.listings
  for select to authenticated
  using (
    exists (
      select 1 from public.favorite_listings fl
      where fl.listing_id = id and fl.user_id = auth.uid()
    )
  );
