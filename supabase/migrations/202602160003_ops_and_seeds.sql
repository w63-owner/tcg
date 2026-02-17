-- ============================================================
-- Ops hardening: cron helpers, storage policies, and MVP seeds
-- ============================================================

-- 1) Auto-expire locked transactions (>24h) and relist listing
create or replace function public.release_expired_locked_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with expired_tx as (
    update public.transactions t
       set status = 'EXPIRED',
           updated_at = now()
     where t.status = 'PENDING_PAYMENT'
       and t.expiration_date < now()
    returning t.listing_id
  ),
  unlocked as (
    update public.listings l
       set status = 'ACTIVE',
           updated_at = now()
     where l.status = 'LOCKED'
       and l.id in (select listing_id from expired_tx)
    returning l.id
  )
  select count(*) into v_count from unlocked;

  return v_count;
end;
$$;

revoke all on function public.release_expired_locked_transactions() from public;
grant execute on function public.release_expired_locked_transactions() to authenticated;

-- 2) Auto-expire pending offers (>24h)
create or replace function public.expire_pending_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.offers
     set status = 'EXPIRED',
         updated_at = now()
   where status = 'PENDING'
     and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_pending_offers() from public;
grant execute on function public.expire_pending_offers() to authenticated;

-- 3) Storage bucket for listing photos (safe if already exists)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- RLS for storage.objects
drop policy if exists "listing_images_public_read" on storage.objects;
create policy "listing_images_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'listing-images');

drop policy if exists "listing_images_owner_insert" on storage.objects;
create policy "listing_images_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "listing_images_owner_update" on storage.objects;
create policy "listing_images_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'listing-images'
  and owner = auth.uid()
)
with check (
  bucket_id = 'listing-images'
  and owner = auth.uid()
);

drop policy if exists "listing_images_owner_delete" on storage.objects;
create policy "listing_images_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and owner = auth.uid()
);

-- 4) Minimal shipping matrix (FR-centric MVP)
insert into public.shipping_matrix (origin_country, dest_country, weight_class, price, currency)
values
  ('FR', 'FR', 'XS', 2.49, 'EUR'),
  ('FR', 'FR', 'S', 2.99, 'EUR'),
  ('FR', 'FR', 'M', 3.99, 'EUR'),
  ('FR', 'FR', 'L', 4.99, 'EUR'),
  ('FR', 'FR', 'XL', 5.99, 'EUR'),
  ('FR', 'BE', 'XS', 6.49, 'EUR'),
  ('FR', 'BE', 'S', 6.99, 'EUR'),
  ('FR', 'BE', 'M', 7.99, 'EUR'),
  ('FR', 'BE', 'L', 8.99, 'EUR'),
  ('FR', 'BE', 'XL', 9.99, 'EUR'),
  ('BE', 'FR', 'XS', 6.49, 'EUR'),
  ('BE', 'FR', 'S', 6.99, 'EUR'),
  ('BE', 'FR', 'M', 7.99, 'EUR'),
  ('BE', 'FR', 'L', 8.99, 'EUR'),
  ('BE', 'FR', 'XL', 9.99, 'EUR'),
  ('FR', 'ES', 'XS', 7.49, 'EUR'),
  ('FR', 'ES', 'S', 7.99, 'EUR'),
  ('FR', 'ES', 'M', 8.99, 'EUR'),
  ('FR', 'ES', 'L', 9.99, 'EUR'),
  ('FR', 'ES', 'XL', 10.99, 'EUR')
on conflict (origin_country, dest_country, weight_class, currency)
do update set price = excluded.price;

