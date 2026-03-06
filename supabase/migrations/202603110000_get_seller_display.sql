-- Returns seller display info by profile id (same shape as get_listing_seller_display).
-- Used on favorites page for "Vendeurs favoris" cards.
create or replace function public.get_seller_display(p_seller_id uuid)
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
  from public.profiles p
  left join (
    select
      reviewee_id,
      count(*)::bigint as review_count,
      avg(rating)::numeric as rating_avg
    from public.reviews
    group by reviewee_id
  ) r on r.reviewee_id = p.id
  where p.id = p_seller_id;
$$;

comment on function public.get_seller_display(uuid) is
  'Returns seller id, username, avatar, review count, average rating and profile updated_at for display cards.';

revoke all on function public.get_seller_display(uuid) from public;
grant execute on function public.get_seller_display(uuid) to authenticated;
