create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type public.listing_status as enum ('DRAFT', 'ACTIVE', 'LOCKED', 'SOLD');
  end if;
  if not exists (select 1 from pg_type where typname = 'card_condition') then
    create type public.card_condition as enum ('MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'LIGHT_PLAYED', 'PLAYED', 'POOR');
  end if;
  if not exists (select 1 from pg_type where typname = 'grading_company') then
    create type public.grading_company as enum ('PSA', 'PCA', 'BGS', 'CGC', 'SGC', 'ACE', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'weight_class') then
    create type public.weight_class as enum ('XS', 'S', 'M', 'L', 'XL');
  end if;
  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type public.transaction_status as enum ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED');
  end if;
  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type public.offer_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type where typname = 'kyc_status') then
    create type public.kyc_status as enum ('UNVERIFIED', 'PENDING', 'REQUIRED', 'VERIFIED', 'REJECTED');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.map_grade_to_condition(p_grade numeric)
returns public.card_condition
language plpgsql
immutable
as $$
begin
  if p_grade >= 10 then return 'MINT';
  elsif p_grade >= 9 then return 'NEAR_MINT';
  elsif p_grade >= 8 then return 'EXCELLENT';
  elsif p_grade >= 7 then return 'GOOD';
  elsif p_grade >= 6 then return 'LIGHT_PLAYED';
  elsif p_grade >= 4 then return 'PLAYED';
  else return 'POOR';
  end if;
end;
$$;

create or replace function public.enforce_listing_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.is_graded then
    if new.grading_company is null or new.grade_note is null then
      raise exception 'For graded cards, grading_company and grade_note are required';
    end if;
    if new.grade_note < 1 or new.grade_note > 10 then
      raise exception 'grade_note must be between 1 and 10';
    end if;
    new.condition = public.map_grade_to_condition(new.grade_note);
  else
    if new.condition is null then
      raise exception 'condition is required when card is not graded';
    end if;
    new.grading_company = null;
    new.grade_note = null;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_offer_rules()
returns trigger
language plpgsql
as $$
declare
  v_count_today integer;
  v_display_price numeric(12,2);