-- 5) Price checking seed (50 cards)
insert into public.price_estimations (card_name, set_name, estimated_price, currency, source)
values
  ('Charizard', 'Base Set', 320.00, 'EUR', 'manual_seed'),
  ('Charizard ex', 'Obsidian Flames', 45.00, 'EUR', 'manual_seed'),
  ('Charizard VMAX', 'Shining Fates', 120.00, 'EUR', 'manual_seed'),
  ('Charizard GX', 'Hidden Fates', 310.00, 'EUR', 'manual_seed'),
  ('Pikachu Illustrator', 'Promo', 150000.00, 'EUR', 'manual_seed'),
  ('Pikachu VMAX', 'Vivid Voltage', 18.00, 'EUR', 'manual_seed'),
  ('Pikachu', 'Scarlet & Violet Promo', 12.00, 'EUR', 'manual_seed'),
  ('Mewtwo GX', 'Shining Legends', 35.00, 'EUR', 'manual_seed'),
  ('Mew VMAX', 'Fusion Strike', 22.00, 'EUR', 'manual_seed'),
  ('Mew ex', '151', 14.00, 'EUR', 'manual_seed'),
  ('Lugia V', 'Silver Tempest', 175.00, 'EUR', 'manual_seed'),
  ('Lugia', 'Neo Genesis', 180.00, 'EUR', 'manual_seed'),
  ('Rayquaza VMAX', 'Evolving Skies', 260.00, 'EUR', 'manual_seed'),
  ('Rayquaza GX', 'Hidden Fates', 95.00, 'EUR', 'manual_seed'),
  ('Umbreon VMAX', 'Evolving Skies', 780.00, 'EUR', 'manual_seed'),
  ('Eevee GX', 'SM Promo', 16.00, 'EUR', 'manual_seed'),
  ('Sylveon VMAX', 'Evolving Skies', 165.00, 'EUR', 'manual_seed'),
  ('Espeon VMAX', 'Fusion Strike', 145.00, 'EUR', 'manual_seed'),
  ('Gengar VMAX', 'Fusion Strike', 215.00, 'EUR', 'manual_seed'),
  ('Dragonite V', 'Evolving Skies', 110.00, 'EUR', 'manual_seed'),
  ('Blastoise', 'Base Set', 125.00, 'EUR', 'manual_seed'),
  ('Venusaur', 'Base Set', 95.00, 'EUR', 'manual_seed'),
  ('Alakazam ex', '151', 10.00, 'EUR', 'manual_seed'),
  ('Gardevoir ex', 'Paldean Fates', 13.00, 'EUR', 'manual_seed'),
  ('Lucario VSTAR', 'Crown Zenith', 9.00, 'EUR', 'manual_seed'),
  ('Arceus VSTAR', 'Brilliant Stars', 16.00, 'EUR', 'manual_seed'),
  ('Giratina V', 'Lost Origin', 245.00, 'EUR', 'manual_seed'),
  ('Origin Forme Dialga VSTAR', 'Astral Radiance', 12.00, 'EUR', 'manual_seed'),
  ('Origin Forme Palkia VSTAR', 'Astral Radiance', 11.00, 'EUR', 'manual_seed'),
  ('Machamp V', 'Astral Radiance', 120.00, 'EUR', 'manual_seed'),
  ('Snorlax VMAX', 'Sword & Shield', 15.00, 'EUR', 'manual_seed'),
  ('Gyarados ex', 'Scarlet & Violet', 8.00, 'EUR', 'manual_seed'),
  ('Tyranitar V', 'Battle Styles', 105.00, 'EUR', 'manual_seed'),
  ('Zapdos ex', '151', 9.00, 'EUR', 'manual_seed'),
  ('Galarian Moltres V', 'Chilling Reign', 145.00, 'EUR', 'manual_seed'),
  ('Galarian Articuno V', 'Chilling Reign', 60.00, 'EUR', 'manual_seed'),
  ('Raichu', 'Base Set', 32.00, 'EUR', 'manual_seed'),
  ('Dark Charizard', 'Team Rocket', 210.00, 'EUR', 'manual_seed'),
  ('Ancient Mew', 'Promo', 42.00, 'EUR', 'manual_seed'),
  ('Suicune V', 'Crown Zenith', 21.00, 'EUR', 'manual_seed'),
  ('Entei V', 'Crown Zenith', 18.00, 'EUR', 'manual_seed'),
  ('Raikou V', 'Crown Zenith', 19.00, 'EUR', 'manual_seed'),
  ('Greninja ex', 'Twilight Masquerade', 14.00, 'EUR', 'manual_seed'),
  ('Roaring Moon ex', 'Paradox Rift', 13.00, 'EUR', 'manual_seed'),
  ('Iron Valiant ex', 'Paradox Rift', 12.00, 'EUR', 'manual_seed'),
  ('Chien-Pao ex', 'Paldea Evolved', 17.00, 'EUR', 'manual_seed'),
  ('Miraidon ex', 'Scarlet & Violet', 15.00, 'EUR', 'manual_seed'),
  ('Koraidon ex', 'Scarlet & Violet', 11.00, 'EUR', 'manual_seed'),
  ('Chi-Yu ex', 'Paldea Evolved', 10.00, 'EUR', 'manual_seed'),
  ('Terapagos ex', 'Stellar Crown', 24.00, 'EUR', 'manual_seed')
on conflict (card_name, set_name, currency)
do update set
  estimated_price = excluded.estimated_price,
  source = excluded.source,
  last_updated_at = now();
