-- Returns seller display info for a listing (profile + review stats).
-- Used on listing page for the "Auteur de l'annonce" encart.
-- Runs as definer so anon users can see seller name/avatar when viewing a listing.
create or replace function public.get_listing_seller_display(p_listing_id uuid)
returns table (
  id uuid,
  username text,
  avatar_url text,
  review_count bigint,
  rating_avg numeric,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    p.avatar_url,
    coalesce(r.review_count, 0)::bigint as review_count,
    round(coalesce(r.rating_avg, 0)::numeric, 1) as rating_avg,
    p.updated_at
  from public.listings l
  join public.profiles p on p.id = l.seller_id
  left join (
    select
      reviewee_id,
      count(*)::bigint as review_count,
      avg(rating)::numeric as rating_avg
    from public.reviews
    group by reviewee_id
  ) r on r.reviewee_id = p.id
  where l.id = p_listing_id;
$$;

comment on function public.get_listing_seller_display(uuid) is
  'Returns seller id, username, avatar, review count, average rating and profile updated_at for listing page encart.';

revoke all on function public.get_listing_seller_display(uuid) from public;
grant execute on function public.get_listing_seller_display(uuid) to anon, authenticated;