begin
  select count(*) into v_count_today
  from public.offers o
  where o.buyer_id = new.buyer_id
    and o.created_at::date = now()::date;
  if v_count_today >= 10 then
    raise exception 'Daily offer limit reached (10/day)';
  end if;

  select l.display_price into v_display_price
  from public.listings l
  where l.id = new.listing_id
    and l.status = 'ACTIVE';
  if v_display_price is null then
    raise exception 'Offers are allowed only on ACTIVE listings';
  end if;
  if new.offer_amount < round((v_display_price * 0.70)::numeric, 2) then
    raise exception 'Offer too low';
  end if;
  if new.expires_at is null then
    new.expires_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 30),
  avatar_url text,
  country_code char(2) not null,
  stripe_account_id text,
  kyc_status public.kyc_status not null default 'UNVERIFIED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  pending_balance numeric(12,2) not null default 0 check (pending_balance >= 0),
  currency char(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards_ref (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  set_id text not null,
  image_url text,
  tcg_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  card_ref_id uuid references public.cards_ref(id) on delete set null,
  title text not null check (char_length(title) between 3 and 140),
  price_seller numeric(12,2) not null check (price_seller > 0),
  display_price numeric(12,2) generated always as (round((price_seller * 1.05 + 0.70)::numeric, 2)) stored,
  condition public.card_condition,
  is_graded boolean not null default false,
  grading_company public.grading_company,
  grade_note numeric(3,1),
  status public.listing_status not null default 'DRAFT',
  delivery_weight_class public.weight_class not null default 'S',
  cover_image_url text,
  back_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (grade_note is null or (grade_note >= 1 and grade_note <= 10))
);

create table if not exists public.shipping_matrix (
  id uuid primary key default gen_random_uuid(),
  origin_country char(2) not null,
  dest_country char(2) not null,
  weight_class public.weight_class not null,
  price numeric(12,2) not null check (price >= 0),
  currency char(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  unique (origin_country, dest_country, weight_class, currency)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  status public.transaction_status not null default 'PENDING_PAYMENT',
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expiration_date timestamptz not null default (now() + interval '24 hours'),
  check (buyer_id <> seller_id)
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  offer_amount numeric(12,2) not null check (offer_amount > 0),
  status public.offer_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.price_estimations (
  id uuid primary key default gen_random_uuid(),
  card_name text not null,
  set_name text not null,
  estimated_price numeric(12,2) not null check (estimated_price > 0),
  currency char(3) not null default 'EUR',
  source text not null default 'manual_seed',
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (card_name, set_name, currency)
);

create index if not exists idx_listings_status on public.listings(status);
create index if not exists idx_transactions_status_exp on public.transactions(status, expiration_date);
create index if not exists idx_offers_buyer_created on public.offers(buyer_id, created_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at before update on public.wallets for each row execute function public.set_updated_at();
drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at before update on public.listings for each row execute function public.set_updated_at();
drop trigger if exists trg_listings_consistency on public.listings;
create trigger trg_listings_consistency before insert or update on public.listings for each row execute function public.enforce_listing_consistency();
drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
drop trigger if exists trg_offers_updated_at on public.offers;
create trigger trg_offers_updated_at before update on public.offers for each row execute function public.set_updated_at();
drop trigger if exists trg_offers_rules on public.offers;
create trigger trg_offers_rules before insert on public.offers for each row execute function public.enforce_offer_rules();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.cards_ref enable row level security;
alter table public.listings enable row level security;
alter table public.shipping_matrix enable row level security;
alter table public.transactions enable row level security;
alter table public.offers enable row level security;
alter table public.price_estimations enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select to authenticated using (user_id = auth.uid());
drop policy if exists wallets_insert_own on public.wallets;
create policy wallets_insert_own on public.wallets for insert to authenticated with check (user_id = auth.uid());

drop policy if exists cards_ref_read_all on public.cards_ref;
create policy cards_ref_read_all on public.cards_ref for select to anon, authenticated using (true);

drop policy if exists listings_read_active on public.listings;
create policy listings_read_active on public.listings for select to anon, authenticated using (status = 'ACTIVE');
drop policy if exists listings_read_own on public.listings;
create policy listings_read_own on public.listings for select to authenticated using (seller_id = auth.uid());
drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings for insert to authenticated with check (seller_id = auth.uid());
drop policy if exists listings_update_own on public.listings;
create policy listings_update_own on public.listings for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());

drop policy if exists shipping_matrix_read_all on public.shipping_matrix;
create policy shipping_matrix_read_all on public.shipping_matrix for select to anon, authenticated using (true);

drop policy if exists transactions_read_participants on public.transactions;
create policy transactions_read_participants on public.transactions for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());
drop policy if exists transactions_insert_buyer on public.transactions;
create policy transactions_insert_buyer on public.transactions for insert to authenticated with check (buyer_id = auth.uid() and buyer_id <> seller_id);

drop policy if exists offers_read_buyer on public.offers;
create policy offers_read_buyer on public.offers for select to authenticated using (buyer_id = auth.uid());
drop policy if exists offers_read_seller on public.offers;
create policy offers_read_seller on public.offers for select to authenticated using (
  exists (select 1 from public.listings l where l.id = offers.listing_id and l.seller_id = auth.uid())
);
drop policy if exists offers_insert_buyer on public.offers;
create policy offers_insert_buyer on public.offers for insert to authenticated with check (buyer_id = auth.uid());
drop policy if exists offers_update_seller on public.offers;
create policy offers_update_seller on public.offers for update to authenticated using (
  exists (select 1 from public.listings l where l.id = offers.listing_id and l.seller_id = auth.uid())
) with check (
  exists (select 1 from public.listings l where l.id = offers.listing_id and l.seller_id = auth.uid())
);

drop policy if exists price_estimations_read_all on public.price_estimations;
create policy price_estimations_read_all on public.price_estimations for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.cards_ref to anon, authenticated;
grant select on public.shipping_matrix to anon, authenticated;
grant select on public.price_estimations to anon, authenticated;
grant select on public.listings to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert on public.wallets to authenticated;
grant select, insert, update, delete on public.listings to authenticated;
grant select, insert, update on public.offers to authenticated;
grant select, insert on public.transactions to authenticated;
