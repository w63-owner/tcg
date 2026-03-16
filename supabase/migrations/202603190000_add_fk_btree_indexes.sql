-- B-Tree indexes on all foreign keys for scale (100K+ users).
-- Speeds up JOINs, RLS checks, and CASCADE/SET NULL operations.
-- See initial_schema: listings(seller_id, card_ref_id), transactions(listing_id, buyer_id, seller_id), offers(listing_id, buyer_id).

-- listings: seller_id (RLS "my listings", lookups by seller), card_ref_id (filter by card, feed)
-- Note: listings_active_card_ref_id_idx exists as partial index for ACTIVE only; full index needed for all statuses.
create index if not exists idx_listings_seller_id on public.listings (seller_id);
create index if not exists idx_listings_card_ref_id on public.listings (card_ref_id);

-- transactions: listing_id (join to listing), buyer_id/seller_id (RLS participants)
create index if not exists idx_transactions_listing_id on public.transactions (listing_id);
create index if not exists idx_transactions_buyer_id on public.transactions (buyer_id);
create index if not exists idx_transactions_seller_id on public.transactions (seller_id);

-- offers: listing_id (join to listing, RLS subquery offers_read_seller/offers_update_seller)
-- buyer_id already covered by idx_offers_buyer_created (buyer_id, created_at desc)
create index if not exists idx_offers_listing_id on public.offers (listing_id);
