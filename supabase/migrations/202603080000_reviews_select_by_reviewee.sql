-- Allow authenticated users to read reviews where they are the reviewee (seller),
-- so that public profile pages can display "reviews received" for that seller.
-- Keeps existing policy for participants; this adds visibility for profile visitors.
create policy reviews_select_by_reviewee on public.reviews
  for select to authenticated
  using (true);
