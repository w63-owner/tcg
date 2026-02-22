create extension if not exists pg_trgm;

create index if not exists listings_active_created_at_id_idx
  on public.listings (created_at desc, id desc)
  where status = 'ACTIVE';

create index if not exists listings_active_display_price_id_idx
  on public.listings (display_price asc, id asc)
  where status = 'ACTIVE';

create index if not exists listings_active_grade_note_id_idx
  on public.listings (grade_note asc, id asc)
  where status = 'ACTIVE';

create index if not exists listings_active_card_ref_id_idx
  on public.listings (card_ref_id)
  where status = 'ACTIVE';

create index if not exists favorite_listings_listing_id_idx
  on public.favorite_listings (listing_id);

create index if not exists tcgdex_cards_search_text_trgm_idx
  on public.tcgdex_cards
  using gin (
    (
      coalesce(name, '') || ' ' ||
      coalesce(set_id, '') || ' ' ||
      coalesce(set_name, '') || ' ' ||
      coalesce(id, '') || ' ' ||
      coalesce(local_id, '') || ' ' ||
      coalesce(language, '')
    ) gin_trgm_ops
  );

create or replace function public.get_favorite_listing_counts(listing_ids uuid[])
returns table (listing_id uuid, favorite_count bigint)
language sql
stable
as $$
  select
    fl.listing_id,
    count(*)::bigint as favorite_count
  from public.favorite_listings fl
  where fl.listing_id = any(listing_ids)
  group by fl.listing_id
$$;

grant execute on function public.get_favorite_listing_counts(uuid[]) to anon;
grant execute on function public.get_favorite_listing_counts(uuid[]) to authenticated;
