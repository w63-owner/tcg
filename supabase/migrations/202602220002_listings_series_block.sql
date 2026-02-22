-- Persist explicit card identity fields from sell form.
alter table if exists public.listings
  add column if not exists card_series text;

alter table if exists public.listings
  add column if not exists card_block text;
